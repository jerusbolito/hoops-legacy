import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PullProgress } from '../src/desktop/bridge';
import { Engine, defaultDeps } from './engine';
import { LlamaEngine, defaultLlamaDeps } from './llama';
import { SIMULATIONS, isSimulation, simulatedDeps, simulatedLlamaDeps } from './simulate';

describe('simulated engine states', () => {
  it('recognises only the states it knows', () => {
    for (const s of SIMULATIONS) expect(isSimulation(s)).toBe(true);
    expect(isSimulation('nope')).toBe(false);
    expect(isSimulation(undefined)).toBe(false);
  });

  it('"no-ollama" looks like a computer with nothing installed', async () => {
    const s = await new Engine(simulatedDeps('no-ollama', defaultDeps())).status('gemma4:12b');
    expect(s).toMatchObject({ state: 'no-ollama', running: false, ollamaPath: null, hasModel: false });
  });

  it('"missing-model" looks like Ollama running with some other model', async () => {
    const s = await new Engine(simulatedDeps('missing-model', defaultDeps())).status('gemma4:12b');
    expect(s).toMatchObject({ state: 'missing-model', running: true, hasModel: false, models: ['qwen3:8b'] });
    // and it is ready for a model it does have
    expect((await new Engine(simulatedDeps('missing-model', defaultDeps())).status('qwen3:8b')).state).toBe('ready');
  });

  describe('built-in engine states', () => {
    const base = () => defaultLlamaDeps({ engineRoots: [path.join(os.tmpdir(), 'hoops-sim-engine')], modelDirs: [{ dir: path.join(os.tmpdir(), 'hoops-sim-models'), source: 'downloaded' }], allowedOrigin: 'http://127.0.0.1:38417' });

    it('"bundled-no-engine" looks like a copy of the game missing its engine', async () => {
      expect(await new LlamaEngine(simulatedLlamaDeps('bundled-no-engine', base())).status('gemma-4-12b')).toMatchObject({ state: 'no-engine', provider: 'bundled' });
    });

    it('"bundled-missing" has the engine but no model, and can never start a real engine', async () => {
      const engine = new LlamaEngine(simulatedLlamaDeps('bundled-missing', base()));
      expect(await engine.status('gemma-4-12b')).toMatchObject({ state: 'missing-model', hasModel: false });
      const started = await engine.start('gemma-4-12b');
      expect(started.state).toBe('missing-model'); // start() refuses without a model, so nothing is spawned
      expect(engine.weStarted).toBe(false);
    });

    it('"bundled-downloading" reports progress, never touches the network, and stops when cancelled', async () => {
      const deps = simulatedLlamaDeps('bundled-downloading', base());
      deps.fetch = () => Promise.reject(new Error('the simulation must not use the network'));
      const engine = new LlamaEngine(deps);
      const seen: PullProgress[] = [];
      const run = engine.pull('gemma-4-12b', (p) => seen.push(p));
      await new Promise((r) => setTimeout(r, 80));
      expect(seen.at(-1)).toMatchObject({ percent: 41, done: false });
      engine.cancelPull();
      await expect(run).rejects.toThrow(/abort/i);
    });
  });

  it('"downloading" reports progress and then waits until it is cancelled', async () => {
    const engine = new Engine(simulatedDeps('downloading', defaultDeps()));
    const seen: PullProgress[] = [];
    const run = engine.pull('gemma4:12b', (p) => seen.push(p));
    await new Promise((r) => setTimeout(r, 100));
    expect(seen.at(-1)).toMatchObject({ percent: 36, done: false });
    engine.cancelPull();
    await expect(run).rejects.toThrow();
  });
});
