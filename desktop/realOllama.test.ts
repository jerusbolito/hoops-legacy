import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { Engine, defaultDeps, findOllama, isUp } from './engine';

/**
 * Runs the real Ollama program, so it is off unless you ask for it:
 *   HOOPS_REAL_OLLAMA=1 npx vitest run desktop/realOllama
 * It starts its own copy on a spare port and never touches an Ollama you already have running.
 */
const exe = findOllama({ platform: process.platform, env: process.env, exists: existsSync });
const enabled = !!process.env.HOOPS_REAL_OLLAMA && !!exe;

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

/** How many Ollama processes are running on this computer right now (Windows). */
function ollamaProcessCount(): number {
  const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return out.split('\n').filter((l) => l.toLowerCase().startsWith('"ollama')).length;
}

describe.skipIf(!enabled)('the real Ollama program', () => {
  it('is started by the engine on a spare port, loads a model, and leaves nothing behind when stopped', async () => {
    const port = await freePort();
    const deps = { ...defaultDeps(), baseUrl: `http://127.0.0.1:${port}` };
    const engine = new Engine(deps);
    const before = process.platform === 'win32' ? ollamaProcessCount() : 0;

    const status = await engine.start('nomic-embed-text', 40_000);
    expect(status.running).toBe(true);
    expect(status.weStarted).toBe(true);
    expect(await isUp(deps)).toBe(true);

    // load a small model so Ollama launches its helper process, the one that holds a model in memory
    if (status.models.some((m) => m.startsWith('nomic-embed-text'))) {
      const r = await fetch(`${deps.baseUrl}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'nomic-embed-text', input: 'hello' }) });
      expect(r.ok).toBe(true);
    }

    engine.stop();
    for (let i = 0; i < 40 && (await isUp(deps, 300)); i++) await new Promise((r) => setTimeout(r, 250));
    expect(await isUp(deps, 300)).toBe(false);
    expect(engine.weStarted).toBe(false);
    if (process.platform === 'win32') {
      await new Promise((r) => setTimeout(r, 1500));
      expect(ollamaProcessCount()).toBe(before);
    }
  }, 120_000);
});
