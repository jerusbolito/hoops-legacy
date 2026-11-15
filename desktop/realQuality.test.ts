import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyEffects, SCENE_CAPS } from '../src/engine/effects';
import { createCareer, createUserGameSim, finishUserGame } from '../src/engine/career';
import { lifeRefs, resolveLifeEvent } from '../src/engine/lifeEvents';
import { RNG } from '../src/engine/rng';
import { playUntil } from '../src/engine/testkit';
import { withRng } from '../src/engine/career';
import { createClient } from '../src/llm/client';
import { configFromPreset, presetById } from '../src/llm/presets';
import type { ChatRequest, LLMClient } from '../src/llm/types';
import { generateRecap, generateScene, generateSeasonSummary, narrateResult, resolveScene } from '../src/narrative/narrator';
import { sceneSetupPrompt } from '../src/narrative/prompts';
import { fullContext } from '../src/narrative/context';
import { pickScene } from '../src/narrative/scenes';
import type { GameState } from '../src/state/schemas';
import { LlamaEngine, defaultLlamaDeps, findModel, findVariants, pinnedModel } from './llama';

/**
 * STORY QUALITY BY MODEL. Runs a real model through the game's real prompts and records how it does, so the choice of
 * which models to offer rests on evidence. Off unless asked:
 *
 *   HOOPS_QUALITY=gemma-4-e4b,gemma-4-e2b npx vitest run desktop/realQuality
 *   HOOPS_QUALITY=gemma-4-e2b HOOPS_QUALITY_CPU=1 npx vitest run desktop/realQuality     (forces the no-graphics-card engine)
 *
 * It needs the engine in build/engine and each model in build/models (npm run desktop:engine, node scripts/fetch-model.mjs <id>).
 * It writes quality-report/<model>[-cpu].json: a summary, and every output so a person can read the stories themselves.
 */
const MODELS = (process.env.HOOPS_QUALITY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const CPU_ONLY = process.env.HOOPS_QUALITY_CPU === '1';
const platformKey = `${{ win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform as 'win32' | 'darwin' | 'linux']}-${process.arch}`;
const ORIGIN = 'http://127.0.0.1:38417';
const appData = process.env.APPDATA ? path.join(process.env.APPDATA, 'hoops-legacy', 'models') : '';

function engineRoot(): string {
  const real = path.resolve('build', 'engine', platformKey);
  if (!CPU_ONLY) return real;
  // an engine folder holding only the CPU build, so the graphics-card build is never tried
  const tmp = path.join(os.tmpdir(), `hoops-cpu-engine-${process.pid}`);
  // copied once and reused: on Windows a just-stopped engine can still hold its files for a moment
  if (!existsSync(path.join(tmp, 'cpu'))) {
    mkdirSync(tmp, { recursive: true });
    cpSync(path.join(real, 'cpu'), path.join(tmp, 'cpu'), { recursive: true });
  }
  return tmp;
}

const deps = () => defaultLlamaDeps({ engineRoots: [engineRoot()], modelDirs: [{ dir: path.resolve('build', 'models'), source: 'with-app' }, ...(appData ? [{ dir: appData, source: 'downloaded' as const }] : [])], allowedOrigin: ORIGIN });

/** Video memory in use right now, in MB (NVIDIA only). Null if it cannot be read. */
function vramUsedMB(): number | null {
  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 5000 });
    return Math.max(...out.split('\n').map((l) => Number(l.trim())).filter((n) => Number.isFinite(n) && n > 0));
  } catch {
    return null;
  }
}

