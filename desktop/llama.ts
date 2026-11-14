import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, statSync, statfsSync } from 'node:fs';
import { totalmem } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import type { EngineStatus, PullProgress } from '../src/desktop/bridge';
import { downloadFile } from './download';
import { killProcessTree } from './engine';
import pins from './pins.json';
import type { AIEngine } from './types';

/**
 * The built-in engine: runs a model file directly with llama.cpp's `llama-server`, so the game needs no other
 * program installed. It looks for the engine program and the model file next to the app (shipped with it) or in the
 * player's data folder (downloaded once, verified against a pinned checksum).
 */

export type PinnedModel = (typeof pins.models)[number];

export interface LlamaDeps {
  fetch: typeof fetch;
  spawn: typeof nodeSpawn;
  exists: (p: string) => boolean;
  /** Size of a file in bytes, or null if it is not there. */
  fileSize: (p: string) => number | null;
  /** Free space on the drive holding `dir`, or null if unknown. */
  freeBytes: (dir: string) => number | null;
  platform: NodeJS.Platform;
  /** Folders holding one subfolder per engine build ("vulkan", "cpu", "metal"). */
  engineRoots: string[];
  /** Where to look for model files, best first. Downloads go to the last "downloaded" entry. */
  modelDirs: { dir: string; source: 'with-app' | 'downloaded' }[];
  /** The only web address the engine will answer: the game's own page. */
  allowedOrigin: string;
  totalMemBytes: () => number;
  sleep: (ms: number) => Promise<void>;
  killTree: (c: ChildProcess) => void;
  freePort: () => Promise<number>;
  download: typeof downloadFile;
  /** How much text the model can keep in mind at once (the game's prompts are about 3,000 tokens). */
  contextTokens: number;
  /** Loading a 7 GB model from a slow disk can take a while. */
  startTimeoutMs: number;
}

const pickPort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

