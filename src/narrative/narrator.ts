import type { ZodType, ZodTypeDef } from 'zod';
import { chatWithRetry } from '../llm/client';
import { LLMError, type ChatMessage, type LLMClient } from '../llm/types';
import type { GameReport } from '../engine/career';
import { userAthlete } from '../engine/career';
import { shortName } from '../engine/ratings';
import { fmt1, lineSummary, seasonAverages } from '../engine/stats';
import type { BoxScore, Effect, GameState, PlayerLine } from '../state/schemas';
import { fullContext, teamLabel } from './context';
import {
  FlavorSchema,
  RecapSchema,
  SceneResolveSchema,
  SceneSetupSchema,
  SummarySchema,
  extractJson,
  findStatViolations,
  parseEffects,
  type AllowedNumbers,
  type SceneSetup,
} from './parse';
import { SYSTEM_PROMPT, flavorPrompt, recapPrompt, sceneResolvePrompt, sceneSetupPrompt, seasonSummaryPrompt } from './prompts';
import type { ScenePlan } from './scenes';
import { templateResolution, templateScene } from './templates';

export type Source = 'ai' | 'template';

export interface NarrationMeta {
  source: Source;
  error?: string;
}

/**
 * Ask for JSON, validate with zod, and give the model one chance to repair its
 * own output using the validation error. `check` can add semantic validation.
 */
async function askJson<T>(
  client: LLMClient,
  prompt: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  opts: { maxTokens?: number; signal?: AbortSignal; check?: (v: T) => string | null } = {},
): Promise<T> {
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await chatWithRetry(client, { system: SYSTEM_PROMPT, messages, json: true, maxTokens: opts.maxTokens, signal: opts.signal });
    try {
      const parsed = schema.parse(extractJson(text));
      const problem = opts.check?.(parsed);
      if (!problem) return parsed;
      lastErr = problem;
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 400) : String(e);
    }
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: `That response was not valid: ${lastErr}\nReturn ONLY the corrected JSON object.` });
  }
  throw new LLMError(`Invalid response after repair attempt: ${lastErr}`, 'bad_request');
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

const isLive = (client: LLMClient | null): client is LLMClient => !!client && client.config.kind !== 'mock';

/* ───────────────────────── Scenes ───────────────────────── */

