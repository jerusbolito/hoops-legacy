import { execFileSync, spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { totalmem } from 'node:os';
import path from 'node:path';
import { OLLAMA_URL, modelInstalled, type EngineStatus, type PullProgress } from '../src/desktop/bridge';
import type { AIEngine } from './types';

/**
 * Manages the local AI engine (Ollama) for the desktop app: find it, start it, download the model, load it.
 * Everything that touches the outside world is injectable so it can be tested against a fake server.
 */

type Fetch = typeof fetch;

export interface EngineDeps {
  fetch: Fetch;
  spawn: typeof nodeSpawn;
  exists: (p: string) => boolean;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /** Folder an installer may have shipped Ollama in (the app's resources), if any. */
  resourcesPath?: string;
  totalMemBytes: () => number;
  sleep: (ms: number) => Promise<void>;
  baseUrl: string;
  /** Stop a process we started, and everything it started. */
  killTree: (child: ChildProcess) => void;
}

/**
 * On Windows, ending a process leaves the programs it launched running. Ollama runs the model in a helper process,
 * which would keep holding the model in memory after the game closes. So on Windows the whole tree is ended.
 */
export function killProcessTree(child: ChildProcess) {
  if (process.platform === 'win32' && child.pid) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      return;
    } catch {
      /* already gone, or taskkill unavailable: fall back to ending just the one process */
    }
  }
  child.kill();
}

export const defaultDeps = (resourcesPath?: string): EngineDeps => ({
  fetch: (...a) => fetch(...a),
  spawn: nodeSpawn,
  exists: existsSync,
  platform: process.platform,
  env: process.env,
  resourcesPath,
  totalMemBytes: totalmem,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  baseUrl: OLLAMA_URL,
  killTree: killProcessTree,
});

/* ───────────────────────── Finding Ollama ───────────────────────── */

/** Places Ollama is normally found, in the order we prefer them. A copy shipped inside the app comes first. */
export function ollamaCandidates(d: Pick<EngineDeps, 'platform' | 'env' | 'resourcesPath'>): string[] {
  const p = d.platform === 'win32' ? path.win32 : path.posix;
  const exe = d.platform === 'win32' ? 'ollama.exe' : 'ollama';
  const out: string[] = [];
  if (d.resourcesPath) out.push(p.join(d.resourcesPath, 'ollama', exe));
  if (d.platform === 'win32') {
    if (d.env.LOCALAPPDATA) out.push(p.join(d.env.LOCALAPPDATA, 'Programs', 'Ollama', exe));
    if (d.env.ProgramFiles) out.push(p.join(d.env.ProgramFiles, 'Ollama', exe));
  } else if (d.platform === 'darwin') {
    out.push('/Applications/Ollama.app/Contents/Resources/ollama', '/usr/local/bin/ollama', '/opt/homebrew/bin/ollama');
  } else {
    out.push('/usr/local/bin/ollama', '/usr/bin/ollama');
  }
  const pathVar = d.env.PATH ?? d.env.Path ?? '';
  for (const dir of pathVar.split(d.platform === 'win32' ? ';' : ':').filter(Boolean)) out.push(p.join(dir, exe));
  return [...new Set(out)];
}

export function findOllama(d: Pick<EngineDeps, 'platform' | 'env' | 'resourcesPath' | 'exists'>): string | null {
  return ollamaCandidates(d).find((c) => d.exists(c)) ?? null;
}

/* ───────────────────────── Talking to it ───────────────────────── */