interface Trial {
  label: string;
  kind: string;
  seconds: number;
  /** How many requests it took: more than one means the model needed a repair round. */
  requests: number;
  source: 'ai' | 'template';
  error?: string;
  /** Things that look wrong even when the JSON was valid. */
  flags: string[];
  output: Record<string, unknown>;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const LEAK = /(npc|ath|team|save|ripple|arc)_(?=[a-z0-9]*\d)[a-z0-9]{4,}/i;
const PRONOUN = /\b(he|him|his|she|her|hers)\b/i;

function scenario(level: 'hs' | 'college' | 'pro', seed: number, until: (s: GameState) => boolean): GameState {
  const s = createCareer({ firstName: 'Test', lastName: `Player${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: ['clutch'], seed });
  playUntil(s, new RNG(seed + 5), (x) => x.career.level === level && until(x) && !x.career.lifeEvent);
  return s;
}

describe.skipIf(!MODELS.length)('story quality by model', () => {
  for (const id of MODELS) {
    it(
      `${id}${CPU_ONLY ? ' (CPU only)' : ''}`,
      async () => {
        const d = deps();
        const m = pinnedModel(id);
        if (!m || !findModel(d, m) || !findVariants(d).length) throw new Error(`${id}: the engine or the model file is missing (see the notes at the top of this file)`);
        const engine = new LlamaEngine(d);
        const vramBefore = vramUsedMB();
        const t0 = Date.now();
        const s0 = await engine.start(id);
        expect(s0.error, s0.error).toBeUndefined();
        expect(s0.state).toBe('ready');
        const loadSeconds = (Date.now() - t0) / 1000;
        await engine.warm(id);
        const vramAfter = vramUsedMB();

        let requests = 0;
        const inner = createClient({ ...configFromPreset(presetById('bundled'), s0.apiKey, s0.requestModel), baseUrl: s0.baseUrl, fastReplies: true });
        const client: LLMClient = {
          config: inner.config,
          listModels: () => inner.listModels(),
          chat: (req: ChatRequest) => {
            requests++;
            return inner.chat(req);
          },
        };

        const trials: Trial[] = [];
        const run = async <T,>(label: string, kind: string, fn: () => Promise<{ source: 'ai' | 'template'; error?: string; flags?: string[]; output: Record<string, unknown>; value?: T }>) => {
          const before = requests;
          const t = performance.now();
          let r;
          try {
            r = await fn();
          } catch (e) {
            r = { source: 'template' as const, error: String((e as Error).message), flags: ['threw'], output: {} };
          }
          trials.push({ label, kind, seconds: Math.round((performance.now() - t) / 100) / 10, requests: requests - before, source: r.source, error: r.error, flags: r.flags ?? [], output: r.output });
          return r as typeof r & { value?: T };
        };

        // ── scenes: set up, pick a choice, resolve ──
        const states: [string, GameState][] = [
          ['HS sophomore', scenario('hs', 11, (x) => x.career.phase === 'regular' && x.career.year === 2 && x.career.week >= 4 && x.career.step === 'training')],
          ['College sophomore', scenario('college', 12, (x) => x.career.phase === 'regular' && x.career.year === 2 && x.career.week >= 4 && x.career.step === 'training')],
          ['Pro', scenario('pro', 13, (x) => x.career.phase === 'regular' && x.career.week >= 4 && x.career.step === 'training')],
        ];
        for (const [name, st] of states) {
          for (let k = 0; k < (CPU_ONLY ? 2 : 4); k++) {
            const plan = withRng(st, (rng) => pickScene(st, new RNG(rng.int(1, 1e9) + k * 977)));
            const castNames = plan.castIds.map((cid) => st.npcs[cid]?.name).filter(Boolean) as string[];
            const scene = await run(`${name}: ${plan.kind}`, 'scene', async () => {
              const r = await generateScene(client, st, plan);
              const flags: string[] = [];
              const text = `${r.setup.title} ${r.setup.narration} ${r.setup.choices.map((c) => c.text).join(' ')}`;
              if (r.setup.choices.length < 2 || r.setup.choices.length > 4) flags.push(`${r.setup.choices.length} choices`);
              if (new Set(r.setup.choices.map((c) => c.text.toLowerCase())).size < r.setup.choices.length) flags.push('duplicate choices');
              if (LEAK.test(text)) flags.push('leaks an internal id');
              if (words(r.setup.narration) < 25) flags.push('narration under 25 words');
              if (castNames.length && !castNames.some((n) => text.includes(n.split(' ')[0]))) flags.push('names none of the cast');
              return { source: r.source, error: r.error, flags: r.source === 'ai' ? flags : [], output: { plan: plan.kind, cast: castNames, ...r.setup }, value: r };
            });
            const setup = (scene.value as { setup: { choices: { text: string; tone: string }[] } } | undefined)?.setup;
            if (!setup) continue;
            const choice = setup.choices[k % setup.choices.length];
            await run(`${name}: ${plan.kind} → "${choice.text.slice(0, 40)}"`, 'resolve', async () => {
              const r = await resolveScene(client, st, plan, setup as Parameters<typeof resolveScene>[3], choice);
              const flags: string[] = [];
              if (r.source === 'ai') {
                if (words(r.narration) < 20) flags.push('narration under 20 words');
                if (!r.summary.trim()) flags.push('empty summary');
                if (r.invalidEffects > 0) flags.push(`${r.invalidEffects} invalid effects dropped`);
                if (LEAK.test(r.narration)) flags.push('leaks an internal id');
                if (r.effects.length === 0) flags.push('no effects at all');
                const copy = structuredClone(st);
                const applied = applyEffects(copy, r.effects, 'quality', SCENE_CAPS, new RNG(1));
                if (applied.rejected.length) flags.push(`engine rejected ${applied.rejected.length}`);
              }
              return { source: r.source, error: r.error, flags, output: { narration: r.narration, summary: r.summary, effects: r.effects, hook: r.hook } };
            });
          }
        }

        // ── game recaps, with the box score's real numbers to get right ──
        for (const [name, st] of states) {
          const g = createUserGameSim(st);
          if (!g) continue;
          g.sim.runToEnd();
          const report = finishUserGame(st, g.sim, g.game);
          await run(`${name}: game recap`, 'recap', async () => {
            const r = await generateRecap(client, st, report, st.lastBox!.box);
            const flags: string[] = [];
            if (r.source === 'ai' && words(r.narration) < 20) flags.push('narration under 20 words');
            return { source: r.source, error: r.error, flags, output: { headline: r.headline, narration: r.narration, score: `${report.teamScore}-${report.oppScore}` } };
          });
        }

        // ── season summaries ──
        const season = scenario('hs', 14, (x) => x.career.phase === 'offseason');
        await run('HS season summary', 'summary', async () => {
          const r = await generateSeasonSummary(client, season);
          const flags: string[] = [];
          if (words(r.summary) < 15) flags.push('summary under 15 words');
          // the template summary is short and plain; an AI one that is not distinguishable still counts as AI
          return { source: r.summary.includes('went ') && r.summary.length < 120 && !r.career ? 'template' : 'ai', flags, output: { ...r } };
        });

        // ── retelling the engine's own results, with the numbers kept ──
        const st = states[0][1];
        st.career.lifeEvent = { id: 'found_wallet', seed: 9, refs: lifeRefs(st) };
        const life = withRng(st, (rng) => resolveLifeEvent(st, rng, 'return'))!;
        const facts: [string, string, string][] = [
          [life.title, life.choice, life.text],
          ['Newspaper lead story', '', 'Westbrook High fell to Eastgate High, 48-43, at home. Tony Baker finished with 4 points, 0 rebounds and 1 assist on 2-of-3 shooting.'],
          ['You transferred', '', 'Alex Rivera transfers from Westbrook High to Oak Hill Christian, looking for more minutes. Signing package +$2,500.'],
        ];
        for (const [title, choice, text] of facts) {
          await run(`retell: ${title}`, 'retell', async () => {
            const told = await narrateResult(client, st, title, choice, text);
            const flags: string[] = [];
            if (told !== text) {
              if (PRONOUN.test(told) && !PRONOUN.test(text)) flags.push('guessed a gender');
              if (/\bhe (chose|moved|joined)|joins your team|you transferred/i.test(told) && /transfers from/.test(text)) flags.push('may have swapped who moved');
            }
            return { source: told !== text ? 'ai' : 'template', flags, output: { facts: text, told } };
          });
        }

        // ── raw speed on a real scene prompt ──
        const plan = pickScene(states[0][1], new RNG(7));
        const raw = await fetch(`${s0.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
          body: JSON.stringify({ model: s0.requestModel, max_tokens: 700, reasoning_effort: 'none', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: sceneSetupPrompt(fullContext(states[0][1], plan.castIds), plan.kind, plan.brief) }] }),
        });
        const rawBody = (await raw.json()) as { usage?: { prompt_tokens: number; completion_tokens: number }; timings?: { prompt_per_second: number; predicted_per_second: number } };
        const vramPeak = vramUsedMB();
        engine.stop();

