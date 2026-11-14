import type { EngineDeps } from './engine';
import type { LlamaDeps } from './llama';

/**
 * Pretend engine states, so the first-run screens a new player sees can be built, tested and photographed on a
 * computer that already has everything installed. Only the self-check uses these; they are never active in the game.
 * None of them can start a real engine or download a real file.
 */
export type Simulation = 'no-ollama' | 'missing-model' | 'downloading' | 'bundled-missing' | 'bundled-downloading' | 'bundled-no-engine';

export const SIMULATIONS: Simulation[] = ['no-ollama', 'missing-model', 'downloading', 'bundled-missing', 'bundled-downloading', 'bundled-no-engine'];
export const isSimulation = (s: string | undefined): s is Simulation => SIMULATIONS.includes(s as Simulation);
export const isBundledSimulation = (s: Simulation) => s.startsWith('bundled-');

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** An Ollama download that reports some progress and then never finishes, until it is cancelled. */
function hangingPull(signal?: AbortSignal | null): Response {
  const enc = new TextEncoder();
  const line = (o: object) => enc.encode(JSON.stringify(o) + '\n');
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(line({ status: 'pulling manifest' }));
      c.enqueue(line({ status: 'pulling 6a0746a1ec1a', digest: 'sha256:6a07', total: 8_400_000_000, completed: 3_100_000_000 }));
      signal?.addEventListener('abort', () => c.error(new DOMException('The operation was aborted.', 'AbortError')));
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

/** Ollama states. */
export function simulatedDeps(kind: Simulation, base: EngineDeps): EngineDeps {
  const isEngine = (u: RequestInfo | URL) => String(u).startsWith(base.baseUrl);
  if (kind === 'no-ollama') {
    return {
      ...base,
      exists: () => false,
      fetch: async (u, init) => {
        if (isEngine(u)) throw new TypeError('fetch failed');
        return base.fetch(u, init);
      },
    };
  }
  // an engine that is running and has some other model, but not the one the game wants
  return {
    ...base,
    exists: () => true,
    fetch: async (u, init) => {
      if (!isEngine(u)) return base.fetch(u, init);
      const s = String(u);
      if (s.endsWith('/api/version')) return json({ version: 'simulated' });
      if (s.endsWith('/api/tags')) return json({ models: [{ name: 'qwen3:8b' }] });
      if (s.endsWith('/api/pull')) return hangingPull(init?.signal);
      if (s.endsWith('/api/generate')) return json({});
      return base.fetch(u, init);
    },
  };
}

/** Built-in engine states. */
export function simulatedLlamaDeps(kind: Simulation, base: LlamaDeps): LlamaDeps {
  if (kind === 'bundled-no-engine') return { ...base, exists: () => false };
  return {
    ...base,
    exists: () => true, // the engine program is there...
    fileSize: () => null, // ...but there is no model file yet
    freeBytes: () => 500e9,
    // a download that reports progress and then waits to be cancelled, and never touches the network
    download: (_url, _dest, o) =>
      new Promise((_res, rej) => {
        o?.onPhase?.('downloading');
        o?.onProgress?.(kind === 'bundled-downloading' ? 2_900_000_000 : 0, 6_975_879_296);
        o?.signal?.addEventListener('abort', () => rej(new DOMException('The operation was aborted.', 'AbortError')));
      }),
  };
}
