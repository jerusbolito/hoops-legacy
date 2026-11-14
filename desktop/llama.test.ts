import { EventEmitter } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import type { PullProgress } from '../src/desktop/bridge';
import { LlamaEngine, buildServerArgs, findModel, findVariants, pinnedModel, serverExecutable, variantOrder, type LlamaDeps } from './llama';
import pins from './pins.json';

const model = pins.models[0]; // gemma-4-12b
const j = (...p: string[]) => path.join(...p);
const ORIGIN = 'http://127.0.0.1:38417';

type Behavior = { mode: 'serve'; loadMs?: number } | { mode: 'crash'; stderr?: string } | { mode: 'hang' };

interface Rig {
  deps: LlamaDeps;
  spawned: { exe: string; args: string[]; cwd?: string }[];
  killed: string[];
  requests: { url: string; method?: string; origin?: string; body?: string }[];
  files: Map<string, number>;
}

const servers: http.Server[] = [];
afterEach(async () => {
  while (servers.length) {
    const s = servers.pop()!;
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});

/** A computer with the given engine builds and model files, where each build behaves as described. */
function rig(o: { variants?: Record<string, Behavior>; withModel?: 'with-app' | 'downloaded' | null; platform?: NodeJS.Platform } = {}): Rig {
  const variants = o.variants ?? { vulkan: { mode: 'serve', loadMs: 60 } };
  const platform = o.platform ?? 'win32';
  const exeName = serverExecutable(platform);
  const files = new Map<string, number>();
  const engineRoot = j('app', 'engine');
  const withApp = j('app', 'models');
  const data = j('data', 'models');
  if (o.withModel === 'with-app') files.set(j(withApp, model.file), model.bytes);
  if (o.withModel === 'downloaded') files.set(j(data, model.file), model.bytes);
  const exes = new Set(Object.keys(variants).map((v) => j(engineRoot, v, exeName)));

  const spawned: Rig['spawned'] = [];
  const killed: string[] = [];
  const requests: Rig['requests'] = [];

  const spawn = ((exe: string, args: string[], opts: { cwd?: string }) => {
    spawned.push({ exe, args, cwd: opts.cwd });
    const variant = Object.keys(variants).find((v) => exe.includes(`${path.sep}${v}${path.sep}`))!;
    const b = variants[variant];
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; killed: boolean; pid: number; kill: () => boolean };
    child.stderr = new EventEmitter();
    child.killed = false;
    child.pid = 1000 + spawned.length;
    let server: http.Server | null = null;
    const stopServer = () => server && (server.closeAllConnections(), server.close());
    child.kill = () => {
      child.killed = true;
      killed.push(variant);
      stopServer();
      setTimeout(() => child.emit('exit', null), 0);
      return true;
    };
    if (b.mode === 'crash') {
      setTimeout(() => {
        child.stderr.emit('data', Buffer.from(b.stderr ?? 'error: no Vulkan device found\n'));
        child.emit('exit', 1);
      }, 10);
    } else if (b.mode === 'serve') {
      const port = Number(args[args.indexOf('--port') + 1]);
      const readyAt = Date.now() + (b.loadMs ?? 0);
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          requests.push({ url: req.url ?? '', method: req.method, origin: String(req.headers.origin ?? ''), body });
          if (req.url === '/health') return void res.writeHead(Date.now() >= readyAt ? 200 : 503).end('{}');
          if (req.url === '/v1/chat/completions') return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }));
          res.writeHead(404).end();
        });
      });
      servers.push(server);
      server.listen(port, '127.0.0.1');
    }
    return child as unknown as ChildProcess;
  }) as unknown as LlamaDeps['spawn'];

  let nextPort = 41000 + Math.floor(Math.random() * 15000);
  const deps: LlamaDeps = {
    fetch: (...a) => fetch(...a),
    spawn,
    exists: (p) => exes.has(p),
    fileSize: (p) => files.get(p) ?? null,
    freeBytes: () => 500e9,
    platform,
    engineRoots: [engineRoot],
    modelDirs: [
      { dir: withApp, source: 'with-app' },
      { dir: data, source: 'downloaded' },
    ],
    allowedOrigin: ORIGIN,
    totalMemBytes: () => 32 * 1024 ** 3,
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 15))),
    killTree: (c) => void c.kill(),
    freePort: async () => nextPort++,
    download: async () => 'downloaded',
    contextTokens: 8192,
    startTimeoutMs: 3000,
  };
  return { deps, spawned, killed, requests, files };
}

