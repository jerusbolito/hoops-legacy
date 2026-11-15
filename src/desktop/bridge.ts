import pins from '../../desktop/pins.json';

/**
 * The desktop shell (Electron) exposes this to the game as `window.hoopsDesktop`. In a normal browser it does not
 * exist, and the game runs exactly as before. Keep this file free of Node and Electron imports: both the game and the
 * desktop shell import it.
 */

/**
 * Where the stories come from on the desktop:
 *  - "bundled": a model file the game runs itself (llama.cpp). Nothing else to install. This is the default.
 *  - "ollama": an Ollama install you already have. For people who prefer it.
 */
export type Provider = 'bundled' | 'ollama';

/** What the player chose: a provider, and a model (a catalog id for "bundled", or an Ollama name like "gemma4:12b"). */
export interface EngineSelection {
  provider: Provider;
  model: string;
}

/* ───────────────────────── The model catalog ───────────────────────── */

export interface ModelInfo {
  id: string;
  label: string;
  blurb: string;
  bytes: number;
  /** Memory that makes this model comfortable. Below it the computer will struggle. */
  minRamGB: number;
  /** Video memory that holds the whole model on the graphics card (fast). */
  minVramGB: number;
  /** Memory at which running it on the processor alone is still tolerable. */
  cpuRamGB: number;
  /** Whether it can be trusted to retell the engine's own results (newspaper, moves) without changing the facts. */
  retell: boolean;
  license: string;
}

/** The models the built-in engine can run, biggest first. Sizes and checksums come from desktop/pins.json. */
export const MODEL_CATALOG: ModelInfo[] = pins.models.map((m) => ({ id: m.id, label: m.label, blurb: m.blurb, bytes: m.bytes, minRamGB: m.minRamGB, minVramGB: m.minVramGB, cpuRamGB: m.cpuRamGB, retell: m.retell, license: m.license }));

/** The best model for the stories, and the one set up by default. */
export const DEFAULT_BUNDLED_MODEL = 'gemma-4-12b';

/** What this computer has to run a model with. */
export interface Hardware {
  ramGB: number;
  /** Memory on a real graphics card (or a Mac's shared memory). 0 when the computer has none, or only built-in graphics. */
  gpuGB: number;
  gpuName: string;
  /** The only graphics here are built into the processor and borrow ordinary memory, so they do not speed a model up much. */
  integratedOnly: boolean;
}

/**
 * Picks the best model this computer will run well. A graphics card that holds the whole model makes it fast, so that
 * decides it. With no usable graphics card the processor does the work, several times slower, so it aims lower.
 */
export function recommendModel(ramGB: number, gpuGB = 0): string {
  if (gpuGB > 0) {
    const fits = MODEL_CATALOG.find((m) => gpuGB >= m.minVramGB && ramGB >= m.minRamGB * 0.6);
    if (fits) return fits.id;
  }
  return (MODEL_CATALOG.find((m) => ramGB >= m.cpuRamGB) ?? MODEL_CATALOG[MODEL_CATALOG.length - 1]).id;
}

export type FitLevel = 'fast' | 'ok' | 'slow' | 'tight';

/** What running this model on this computer will be like, in plain words. */
export function fitNote(m: ModelInfo, hw: Hardware): { level: FitLevel; text: string } {
  if (hw.gpuGB >= m.minVramGB && hw.ramGB >= m.minRamGB * 0.6) return { level: 'fast', text: `Fits on your graphics card (${hw.gpuName}, ${Math.round(hw.gpuGB)} GB). Fast.` };
  if (hw.gpuGB > 0) {
    const roomy = hw.ramGB >= m.cpuRamGB;
    return { level: roomy ? 'ok' : 'slow', text: `Too big for your graphics card's ${Math.round(hw.gpuGB)} GB, so part of it runs on the processor. ${roomy ? 'Slower, but fine.' : 'Slow.'}` };
  }
  if (hw.ramGB >= m.cpuRamGB) return { level: 'ok', text: `Runs on the processor${hw.integratedOnly ? ' (this computer only has built-in graphics)' : ''}. Scenes take around 15 seconds or more.` };
  if (hw.ramGB >= m.minRamGB) return { level: 'slow', text: `Runs on the processor, and slowly: scenes can take a minute or more.` };
  return { level: 'tight', text: `This computer has ${Math.round(hw.ramGB)} GB of memory and this model wants ${m.minRamGB} GB. It will struggle.` };
}

/** The next model down from this one, or undefined if it is already the smallest. */
export function lighterModel(id: string): ModelInfo | undefined {
  const i = MODEL_CATALOG.findIndex((m) => m.id === id);
  return i >= 0 ? MODEL_CATALOG[i + 1] : undefined;
}

/** A reply that takes this long feels broken. */
export const SLOW_REPLY_SECONDS = 25;

/** True when the last few replies have all been slow, not just one (the first one after loading always is). */
export function repliesAreSlow(seconds: number[], threshold = SLOW_REPLY_SECONDS): boolean {
  const last = seconds.slice(-3);
  return last.length >= 3 && [...last].sort((a, b) => a - b)[1] >= threshold;
}

