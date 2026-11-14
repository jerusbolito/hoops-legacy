import { EventEmitter } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import type { PullProgress } from '../src/desktop/bridge';
import { Engine, PullTracker, defaultDeps, findOllama, installedModels, isUp, ollamaCandidates, pullModel, warmUp, type EngineDeps } from './engine';

/** A tiny stand-in for Ollama's HTTP API, so the real fetch and streaming code runs for real. */
class FakeOllama {
  server: http.Server | null = null;
  models: string[] = ['other:1b'];
  /** Lines the pull endpoint will send, each as its own network chunk. A string is sent raw. */
  pullScript: (object | string)[] = [];
  pullDelayMs = 0;
  generateCalls = 0;
  generateOk = true;

  constructor(readonly port: number) {}
  get url() {
    return `http://127.0.0.1:${this.port}`;
  }
  get up() {
    return !!this.server;
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        if (req.url === '/api/version') return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"version":"0.0.0-test"}');
        if (req.url === '/api/tags') return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ models: this.models.map((name) => ({ name })) }));
        if (req.url === '/api/generate') {
          this.generateCalls++;
          return void res.writeHead(this.generateOk ? 200 : 500).end('{}');
        }
        if (req.url === '/api/pull') {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          for (const item of this.pullScript) {
            if (this.pullDelayMs) await new Promise((r) => setTimeout(r, this.pullDelayMs));
            res.write(typeof item === 'string' ? item : JSON.stringify(item) + '\n');
          }
          return void res.end();
        }
        res.writeHead(404).end();
      });
      this.server.listen(this.port, '127.0.0.1', () => resolve());
    });
  }

  stop(): Promise<void> {
    const s = this.server;
    this.server = null;
    return new Promise((r) => (s ? (s.closeAllConnections(), s.close(() => r())) : r()));
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function setup(o: { installed?: boolean; running?: boolean; startupLagMs?: number } = {}) {
  const fake = new FakeOllama(await freePort());
  cleanups.push(() => fake.stop());
  if (o.running) await fake.start();
  const spawned: { exe: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const killed: number[] = [];
  const exe = 'C:\\Users\\Me\\AppData\\Local\\Programs\\Ollama\\ollama.exe';
  const deps: EngineDeps = {
    ...defaultDeps(),
    baseUrl: fake.url,
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\Me\\AppData\\Local', PATH: '' },
    exists: (p) => !!(o.installed ?? true) && p === exe,
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 20))),
    totalMemBytes: () => 32 * 1024 ** 3,
    killTree: (c) => void c.kill(),
    spawn: ((file: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      spawned.push({ exe: file, args, env: opts.env });
      const child = new EventEmitter() as EventEmitter & { killed: boolean; kill: () => boolean };
      child.killed = false;
      child.kill = () => {
        killed.push(1);
        child.killed = true;
        void fake.stop();
        return true;
      };
      setTimeout(() => void fake.start(), o.startupLagMs ?? 0);
      return child as unknown as ChildProcess;
    }) as unknown as EngineDeps['spawn'],
  };
  return { fake, deps, spawned, killed, exe };
}