describe('finding the engine and the model', () => {
  it('tries the graphics-card build first, then the CPU one, and uses the right program name per system', () => {
    expect(variantOrder('win32')).toEqual(['vulkan', 'cpu']);
    expect(variantOrder('linux')).toEqual(['vulkan', 'cpu']);
    expect(variantOrder('darwin')).toEqual(['metal']);
    expect(serverExecutable('win32')).toBe('llama-server.exe');
    expect(serverExecutable('darwin')).toBe('llama-server');
    const r = rig({ variants: { cpu: { mode: 'hang' }, vulkan: { mode: 'hang' } } });
    expect(findVariants(r.deps).map((v) => v.variant)).toEqual(['vulkan', 'cpu']);
    const onlyCpu = rig({ variants: { cpu: { mode: 'hang' } } });
    expect(findVariants(onlyCpu.deps).map((v) => v.variant)).toEqual(['cpu']);
  });

  it('only counts a model file that is the right size, and prefers the one that came with the app', () => {
    const r = rig({ withModel: 'downloaded' });
    expect(findModel(r.deps, model)?.source).toBe('downloaded');
    r.files.set(j('app', 'models', model.file), model.bytes);
    expect(findModel(r.deps, model)?.source).toBe('with-app');
    // a half-finished or wrong file is not a model
    r.files.set(j('app', 'models', model.file), model.bytes - 1);
    r.files.delete(j('data', 'models', model.file));
    expect(findModel(r.deps, model)).toBeNull();
  });

  it('knows every catalog model', () => {
    for (const id of ['gemma-4-12b', 'gemma-4-e4b', 'gemma-4-e2b']) expect(pinnedModel(id)).toBeDefined();
    expect(pinnedModel('nope')).toBeUndefined();
  });
});

describe('how the engine is started', () => {
  it('listens only on this computer, answers only the game, and has no web page of its own', () => {
    const args = buildServerArgs({ modelPath: '/m/x.gguf', port: 4321, origin: ORIGIN, alias: 'gemma-4-12b', contextTokens: 8192 });
    const val = (flag: string) => args[args.indexOf(flag) + 1];
    expect(val('-m')).toBe('/m/x.gguf');
    expect(val('--host')).toBe('127.0.0.1');
    expect(val('--port')).toBe('4321');
    expect(val('--cors-origins')).toBe(ORIGIN);
    expect(val('-c')).toBe('8192');
    expect(val('-np')).toBe('1');
    expect(args).toContain('--no-webui');
    expect(args).toContain('--jinja');
    expect(args).not.toContain('0.0.0.0');
  });
});