        const ai = trials.filter((t) => t.source === 'ai');
        const sec = trials.map((t) => t.seconds).sort((a, b) => a - b);
        const summary = {
          model: id,
          engine: s0.engineVariant,
          cpuOnly: CPU_ONLY,
          fileGB: Math.round((m.bytes / 1e9) * 100) / 100,
          loadSeconds: Math.round(loadSeconds * 10) / 10,
          vramMB: vramBefore !== null && vramPeak !== null ? vramPeak - vramBefore : null,
          vramAfterLoadMB: vramBefore !== null && vramAfter !== null ? vramAfter - vramBefore : null,
          promptTokens: rawBody.usage?.prompt_tokens,
          completionTokens: rawBody.usage?.completion_tokens,
          promptTokensPerSecond: rawBody.timings ? Math.round(rawBody.timings.prompt_per_second) : null,
          tokensPerSecond: rawBody.timings ? Math.round(rawBody.timings.predicted_per_second * 10) / 10 : null,
          trials: trials.length,
          aiRate: Math.round((ai.length / trials.length) * 100),
          firstTryRate: Math.round((trials.filter((t) => t.source === 'ai' && t.requests === 1).length / trials.length) * 100),
          flaggedRate: Math.round((trials.filter((t) => t.flags.length).length / trials.length) * 100),
          secondsMedian: sec[Math.floor(sec.length / 2)],
          secondsP90: sec[Math.floor(sec.length * 0.9)],
          byKind: Object.fromEntries(['scene', 'resolve', 'recap', 'summary', 'retell'].map((k) => [k, `${trials.filter((t) => t.kind === k && t.source === 'ai').length}/${trials.filter((t) => t.kind === k).length} ai`])),
          failures: trials.filter((t) => t.source === 'template' && t.kind !== 'retell').map((t) => `${t.label}: ${t.error ?? '?'}`.slice(0, 160)),
          flags: [...new Set(trials.flatMap((t) => t.flags))],
        };
        mkdirSync('quality-report', { recursive: true });
        writeFileSync(path.join('quality-report', `${id}${CPU_ONLY ? '-cpu' : ''}.json`), JSON.stringify({ summary, trials }, null, 2));
        console.log(`QUALITY ${JSON.stringify(summary)}`);
        expect(existsSync(path.join('quality-report', `${id}${CPU_ONLY ? '-cpu' : ''}.json`))).toBe(true);
      },
      3_600_000,
    );
  }
});