export async function isUp(d: Pick<EngineDeps, 'fetch' | 'baseUrl'>, timeoutMs = 1500): Promise<boolean> {
  try {
    const r = await d.fetch(`${d.baseUrl}/api/version`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function installedModels(d: Pick<EngineDeps, 'fetch' | 'baseUrl'>): Promise<string[]> {
  try {
    const r = await d.fetch(`${d.baseUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    const data = (await r.json()) as { models?: { name?: string }[] };
    return (data.models ?? []).map((m) => m.name ?? '').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Turns Ollama's streamed pull messages into one overall progress number.
 * A model is several files ("layers"), and each reports its own total and completed bytes.
 */
export class PullTracker {
  private layers = new Map<string, { total: number; completed: number }>();

  update(line: { status?: string; digest?: string; total?: number; completed?: number }): PullProgress {
    const status = line.status ?? '';
    if (line.digest && typeof line.total === 'number') {
      this.layers.set(line.digest, { total: line.total, completed: Math.min(line.completed ?? 0, line.total) });
    }
    let total = 0;
    let completed = 0;
    for (const l of this.layers.values()) {
      total += l.total;
      completed += l.completed;
    }
    const done = status === 'success';
    const percent = done ? 100 : total > 0 ? Math.min(99, Math.floor((completed / total) * 100)) : null;
    return { status, percent, completed: total > 0 ? completed : null, total: total > 0 ? total : null, done };
  }
}

/** Reads newline-delimited JSON from a stream, one parsed object at a time. */
export async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as Record<string, unknown>;
    }
  }
  const rest = buf.trim();
  if (rest) yield JSON.parse(rest) as Record<string, unknown>;
}

export async function pullModel(d: Pick<EngineDeps, 'fetch' | 'baseUrl'>, model: string, onProgress: (p: PullProgress) => void, signal?: AbortSignal): Promise<void> {
  const res = await d.fetch(`${d.baseUrl}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: true }), signal });
  if (!res.ok || !res.body) throw new Error(`Could not start the download (${res.status}). Is "${model}" a real model name?`);
  const tracker = new PullTracker();
  let finished = false;
  for await (const line of ndjson(res.body)) {
    if (typeof line.error === 'string') throw new Error(line.error);
    const p = tracker.update(line as Parameters<PullTracker['update']>[0]);
    if (p.done) finished = true;
    onProgress(p);
  }
  if (!finished) throw new Error('The download ended early. Check your internet connection and try again.');
}

/** Loads the model into memory so the first scene is not slow. Returns false instead of throwing. */
export async function warmUp(d: Pick<EngineDeps, 'fetch' | 'baseUrl'>, model: string): Promise<boolean> {
  try {
    const r = await d.fetch(`${d.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: '30m' }),
      signal: AbortSignal.timeout(180_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/* ───────────────────────── The engine ───────────────────────── */

export class Engine implements AIEngine {
  private child: ChildProcess | null = null;
  private pullAbort: AbortController | null = null;

  constructor(private d: EngineDeps) {}

  /** True if this app started the engine, in which case it also stops it when you quit. */
  get weStarted(): boolean {
    return !!this.child;
  }

  async status(model: string): Promise<EngineStatus> {
    const ollamaPath = findOllama(this.d);
    const running = await isUp(this.d);
    const models = running ? await installedModels(this.d) : [];
    const hasModel = modelInstalled(models, model);
    const state = running ? (hasModel ? 'ready' : 'missing-model') : ollamaPath ? 'not-running' : 'no-ollama';
    return {
      provider: 'ollama',
      state,
      running,
      model,
      hasModel,
      ramGB: Math.round((this.d.totalMemBytes() / 1024 ** 3) * 10) / 10,
      weStarted: this.weStarted,
      baseUrl: `${this.d.baseUrl}/v1`,
      apiKey: '',
      requestModel: model,
      modelSource: null,
      engineVariant: null,
      ollamaPath,
      models,
    };
  }

  /** Starts Ollama if it is installed and not already up. If it is already running (yours, or the tray app), it is left alone. */
  async start(model: string, timeoutMs = 25_000): Promise<EngineStatus> {
    if (!(await isUp(this.d))) {
      const exe = findOllama(this.d);
      if (exe) {
        const child = this.d.spawn(exe, ['serve'], {
          env: { ...this.d.env, OLLAMA_HOST: new URL(this.d.baseUrl).host, OLLAMA_KEEP_ALIVE: this.d.env.OLLAMA_KEEP_ALIVE ?? '30m' },
          stdio: 'ignore',
          windowsHide: true,
        });
        this.child = child;
        child.on('exit', () => {
          if (this.child === child) this.child = null;
        });
        child.on('error', () => {
          if (this.child === child) this.child = null;
        });
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline && !(await isUp(this.d, 800))) await this.d.sleep(300);
      }
    }
    return this.status(model);
  }

  async pull(model: string, onProgress: (p: PullProgress) => void): Promise<void> {
    this.pullAbort?.abort();
    const ctl = new AbortController();
    this.pullAbort = ctl;
    try {
      await pullModel(this.d, model, onProgress, ctl.signal);
    } finally {
      if (this.pullAbort === ctl) this.pullAbort = null;
    }
  }

  cancelPull() {
    this.pullAbort?.abort();
  }

  warm(model: string) {
    return warmUp(this.d, model);
  }

  /** Stops the engine only if this app started it. */
  stop() {
    const c = this.child;
    this.child = null;
    if (c && !c.killed) this.d.killTree(c);
  }
}