export const modelInfo = (id: string): ModelInfo | undefined => MODEL_CATALOG.find((m) => m.id === id);

/** The model set up by default for Ollama users. */
export const DEFAULT_OLLAMA_MODEL = 'gemma4:12b';
/** Roughly how big that model is to download from Ollama, in GB (measured: 8.0). Used only to set expectations. */
export const DEFAULT_OLLAMA_MODEL_GB = 8;

/** Where Ollama listens. IPv4 on purpose: "localhost" can resolve to an address Ollama is not on. */
export const OLLAMA_URL = 'http://127.0.0.1:11434';

/* ───────────────────────── Status ───────────────────────── */

export type EngineState =
  /** The built-in engine program is missing from this install (a broken or incomplete build). */
  | 'no-engine'
  /** Ollama is not installed. */
  | 'no-ollama'
  /** Installed but not running. */
  | 'not-running'
  /** Running (or ready to run), but the model is not downloaded yet. */
  | 'missing-model'
  | 'ready';

export interface EngineStatus {
  provider: Provider;
  state: EngineState;
  running: boolean;
  /** The model the player chose (a catalog id, or an Ollama name). */
  model: string;
  hasModel: boolean;
  /** Total memory in this computer, in GB. */
  ramGB: number;
  /** True if this app started the engine (and will stop it on exit). */
  weStarted: boolean;
  /** Where to send requests once running: an OpenAI-compatible address ending in /v1. */
  baseUrl: string;
  /** The key the engine requires, if any. A new one is made every launch. */
  apiKey: string;
  /** The model name to put in each request. */
  requestModel: string;
  /** Built-in only: the model file came with the app, or was downloaded. */
  modelSource: 'with-app' | 'downloaded' | null;
  /** Built-in only: which build of the engine is in use ("vulkan" uses the graphics card, "cpu" does not). */
  engineVariant: string | null;
  /** Ollama only. */
  ollamaPath: string | null;
  /** Ollama only: everything it has downloaded. */
  models: string[];
  /** Why the engine could not start, in plain words, if that just happened. */
  error?: string;
}

/** A model file on this computer. */
export interface InstalledModel {
  id: string;
  label: string;
  /** Size on disk. For a half-finished download, what has arrived so far. */
  bytes: number;
  /** "with-app" files came inside the app and cannot be deleted here. */
  source: 'with-app' | 'downloaded';
  /** A download that was stopped partway. */
  partial: boolean;
  /** The engine is running this one right now. */
  inUse: boolean;
}

export interface PullProgress {
  status: string;
  /** 0 to 100 once the size is known, otherwise null. */
  percent: number | null;
  /** Bytes downloaded and total, when known. */
  completed: number | null;
  total: number | null;
  done: boolean;
}

export interface DesktopBridge {
  isDesktop: true;
  appVersion: string;
  /** What is installed and running right now. */
  status(sel: EngineSelection): Promise<EngineStatus>;
  /** Start the engine if it is not already running. */
  startEngine(sel: EngineSelection): Promise<EngineStatus>;
  /** Download the model, reporting progress. Rejects if cancelled or it fails. */
  pullModel(sel: EngineSelection, onProgress: (p: PullProgress) => void): Promise<void>;
  cancelPull(): Promise<void>;
  /** Load the model into memory so the first scene is not slow. Never throws. */
  warmUp(sel: EngineSelection): Promise<boolean>;
  /** What this computer has to run a model with. */
  hardware(): Promise<Hardware>;
  /** The model files on this computer. */
  installedModels(): Promise<InstalledModel[]>;
  /** Delete a downloaded model file to free the space. Rejects if it is in use or came with the app. */
  deleteModel(id: string): Promise<void>;
  /** Opens the official Ollama download page in the browser. */
  openOllamaDownload(): Promise<void>;
}

declare global {
  interface Window {
    hoopsDesktop?: DesktopBridge;
  }
}

/** The desktop bridge, or null when running in a normal browser. */
export function getDesktop(): DesktopBridge | null {
  return typeof window !== 'undefined' ? (window.hoopsDesktop ?? null) : null;
}

/* ───────────────────────── Names ───────────────────────── */

/** An Ollama model name is letters, numbers and a few separators, like "gemma4:12b" or "library/llama3:8b". */
const MODEL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/:]{0,99}$/;
export const isValidModelName = (m: unknown): m is string => typeof m === 'string' && MODEL_NAME_RE.test(m.trim());

/** Whether this is a selection the shell understands. */
export function isValidSelection(s: unknown): s is EngineSelection {
  if (!s || typeof s !== 'object') return false;
  const { provider, model } = s as Partial<EngineSelection>;
  if (provider === 'bundled') return typeof model === 'string' && MODEL_CATALOG.some((m) => m.id === model);
  if (provider === 'ollama') return isValidModelName(model);
  return false;
}

/** "gemma4:12b" and "gemma4:12b-it" are different; a bare name means ":latest". */
export function normalizeModelName(name: string): string {
  const n = name.trim();
  return n.includes(':') ? n : `${n}:latest`;
}

export function modelInstalled(installed: string[], wanted: string): boolean {
  const w = normalizeModelName(wanted);
  return installed.some((m) => normalizeModelName(m) === w);
}