export function defaultLlamaDeps(o: { engineRoots: string[]; modelDirs: LlamaDeps['modelDirs']; allowedOrigin: string }): LlamaDeps {
  return {
    fetch: (...a) => fetch(...a),
    spawn: nodeSpawn,
    exists: existsSync,
    fileSize: (p) => {
      try {
        return statSync(p).size;
      } catch {
        return null;
      }
    },
    freeBytes: (dir) => {
      try {
        let probe = dir;
        while (!existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
        const s = statfsSync(probe);
        return Number(s.bavail) * Number(s.bsize);
      } catch {
        return null;
      }
    },
    platform: process.platform,
    totalMemBytes: totalmem,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    killTree: killProcessTree,
    freePort: pickPort,
    download: downloadFile,
    contextTokens: 8192,
    startTimeoutMs: 240_000,
    ...o,
  };
}

/* ───────────────────────── Finding things ───────────────────────── */

export const serverExecutable = (platform: NodeJS.Platform) => (platform === 'win32' ? 'llama-server.exe' : 'llama-server');

/** Engine builds in the order to try them: the graphics-card build first, then the plain CPU one. */
export const variantOrder = (platform: NodeJS.Platform) => (platform === 'darwin' ? ['metal'] : ['vulkan', 'cpu']);

export interface Variant {
  variant: string;
  exe: string;
}

export function findVariants(d: Pick<LlamaDeps, 'engineRoots' | 'exists' | 'platform'>): Variant[] {
  const out: Variant[] = [];
  for (const variant of variantOrder(d.platform)) {
    for (const root of d.engineRoots) {
      const exe = path.join(root, variant, serverExecutable(d.platform));
      if (d.exists(exe)) {
        out.push({ variant, exe });
        break;
      }
    }
  }
  return out;
}

export const pinnedModel = (id: string): PinnedModel | undefined => pins.models.find((m) => m.id === id);

/** The model file, if it is there and is the right size. Files shipped with the app win over downloaded ones. */
export function findModel(d: Pick<LlamaDeps, 'modelDirs' | 'fileSize'>, m: PinnedModel): { path: string; source: 'with-app' | 'downloaded' } | null {
  for (const { dir, source } of d.modelDirs) {
    const p = path.join(dir, m.file);
    if (d.fileSize(p) === m.bytes) return { path: p, source };
  }
  return null;
}

/**
 * How the engine is started. It listens only on this computer and only answers the game's own page, and its built-in
 * web page is switched off. Thinking is turned off per request by the game, so no restart is needed to change it.
 */
export function buildServerArgs(o: { modelPath: string; port: number; origin: string; alias: string; contextTokens: number }): string[] {
  return ['-m', o.modelPath, '--host', '127.0.0.1', '--port', String(o.port), '--cors-origins', o.origin, '--no-webui', '--jinja', '-c', String(o.contextTokens), '-np', '1', '--alias', o.alias];
}

/* ───────────────────────── The engine ───────────────────────── */

const GB = 1e9;

export class LlamaEngine implements AIEngine {
  private child: ChildProcess | null = null;
  private port = 0;
  private variant: string | null = null;
  private lastError = '';
  private pullAbort: AbortController | null = null;

  constructor(private d: LlamaDeps) {}

  get weStarted(): boolean {
    return !!this.child;
  }

  private get base() {
    return `http://127.0.0.1:${this.port}`;
  }

  /** The engine answers /health with 200 once the model is loaded, and 503 while it is still loading. */
  private async healthy(timeoutMs = 1500): Promise<boolean> {
    if (!this.child || !this.port) return false;
    try {
      const r = await this.d.fetch(`${this.base}/health`, { signal: AbortSignal.timeout(timeoutMs) });
      return r.ok;
    } catch {
      return false;
    }
  }

  async status(id: string): Promise<EngineStatus> {
    const m = pinnedModel(id);
    const variants = findVariants(this.d);
    const found = m ? findModel(this.d, m) : null;
    const running = await this.healthy();
    const state = !variants.length ? 'no-engine' : !found ? 'missing-model' : running ? 'ready' : 'not-running';
    return {
      provider: 'bundled',
      state,
      running,
      model: id,
      hasModel: !!found,
      ramGB: Math.round((this.d.totalMemBytes() / 1024 ** 3) * 10) / 10,
      weStarted: this.weStarted,
      baseUrl: running ? `${this.base}/v1` : '',
      apiKey: '',
      requestModel: id,
      modelSource: found?.source ?? null,
      engineVariant: running ? this.variant : (variants[0]?.variant ?? null),
      ollamaPath: null,
      models: [],
      ...(this.lastError && !running ? { error: this.lastError } : {}),
    };
  }

  /** Starts the engine. If the graphics-card build will not start, falls back to the CPU one. */
  async start(id: string): Promise<EngineStatus> {
    const before = await this.status(id);
    if (before.state !== 'not-running') return before;
    const m = pinnedModel(id)!;
    const model = findModel(this.d, m)!;
    this.lastError = '';
    const failures: string[] = [];
    for (const v of findVariants(this.d)) {
      const result = await this.tryStart(v, model.path, id);
      if (result === 'ok') return this.status(id);
      failures.push(`${v.variant}: ${result}`);
    }
    this.lastError = failures.join(' | ');
    return this.status(id);
  }

  private async tryStart(v: Variant, modelPath: string, alias: string): Promise<'ok' | string> {
    const port = await this.d.freePort();
    const child = this.d.spawn(v.exe, buildServerArgs({ modelPath, port, origin: this.d.allowedOrigin, alias, contextTokens: this.d.contextTokens }), {
      cwd: path.dirname(v.exe),
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let tail = '';
    let exited: number | null | undefined;
    child.stderr?.on('data', (b: Buffer) => {
      tail = (tail + b.toString()).slice(-1500);
    });
    child.on('exit', (code) => {
      exited = code ?? -1;
      if (this.child === child) {
        this.child = null;
        this.port = 0;
      }
    });
    child.on('error', (e) => {
      exited = -1;
      tail += `\n${e.message}`;
    });
    this.child = child;
    this.port = port;
    this.variant = v.variant;

    const deadline = Date.now() + this.d.startTimeoutMs;
    while (Date.now() < deadline) {
      if (exited !== undefined) return `stopped right away (exit ${exited}). ${lastLines(tail)}`.trim();
      if (await this.healthy(800)) return 'ok';
      await this.d.sleep(300);
    }
    this.d.killTree(child);
    this.child = null;
    this.port = 0;
    return `did not finish loading in ${Math.round(this.d.startTimeoutMs / 1000)} seconds. ${lastLines(tail)}`.trim();
  }

  /** Downloads the model into the player's data folder, checking it against the pinned checksum. */
  async pull(id: string, onProgress: (p: PullProgress) => void): Promise<void> {
    const m = pinnedModel(id);
    if (!m) throw new Error(`Unknown model "${id}".`);
    const target = [...this.d.modelDirs].reverse().find((x) => x.source === 'downloaded');
    if (!target) throw new Error('There is nowhere to save the model.');
    const dest = path.join(target.dir, m.file);

    // do not start a 7 GB download that cannot finish
    mkdirSync(target.dir, { recursive: true });
    const free = this.d.freeBytes(target.dir);
    const already = this.d.fileSize(`${dest}.part`) ?? 0;
    if (free !== null && free < m.bytes - already + 0.2 * GB) {
      throw new Error(`Not enough free space. ${m.label} needs about ${(m.bytes / GB).toFixed(1)} GB and this drive has ${(free / GB).toFixed(1)} GB free.`);
    }

    this.pullAbort?.abort();
    const ctl = new AbortController();
    this.pullAbort = ctl;
    let phase: 'downloading' | 'verifying' = 'downloading';
    const report = (done: number, total: number | null, finished = false): PullProgress => ({
      status: finished ? 'success' : phase === 'verifying' ? 'Checking the download' : 'Downloading',
      percent: finished ? 100 : phase === 'verifying' ? 99 : total ? Math.min(99, Math.floor((done / total) * 100)) : null,
      completed: phase === 'verifying' ? m.bytes : done,
      total: total ?? m.bytes,
      done: finished,
    });
    try {
      await this.d.download(`https://huggingface.co/${m.repo}/resolve/${m.revision}/${m.file}`, dest, {
        sha256: m.sha256,
        bytes: m.bytes,
        signal: ctl.signal,
        fetch: this.d.fetch,
        onPhase: (p) => {
          phase = p;
          if (p === 'verifying') onProgress(report(m.bytes, m.bytes));
        },
        onProgress: (done, total) => {
          if (phase === 'downloading') onProgress(report(done, total));
        },
      });
      onProgress(report(m.bytes, m.bytes, true));
    } finally {
      if (this.pullAbort === ctl) this.pullAbort = null;
    }
  }

  cancelPull() {
    this.pullAbort?.abort();
  }

  /** One tiny request, so the first real scene does not pay for the engine's first-use setup. */
  async warm(id: string): Promise<boolean> {
    if (!(await this.healthy())) return false;
    try {
      const r = await this.d.fetch(`${this.base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: id, max_tokens: 1, reasoning_effort: 'none', messages: [{ role: 'user', content: 'Hi' }] }),
        signal: AbortSignal.timeout(120_000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  stop() {
    const c = this.child;
    this.child = null;
    this.port = 0;
    if (c && !c.killed) this.d.killTree(c);
  }
}

/** The last few lines of the engine's own messages, which usually say what went wrong. */
function lastLines(text: string, n = 3): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.slice(-n).join(' ').slice(-400);
}
