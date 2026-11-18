import { GameStateSchema, SAVE_VERSION, type GameState } from './schemas';

/**
 * Save migrations. Additive changes (a new field) do not need one: give the Zod field a `.default(...)`.
 * Use a migration when a field is renamed, reshaped or removed. To add one:
 *   1. bump `SAVE_VERSION` in schemas.ts to N+1,
 *   2. add `MIGRATIONS[N] = (raw) => ...` here (it receives the version-N JSON and returns version N+1 JSON),
 *   3. add a fixture test in migrate.test.ts.
 * `MIGRATIONS[n]` upgrades a save from version n to n + 1.
 */
export const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export class SaveTooNewError extends Error {
  constructor(public found: number) {
    super(`This save was made by a newer version of the game (save format ${found}). Update the app to open it.`);
    this.name = 'SaveTooNewError';
  }
}

/** Brings raw save JSON up to the current format. Saves with no version are treated as version 1. */
export function migrateSave(raw: unknown, target = SAVE_VERSION, migrations = MIGRATIONS): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  let cur = { ...(raw as Record<string, unknown>) };
  let v = typeof cur.version === 'number' ? cur.version : 1;
  if (v > target) throw new SaveTooNewError(v);
  while (v < target) {
    const step = migrations[v];
    if (!step) throw new Error(`No migration from save format ${v} to ${v + 1}.`);
    cur = step(cur);
    v++;
    cur.version = v;
  }
  return cur;
}

/** Migrates, then validates. Throws if the save cannot be read. */
export function parseSave(raw: unknown): GameState {
  return GameStateSchema.parse(migrateSave(raw));
}

export function safeParseSave(raw: unknown): { success: true; data: GameState } | { success: false } {
  try {
    return { success: true, data: parseSave(raw) };
  } catch {
    return { success: false };
  }
}
