import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LlamaEngine, defaultLlamaDeps, findModel, findVariants, pinnedModel } from './llama';

/**
 * Runs the REAL built-in engine with the REAL model, so it is off unless you ask for it:
 *   HOOPS_REAL_LLAMA=1 npx vitest run desktop/realLlama
 * It needs the engine and the model in build/ (npm run desktop:engine, npm run desktop:model).
 * It uses a spare port and never touches Ollama or any other program.
 */
const platformKey = `${{ win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform as 'win32' | 'darwin' | 'linux']}-${process.arch}`;
const ORIGIN = 'http://127.0.0.1:38417';
const deps = defaultLlamaDeps({
  engineRoots: [path.join('build', 'engine', platformKey)],
  modelDirs: [{ dir: path.join('build', 'models'), source: 'with-app' }],
  allowedOrigin: ORIGIN,
});
const model = pinnedModel('gemma-4-12b')!;
const ready = !!process.env.HOOPS_REAL_LLAMA && findVariants(deps).length > 0 && !!findModel(deps, model);

/** How many llama-server processes are running on this computer right now (Windows). */
const serverProcesses = () => (process.platform === 'win32' ? execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' }).split('\n').filter((l) => l.toLowerCase().startsWith('"llama-server')).length : 0);

describe.skipIf(!ready)('the real built-in engine', () => {
  it('loads the model, answers a game-shaped request, only trusts the game’s page, and leaves nothing behind', async () => {
    const before = serverProcesses();
    const engine = new LlamaEngine(deps);
    expect((await engine.status('gemma-4-12b')).state).toBe('not-running');

    const t0 = Date.now();
    const s = await engine.start('gemma-4-12b');
    console.log(`REAL: ${s.state} on ${s.engineVariant} after ${((Date.now() - t0) / 1000).toFixed(1)}s${s.error ? ` (${s.error})` : ''}`);
    expect(s.error).toBeUndefined();
    expect(s.state).toBe('ready');
    expect(s.weStarted).toBe(true);

    // a request shaped like the game's own: JSON mode, thinking switched off
    const t1 = Date.now();
    const res = await fetch(`${s.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({
        model: s.requestModel,
        max_tokens: 300,
        reasoning_effort: 'none',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are the narrator of a basketball career game. Respond with ONE JSON object and nothing else.' },
          { role: 'user', content: 'Return {"title":"<3 words>","narration":"<one sentence>"} for a freshman at his first practice.' },
        ],
      }),
    });
    const body = (await res.json()) as { choices: { message: { content: string; reasoning_content?: string }; finish_reason: string }[] };
    const content = body.choices[0].message.content;
    console.log(`REAL: reply in ${((Date.now() - t1) / 1000).toFixed(1)}s, finish=${body.choices[0].finish_reason}, reasoning=${(body.choices[0].message.reasoning_content ?? '').length} chars, content=${content.slice(0, 160)}`);
    expect(res.status).toBe(200);
    expect(content.length).toBeGreaterThan(5); // not empty: thinking did not eat the whole budget
    const parsed = JSON.parse(content) as { title?: string; narration?: string };
    expect(typeof parsed.narration).toBe('string');
    expect(body.choices[0].message.reasoning_content ?? '').toBe('');

    // the browser check: the game's own page is allowed, a stranger's page is not
    const preflight = (origin: string) => fetch(`${s.baseUrl}/chat/completions`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    const ours = await preflight(ORIGIN);
    expect(ours.status).toBeLessThan(300);
    expect(ours.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const stranger = await preflight('https://evil.example');
    expect(stranger.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
    expect(stranger.headers.get('access-control-allow-origin')).not.toBe('*');

    // it has no web page of its own, and it listens only on this computer
    expect((await fetch(`${s.baseUrl.replace('/v1', '')}/`)).status).not.toBe(200);
    expect(s.baseUrl.startsWith('http://127.0.0.1:')).toBe(true);

    expect(await engine.warm('gemma-4-12b')).toBe(true);

    engine.stop();
    await new Promise((r) => setTimeout(r, 2000));
    expect((await engine.status('gemma-4-12b')).running).toBe(false);
    expect(serverProcesses()).toBe(before);
  }, 600_000);
});