describe('LlamaEngine', () => {
  it('describes where you are: broken install, missing model, ready to start, running', async () => {
    const none = new LlamaEngine(rig({ variants: {} , withModel: 'with-app' }).deps);
    expect((await none.status('gemma-4-12b')).state).toBe('no-engine');
    const noModel = new LlamaEngine(rig({ withModel: null }).deps);
    expect(await noModel.status('gemma-4-12b')).toMatchObject({ state: 'missing-model', hasModel: false, provider: 'bundled' });
    const idle = new LlamaEngine(rig({ withModel: 'downloaded' }).deps);
    expect(await idle.status('gemma-4-12b')).toMatchObject({ state: 'not-running', hasModel: true, modelSource: 'downloaded', engineVariant: 'vulkan', baseUrl: '' });
  });

  it('starts the engine, waits for the model to finish loading, and hands back where to talk to it', async () => {
    const r = rig({ withModel: 'with-app', variants: { vulkan: { mode: 'serve', loadMs: 250 } } });
    const engine = new LlamaEngine(r.deps);
    const t0 = Date.now();
    const s = await engine.start('gemma-4-12b');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(200); // it really waited for the 503 to turn into a 200
    expect(s).toMatchObject({ state: 'ready', running: true, weStarted: true, modelSource: 'with-app', engineVariant: 'vulkan', requestModel: 'gemma-4-12b' });
    expect(s.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    expect(r.spawned).toHaveLength(1);
    expect(r.spawned[0].args).toContain('--no-webui');
    expect(r.spawned[0].cwd).toBe(j('app', 'engine', 'vulkan'));
    // asking again does not start a second one
    await engine.start('gemma-4-12b');
    expect(r.spawned).toHaveLength(1);
    engine.stop();
    expect(r.killed).toEqual(['vulkan']);
    expect(engine.weStarted).toBe(false);
    expect((await engine.status('gemma-4-12b')).running).toBe(false);
  });

  it('falls back to the CPU build when the graphics-card build will not start, and says which it used', async () => {
    const r = rig({ withModel: 'with-app', variants: { vulkan: { mode: 'crash', stderr: 'vkCreateInstance failed\nno Vulkan device found\n' }, cpu: { mode: 'serve', loadMs: 30 } } });
    const engine = new LlamaEngine(r.deps);
    const s = await engine.start('gemma-4-12b');
    expect(r.spawned.map((x) => path.basename(path.dirname(x.exe)))).toEqual(['vulkan', 'cpu']);
    expect(s).toMatchObject({ state: 'ready', engineVariant: 'cpu' });
    expect(s.error).toBeUndefined();
    engine.stop();
  });

  it('reports what the engine said when nothing will start', async () => {
    const r = rig({ withModel: 'with-app', variants: { vulkan: { mode: 'crash', stderr: 'error: out of memory\n' }, cpu: { mode: 'crash', stderr: 'error: bad model file\n' } } });
    const s = await new LlamaEngine(r.deps).start('gemma-4-12b');
    expect(s.state).toBe('not-running');
    expect(s.error).toMatch(/vulkan: stopped right away/);
    expect(s.error).toMatch(/out of memory/);
    expect(s.error).toMatch(/cpu: stopped right away/);
    expect(s.error).toMatch(/bad model file/);
  });

  it('gives up with a clear message if the model never finishes loading, and does not leave the engine running', async () => {
    const r = rig({ withModel: 'with-app', variants: { vulkan: { mode: 'hang' } } });
    r.deps.startTimeoutMs = 300;
    const s = await new LlamaEngine(r.deps).start('gemma-4-12b');
    expect(s.state).toBe('not-running');
    expect(s.error).toMatch(/did not finish loading/);
    expect(r.killed).toContain('vulkan');
  });

  it('will not start without the model or without the engine', async () => {
    const r = rig({ withModel: null });
    expect((await new LlamaEngine(r.deps).start('gemma-4-12b')).state).toBe('missing-model');
    expect(r.spawned).toHaveLength(0);
    const r2 = rig({ variants: {}, withModel: 'with-app' });
    expect((await new LlamaEngine(r2.deps).start('gemma-4-12b')).state).toBe('no-engine');
  });

  it('warms the model up with one tiny request, and does nothing if it is not running', async () => {
    const r = rig({ withModel: 'with-app', variants: { vulkan: { mode: 'serve' } } });
    const engine = new LlamaEngine(r.deps);
    expect(await engine.warm('gemma-4-12b')).toBe(false);
    await engine.start('gemma-4-12b');
    expect(await engine.warm('gemma-4-12b')).toBe(true);
    const req = r.requests.find((x) => x.url === '/v1/chat/completions')!;
    const body = JSON.parse(req.body!);
    expect(body).toMatchObject({ max_tokens: 1, reasoning_effort: 'none' });
    engine.stop();
  });
});

describe('downloading the model', () => {
  it('saves it in the player’s data folder, from the exact pinned file, checked against its checksum', async () => {
    const r = rig();
    const calls: { url: string; dest: string; sha256?: string; bytes?: number }[] = [];
    r.deps.download = async (url, dest, o) => {
      calls.push({ url, dest, sha256: o?.sha256, bytes: o?.bytes });
      o?.onPhase?.('downloading');
      o?.onProgress?.(0, model.bytes);
      o?.onProgress?.(model.bytes / 2, model.bytes);
      o?.onProgress?.(model.bytes, model.bytes);
      o?.onPhase?.('verifying');
      return 'downloaded';
    };
    const seen: PullProgress[] = [];
    await new LlamaEngine(r.deps).pull('gemma-4-12b', (p) => seen.push(p));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://huggingface.co/${model.repo}/resolve/${model.revision}/${model.file}`);
    expect(calls[0].url).not.toMatch(/resolve\/main/); // pinned to a commit, so the file can never change underneath us
    expect(calls[0].dest).toBe(j('data', 'models', model.file));
    expect(calls[0].sha256).toBe(model.sha256);
    expect(calls[0].bytes).toBe(model.bytes);
    const pcts = seen.map((p) => p.percent).filter((p): p is number => p !== null);
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b)); // never goes backwards
    expect(seen.find((p) => p.status === 'Checking the download')?.percent).toBe(99);
    expect(seen.find((p) => p.percent === 50)).toBeDefined();
    expect(seen[seen.length - 1]).toMatchObject({ done: true, percent: 100, status: 'success' });
  });

  it('refuses to start a download that cannot fit, and says how much room is needed', async () => {
    const r = rig();
    r.deps.freeBytes = () => 2e9;
    let started = false;
    r.deps.download = async () => ((started = true), 'downloaded');
    await expect(new LlamaEngine(r.deps).pull('gemma-4-12b', () => {})).rejects.toThrow(/Not enough free space.*7\.0 GB.*2\.0 GB free/);
    expect(started).toBe(false);
  });

  it('counts a half-finished download toward the space it needs', async () => {
    const r = rig();
    r.files.set(`${j('data', 'models', model.file)}.part`, 6e9);
    r.deps.freeBytes = () => 2e9; // only 1 GB is still missing, so this fits
    await expect(new LlamaEngine(r.deps).pull('gemma-4-12b', () => {})).resolves.toBeUndefined();
  });

  it('can be cancelled', async () => {
    const r = rig();
    r.deps.download = (_u, _d, o) =>
      new Promise((_res, rej) => {
        o?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      });
    const engine = new LlamaEngine(r.deps);
    const run = engine.pull('gemma-4-12b', () => {});
    setTimeout(() => engine.cancelPull(), 20);
    await expect(run).rejects.toThrow(/abort/i);
  });

  it('rejects a model that is not in the catalog', async () => {
    await expect(new LlamaEngine(rig().deps).pull('made-up', () => {})).rejects.toThrow(/Unknown model/);
  });
});
