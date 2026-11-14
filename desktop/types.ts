import type { EngineStatus, PullProgress } from '../src/desktop/bridge';

/**
 * What the shell needs from an AI engine, whichever one it is (the built-in model, or Ollama).
 * "model" is a catalog id for the built-in engine and an Ollama name like "gemma4:12b" for Ollama.
 */
export interface AIEngine {
  /** True if this app started the engine, and so should stop it on exit. */
  readonly weStarted: boolean;
  status(model: string): Promise<EngineStatus>;
  /** Start the engine if it is not already running, and wait until it can answer. */
  start(model: string): Promise<EngineStatus>;
  /** Download the model. Rejects if cancelled or if it fails. */
  pull(model: string, onProgress: (p: PullProgress) => void): Promise<void>;
  cancelPull(): void;
  /** Load the model into memory so the first reply is not slow. Never throws. */
  warm(model: string): Promise<boolean>;
  stop(): void;
}