describe('finding Ollama', () => {
  it('looks in the app\u2019s own folder first, then the usual install places, then PATH', () => {
    const win = ollamaCandidates({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\L', ProgramFiles: 'C:\\P', PATH: 'C:\\bin;C:\\tools' }, resourcesPath: 'C:\\app\\resources' });
    expect(win[0]).toBe('C:\\app\\resources\\ollama\\ollama.exe');
    expect(win).toContain('C:\\L\\Programs\\Ollama\\ollama.exe');
    expect(win).toContain('C:\\P\\Ollama\\ollama.exe');
    expect(win.slice(-2)).toEqual(['C:\\bin\\ollama.exe', 'C:\\tools\\ollama.exe']);
    const mac = ollamaCandidates({ platform: 'darwin', env: { PATH: '/usr/bin' } });
    expect(mac).toContain('/Applications/Ollama.app/Contents/Resources/ollama');
    const linux = ollamaCandidates({ platform: 'linux', env: { PATH: '/a:/b:/usr/local/bin' } });
    expect(linux).toContain('/a/ollama');
    expect(new Set(linux).size).toBe(linux.length); // no duplicates
  });

  it('returns the first one that exists, or null', () => {
    const env = { LOCALAPPDATA: 'C:\\L', PATH: '' };
    expect(findOllama({ platform: 'win32', env, exists: (p) => p.endsWith('Programs\\Ollama\\ollama.exe') })).toBe('C:\\L\\Programs\\Ollama\\ollama.exe');
    expect(findOllama({ platform: 'win32', env, exists: () => false })).toBeNull();
  });
});

describe('download progress', () => {
  it('adds up every file of a model into one percentage that never goes backwards', () => {
    const t = new PullTracker();
    expect(t.update({ status: 'pulling manifest' }).percent).toBeNull();
    const a = t.update({ status: 'pulling a', digest: 'a', total: 800, completed: 0 });
    expect(a.percent).toBe(0);
    const b = t.update({ status: 'pulling b', digest: 'b', total: 200, completed: 0 });
    expect(b.percent).toBe(0);
    expect(t.update({ status: 'pulling a', digest: 'a', total: 800, completed: 400 }).percent).toBe(40);
    expect(t.update({ status: 'pulling b', digest: 'b', total: 200, completed: 200 }).percent).toBe(60);
    const near = t.update({ status: 'pulling a', digest: 'a', total: 800, completed: 800 });
    expect(near.percent).toBe(99); // never 100 until Ollama says it is done
    expect(near.done).toBe(false);
    const done = t.update({ status: 'success' });
    expect(done.done).toBe(true);
    expect(done.percent).toBe(100);
  });
});

describe('talking to the engine', () => {
  it('knows whether it is up, and what models it has', async () => {
    const { fake, deps } = await setup({ running: false });
    expect(await isUp(deps, 300)).toBe(false);
    expect(await installedModels(deps)).toEqual([]);
    await fake.start();
    expect(await isUp(deps)).toBe(true);
    fake.models = ['gemma4:12b', 'qwen3:8b'];
    expect(await installedModels(deps)).toEqual(['gemma4:12b', 'qwen3:8b']);
  });

  it('downloads a model, reading progress even when a message is split across network chunks', async () => {
    const { fake, deps } = await setup({ running: true });
    const line = (o: object) => JSON.stringify(o) + '\n';
    const big = line({ status: 'pulling aaa', digest: 'aaa', total: 1000, completed: 500 });
    fake.pullScript = [
      { status: 'pulling manifest' },
      { status: 'pulling aaa', digest: 'aaa', total: 1000, completed: 0 },
      big.slice(0, 20), // the next message arrives in two pieces
      big.slice(20),
      { status: 'pulling aaa', digest: 'aaa', total: 1000, completed: 1000 },
      { status: 'verifying sha256 digest' },
      { status: 'success' },
    ];
    const seen: PullProgress[] = [];
    await pullModel(deps, 'gemma4:12b', (p) => seen.push(p));
    const pcts = seen.map((p) => p.percent).filter((p): p is number => p !== null);
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b));
    expect(pcts).toContain(50);
    expect(seen[seen.length - 1]).toMatchObject({ done: true, percent: 100 });
  });

  it('reports a failed download with the reason Ollama gave', async () => {
    const { fake, deps } = await setup({ running: true });
    fake.pullScript = [{ status: 'pulling manifest' }, { error: 'pull model manifest: file does not exist' }];
    await expect(pullModel(deps, 'nope:1b', () => {})).rejects.toThrow(/file does not exist/);
  });

  it('does not call a download finished if the stream just stops', async () => {
    const { fake, deps } = await setup({ running: true });
    fake.pullScript = [{ status: 'pulling aaa', digest: 'aaa', total: 100, completed: 10 }];
    await expect(pullModel(deps, 'gemma4:12b', () => {})).rejects.toThrow(/ended early/);
  });

  it('warms the model up, and reports a failure instead of throwing', async () => {
    const { fake, deps } = await setup({ running: true });
    expect(await warmUp(deps, 'gemma4:12b')).toBe(true);
    expect(fake.generateCalls).toBe(1);
    fake.generateOk = false;
    expect(await warmUp(deps, 'gemma4:12b')).toBe(false);
    await fake.stop();
    expect(await warmUp(deps, 'gemma4:12b')).toBe(false);
  });
});

describe('Engine', () => {
  it('describes where you are: no Ollama, not running, missing model, ready', async () => {
    let s = await setup({ installed: false, running: false });
    expect((await new Engine(s.deps).status('gemma4:12b')).state).toBe('no-ollama');
    s = await setup({ installed: true, running: false });
    const notRunning = await new Engine(s.deps).status('gemma4:12b');
    expect(notRunning).toMatchObject({ state: 'not-running', running: false, ramGB: 32 });
    s = await setup({ installed: true, running: true });
    expect((await new Engine(s.deps).status('gemma4:12b')).state).toBe('missing-model');
    s.fake.models = ['gemma4:12b'];
    expect(await new Engine(s.deps).status('gemma4:12b')).toMatchObject({ state: 'ready', hasModel: true });
    // a bare name means the latest tag
    s.fake.models = ['llama3:latest'];
    expect((await new Engine(s.deps).status('llama3')).state).toBe('ready');
  });

  it('starts Ollama itself when it is installed but not running, and stops it again on exit', async () => {
    const s = await setup({ installed: true, running: false, startupLagMs: 120 });
    s.fake.models = ['gemma4:12b'];
    const engine = new Engine(s.deps);
    const status = await engine.start('gemma4:12b');
    expect(s.spawned).toHaveLength(1);
    expect(s.spawned[0].exe).toBe(s.exe);
    expect(s.spawned[0].args).toEqual(['serve']);
    expect(s.spawned[0].env.OLLAMA_HOST).toBe(new URL(s.fake.url).host);
    expect(s.spawned[0].env.OLLAMA_KEEP_ALIVE).toBe('30m');
    expect(status).toMatchObject({ state: 'ready', weStarted: true });
    engine.stop();
    expect(s.killed).toHaveLength(1);
    expect(engine.weStarted).toBe(false);
  });

  it('leaves an Ollama that is already running alone, and never kills it', async () => {
    const s = await setup({ installed: true, running: true });
    const engine = new Engine(s.deps);
    const status = await engine.start('gemma4:12b');
    expect(s.spawned).toHaveLength(0);
    expect(status.weStarted).toBe(false);
    engine.stop();
    expect(s.killed).toHaveLength(0);
    expect(s.fake.up).toBe(true);
  });

  it('does not try to start something that is not installed', async () => {
    const s = await setup({ installed: false, running: false });
    const status = await new Engine(s.deps).start('gemma4:12b', 200);
    expect(s.spawned).toHaveLength(0);
    expect(status.state).toBe('no-ollama');
  });

  it('can cancel a download in progress', async () => {
    const s = await setup({ installed: true, running: true });
    s.fake.pullDelayMs = 60;
    s.fake.pullScript = Array.from({ length: 30 }, (_, i) => ({ status: 'pulling aaa', digest: 'aaa', total: 100, completed: i }));
    const engine = new Engine(s.deps);
    const run = engine.pull('gemma4:12b', () => {});
    setTimeout(() => engine.cancelPull(), 150);
    await expect(run).rejects.toThrow();
  });
});