export async function generateScene(client: LLMClient | null, state: GameState, plan: ScenePlan, signal?: AbortSignal): Promise<{ setup: SceneSetup } & NarrationMeta> {
  if (!isLive(client)) return { setup: templateScene(state, plan, state.career.week), source: 'template' };
  try {
    const setup = await askJson(client, sceneSetupPrompt(fullContext(state, plan.castIds), plan.kind, plan.brief), SceneSetupSchema, { signal });
    setup.choices = setup.choices.slice(0, 4).map((c, i) => ({ ...c, id: String.fromCharCode(97 + i) }));
    return { setup, source: 'ai' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { setup: templateScene(state, plan, state.career.week), source: 'template', error: errMsg(e) };
  }
}

export interface SceneResolution extends NarrationMeta {
  narration: string;
  summary: string;
  effects: Effect[];
  invalidEffects: number;
}

export async function resolveScene(
  client: LLMClient | null,
  state: GameState,
  plan: ScenePlan,
  setup: SceneSetup,
  choice: { text: string; tone: string },
  signal?: AbortSignal,
): Promise<SceneResolution> {
  if (!isLive(client)) return { ...templateResolution(plan, choice.tone, choice.text), invalidEffects: 0, source: 'template' };
  try {
    const r = await askJson(client, sceneResolvePrompt(fullContext(state, plan.castIds), setup, choice.text), SceneResolveSchema, { signal });
    const { effects, invalid } = parseEffects(r.effects);
    return { narration: r.narration, summary: r.summary, effects, invalidEffects: invalid, source: 'ai' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { ...templateResolution(plan, choice.tone, choice.text), invalidEffects: 0, source: 'template', error: errMsg(e) };
  }
}

/* ───────────────────────── Game recap ───────────────────────── */

function allowedNumbers(box: BoxScore): AllowedNumbers {
  const sets: AllowedNumbers = { pts: new Set(), reb: new Set(), ast: new Set(), stl: new Set(), blk: new Set(), scores: [box.home.score, box.away.score] };
  for (const t of [box.home, box.away]) {
    sets.pts.add(t.score);
    for (const l of t.players) {
      sets.pts.add(l.pts);
      sets.reb.add(l.orb + l.drb);
      sets.ast.add(l.ast);
      sets.stl.add(l.stl);
      sets.blk.add(l.blk);
    }
  }
  return sets;
}

function topLines(state: GameState, lines: PlayerLine[], n: number): string[] {
  return [...lines]
    .filter((l) => l.sec > 0)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, n)
    .map((l) => {
      const a = state.athletes[l.athleteId];
      return `${a ? shortName(a) : '?'}: ${lineSummary(l)}`;
    });
}

export interface Recap extends NarrationMeta {
  headline: string;
  narration: string;
  effects: Effect[];
}

export function templateRecap(state: GameState, report: GameReport): Recap {
  const opp = teamLabel(state, report.oppId);
  const me = userAthlete(state);
  const l = report.line;
  const verdict = report.won ? 'take care of business against' : 'fall to';
  const headline = report.won ? `${state.teams[state.career.teamId].mascot} top ${state.teams[report.oppId].mascot}, ${report.teamScore}-${report.oppScore}` : `${state.teams[report.oppId].mascot} edge ${state.teams[state.career.teamId].mascot}, ${report.oppScore}-${report.teamScore}`;
  const body = l && l.sec > 0
    ? `You ${verdict} the ${opp}, ${report.teamScore}-${report.oppScore}. ${me.lastName} finishes with ${lineSummary(l)}.`
    : `You watch from the bench in street clothes as your team ${report.won ? 'beats' : 'loses to'} the ${opp}, ${report.teamScore}-${report.oppScore}.`;
  return { headline, narration: body, effects: [], source: 'template' };
}

export async function generateRecap(client: LLMClient | null, state: GameState, report: GameReport, box: BoxScore, signal?: AbortSignal): Promise<Recap> {
  if (!isLive(client)) return templateRecap(state, report);
  const isHome = box.home.teamId === state.career.teamId;
  const ours = isHome ? box.home : box.away;
  const theirs = isHome ? box.away : box.home;
  const facts = {
    header: `${report.roundName ? `${report.roundName}. ` : ''}FINAL: ${teamLabel(state, ours.teamId)} ${ours.score}, ${teamLabel(state, theirs.teamId)} ${theirs.score} (${report.won ? 'WIN' : 'LOSS'}). Quarter scores: ${ours.quarters.join('/')} vs ${theirs.quarters.join('/')}.${report.injury ? ` You suffered a ${report.injury}.` : ''}`,
    userLine: report.line && report.line.sec > 0 ? `${lineSummary(report.line)} in ${Math.round(report.line.sec / 60)} minutes` : 'did not play',
    ourTop: topLines(state, ours.players, 3),
    theirTop: topLines(state, theirs.players, 2),
    moments: report.moments.map((m) => `${m.clutch ? 'CLUTCH ' : ''}Q${m.quarter}: chose "${m.optionLabel}" → ${m.success ? 'SUCCESS' : 'FAILED'}. ${m.text}`),
  };
  const allowed = allowedNumbers(box);
  try {
    const r = await askJson(client, recapPrompt(fullContext(state, []), facts), RecapSchema, {
      signal,
      check: (v) => {
        const bad = findStatViolations(`${v.headline} ${v.narration}`, allowed);
        return bad.length ? `These numbers do not match the box score: ${bad.join(', ')}. Use only numbers from GAME FACTS or none at all.` : null;
      },
    });
    const { effects } = parseEffects(r.effects);
    const allowedTypes = new Set(['rel', 'morale', 'reputation', 'followers', 'memory', 'flag']);
    return { headline: r.headline, narration: r.narration, effects: effects.filter((e) => allowedTypes.has(e.type)), source: 'ai' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { ...templateRecap(state, report), error: errMsg(e) };
  }
}

/* ───────────────────────── Season summary & flavor ───────────────────────── */

export async function generateSeasonSummary(client: LLMClient | null, state: GameState): Promise<string> {
  const season = state.career.season;
  const avg = seasonAverages(state.gameLog, season);
  const standing = state.league.standings[state.career.teamId];
  const awards = state.player.awards.filter((a) => a.season === season).map((a) => a.name);
  const facts = [
    `Team: ${teamLabel(state, state.career.teamId)}, record ${standing?.w ?? 0}-${standing?.l ?? 0}. Champion: ${state.league.champion ? teamLabel(state, state.league.champion) : 'n/a'}.`,
    `Your averages: ${fmt1(avg.ppg)} ppg, ${fmt1(avg.rpg)} rpg, ${fmt1(avg.apg)} apg over ${avg.gp} games.`,
    awards.length ? `Awards: ${awards.join(', ')}.` : 'No awards.',
    'Story beats this season:',
    ...state.story.log.filter((e) => e.season === season).map((e) => `- ${e.title}: ${e.summary}`),
  ].join('\n');
  const fallback = `${teamLabel(state, state.career.teamId)} went ${standing?.w ?? 0}-${standing?.l ?? 0}; you averaged ${fmt1(avg.ppg)} ppg.${awards.length ? ` Awards: ${awards.join(', ')}.` : ''}`;
  if (!isLive(client)) return fallback;
  try {
    const r = await askJson(client, seasonSummaryPrompt(fullContext(state, []), facts), SummarySchema, { maxTokens: 4000 });
    return r.summary;
  } catch {
    return fallback;
  }
}

export async function narrateFlavor(client: LLMClient | null, state: GameState, situation: string, fallback: string, focusIds: string[] = []): Promise<string> {
  if (!isLive(client)) return fallback;
  try {
    const r = await askJson(client, flavorPrompt(fullContext(state, focusIds), situation), FlavorSchema, { maxTokens: 4000 });
    return r.narration;
  } catch {
    return fallback;
  }
}
