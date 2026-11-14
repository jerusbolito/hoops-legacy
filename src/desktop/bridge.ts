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
  minRamGB: number;
  license: string;
}

/** The models the built-in engine can run. Sizes and checksums come from desktop/pins.json. */
export const MODEL_CATALOG: ModelInfo[] = pins.models.map((m) => ({ id: m.id, label: m.label, blurb: m.blurb, bytes: m.bytes, minRamGB: m.minRamGB, license: m.license }));

/** The best model for the stories, and the one set up by default. */
export const DEFAULT_BUNDLED_MODEL = 'gemma-4-12b';

/** Picks the best model that will run comfortably in this much memory. */
export function recommendModel(ramGB: number): string {
  if (ramGB >= 16) return 'gemma-4-12b';
  if (ramGB >= 10) return 'gemma-4-e4b';
  return 'gemma-4-e2b';
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
