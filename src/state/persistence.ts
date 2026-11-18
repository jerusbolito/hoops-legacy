import Dexie, { type Table } from 'dexie';
import type { LLMConfig } from '../llm/types';
import { upgradeSave } from '../engine/storyAthletes';
import { ensureGoals } from '../engine/goals';
import { scoredPlayers } from '../engine/awards';
import { backfillHonors } from '../engine/honors';
import { backfillRecords } from '../engine/records';
import { LegendSchema, type GameState, type Legend } from './schemas';
import { parseSave } from './migrate';
import { LEVEL_CONFIG, yearLabel } from '../data/teams';

export interface SaveRow {
  id: string;
  name: string;
  subtitle: string;
  updatedAt: number;
  state: GameState;
}

/**
 * What the device knows about a row's relationship with the cloud. `rev` is the cloud revision this device last
 * saw (0 = never synced). `dirty` means changed here since then. `deleted` is a tombstone: the row is gone locally
 * but the cloud has not been told yet.
 */
export interface SyncMeta {
  key: string; // 'save:<id>' or 'legend:<id>'
  kind: 'save' | 'legend';
  id: string;
  rev: number;
  dirty: 0 | 1;
  deleted: 0 | 1;
}
/** The account this device's sync bookkeeping belongs to (key 'account'). */
export interface SyncAccount {
  key: 'account';
  userId: string;
}

class HoopsDB extends Dexie {
  saves!: Table<SaveRow, string>;
  /** The Hall of Fame: one row per finished career, across every save. */
  legends!: Table<Legend, string>;
  /** Cloud-sync bookkeeping. Never part of a save or an export. */
  sync!: Table<SyncMeta | SyncAccount, string>;
  constructor() {
    super('hoops-legacy');
    this.version(1).stores({ saves: 'id, updatedAt' });
    this.version(2).stores({ saves: 'id, updatedAt', legends: 'id, score, retiredAt' });
    // every row that exists before sign-in is simply "never synced", which is what a missing meta row means
    this.version(3).stores({ saves: 'id, updatedAt', legends: 'id, score, retiredAt', sync: 'key, kind, dirty' });
  }
}

let _db: HoopsDB | null = null;
const db = () => (_db ??= new HoopsDB());

function describe(state: GameState): { name: string; subtitle: string } {
  const a = state.athletes[state.player.athleteId];
  const team = state.teams[state.career.teamId];
  const c = state.career;
  return {
    name: `${a.firstName} ${a.lastName}`,
    subtitle: `${state.legacy.generation > 1 ? `Generation ${state.legacy.generation} · ` : ''}${LEVEL_CONFIG[c.level].label} · ${yearLabel(c.level, c.year)} · ${team?.name ?? ''} · Season ${c.season}${c.phase === 'retired' ? ' · Retired' : ''}`,
  };
}

const saveKey = (id: string) => `save:${id}`;
const legendKey = (id: string) => `legend:${id}`;

/** Marks a row as changed on this device, keeping the cloud revision it was last known at. */
async function markDirty(kind: SyncMeta['kind'], id: string): Promise<void> {
  const key = kind === 'save' ? saveKey(id) : legendKey(id);
  const prev = (await db().sync.get(key)) as SyncMeta | undefined;
  await db().sync.put({ key, kind, id, rev: prev?.rev ?? 0, dirty: 1, deleted: 0 });
}

/** Listeners are told after every local change, so cloud sync can schedule an upload. */
const changeListeners = new Set<() => void>();
export function onLocalChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
const notifyChange = () => changeListeners.forEach((fn) => fn());

export async function saveGame(state: GameState): Promise<void> {
  await db().transaction('rw', db().saves, db().sync, async () => {
    await db().saves.put({ id: state.id, ...describe(state), updatedAt: Date.now(), state });
    await markDirty('save', state.id);
  });
  notifyChange();
}

export async function listSaves(): Promise<Omit<SaveRow, 'state'>[]> {
  const rows = await db().saves.orderBy('updatedAt').reverse().toArray();
  return rows.map(({ id, name, subtitle, updatedAt }) => ({ id, name, subtitle, updatedAt }));
}

export async function loadGame(id: string): Promise<GameState | null> {
  const row = await db().saves.get(id);
  if (!row) return null;
  const state = parseSave(row.state);
  upgradeSave(state);
  ensureGoals(state); // saves from before goals existed get theirs here
  backfillRecords(state);
  backfillHonors(state, scoredPlayers(state));
  return state;
}

/* ── Hall of Fame ── */

/** Files a finished career. Filing the same career twice only ever writes one row. */
export async function saveLegend(legend: Legend): Promise<void> {
  const prev = await db().legends.get(legend.id);
  // keep the first filing's date, so reopening a retired save does not reshuffle the order
  await db().transaction('rw', db().legends, db().sync, async () => {
    await db().legends.put({ ...legend, retiredAt: prev?.retiredAt || legend.retiredAt });
    await markDirty('legend', legend.id);
  });
  notifyChange();
}

/** Every legend, best first. A row that no longer fits the format is skipped rather than breaking the screen. */
export async function listLegends(): Promise<Legend[]> {
  const rows = await db().legends.orderBy('score').reverse().toArray();
  const out: Legend[] = [];
  for (const r of rows) {
    const p = LegendSchema.safeParse(r);
    if (p.success) out.push(p.data);
  }
  return out;
}

/** Removes a row and leaves a tombstone so the delete reaches the cloud (a row never synced needs none). */
async function removeRow(kind: SyncMeta['kind'], id: string): Promise<void> {
  const table = kind === 'save' ? db().saves : db().legends;
  const key = kind === 'save' ? saveKey(id) : legendKey(id);
  await db().transaction('rw', table, db().sync, async () => {
    await table.delete(id);
    const prev = (await db().sync.get(key)) as SyncMeta | undefined;
    if (prev && prev.rev > 0) await db().sync.put({ ...prev, dirty: 1, deleted: 1 });
    else await db().sync.delete(key);
  });
  notifyChange();
}

export const deleteLegend = (id: string) => removeRow('legend', id);
export const deleteSave = (id: string) => removeRow('save', id);

/* ── Cloud sync support (used only by src/sync) ── */

export const syncStore = {
  async allMeta(): Promise<SyncMeta[]> {
    return (await db().sync.where('kind').anyOf('save', 'legend').toArray()) as SyncMeta[];
  },
  async meta(kind: SyncMeta['kind'], id: string): Promise<SyncMeta | undefined> {
    return (await db().sync.get(kind === 'save' ? saveKey(id) : legendKey(id))) as SyncMeta | undefined;
  },
  getSave: (id: string) => db().saves.get(id),
  getLegend: (id: string) => db().legends.get(id),
  allSaveIds: async (): Promise<string[]> => (await db().saves.toCollection().primaryKeys()) as string[],
  allLegendIds: async (): Promise<string[]> => (await db().legends.toCollection().primaryKeys()) as string[],
  /** Records that the cloud now holds `rev` of this row and nothing is waiting to upload. */
  async markSynced(kind: SyncMeta['kind'], id: string, rev: number): Promise<void> {
    const key = kind === 'save' ? saveKey(id) : legendKey(id);
    await db().sync.put({ key, kind, id, rev, dirty: 0, deleted: 0 });
  },
  /** Forgets a row's bookkeeping (it is gone from both sides). */
  async forget(kind: SyncMeta['kind'], id: string): Promise<void> {
    await db().sync.delete(kind === 'save' ? saveKey(id) : legendKey(id));
  },
  /** Stores a save that came down from the cloud. Does not mark it as changed here. */
  async putSaveFromCloud(row: SaveRow, rev: number): Promise<void> {
    await db().transaction('rw', db().saves, db().sync, async () => {
      await db().saves.put(row);
      await this.markSynced('save', row.id, rev);
    });
  },
  async putLegendFromCloud(legend: Legend, rev: number): Promise<void> {
    await db().transaction('rw', db().legends, db().sync, async () => {
      await db().legends.put(legend);
      await this.markSynced('legend', legend.id, rev);
    });
  },
  async removeFromCloud(kind: SyncMeta['kind'], id: string): Promise<void> {
    const table = kind === 'save' ? db().saves : db().legends;
    await db().transaction('rw', table, db().sync, async () => {
      await table.delete(id);
      await this.forget(kind, id);
    });
  },
  /** Gives a row a new id (used by "keep both"): the old id's bookkeeping is dropped. */
  async renameSave(oldId: string, newId: string): Promise<void> {
    await db().transaction('rw', db().saves, db().sync, async () => {
      const row = await db().saves.get(oldId);
      if (!row) return;
      await db().saves.delete(oldId);
      await db().saves.put({ ...row, id: newId, state: { ...row.state, id: newId } });
      await db().sync.delete(saveKey(oldId));
      await db().sync.put({ key: saveKey(newId), kind: 'save', id: newId, rev: 0, dirty: 1, deleted: 0 });
    });
  },
  /** If a different account signs in than the one this bookkeeping belongs to, start fresh: everything is new to it. */
  async bindAccount(userId: string): Promise<void> {
    const cur = (await db().sync.get('account')) as SyncAccount | undefined;
    if (cur?.userId === userId) return;
    await db().transaction('rw', db().sync, db().saves, db().legends, async () => {
      await db().sync.where('kind').anyOf('save', 'legend').delete();
      await db().sync.put({ key: 'account', userId });
      for (const id of (await db().saves.toCollection().primaryKeys()) as string[]) await markDirty('save', id);
      for (const id of (await db().legends.toCollection().primaryKeys()) as string[]) await markDirty('legend', id);
    });
  },
};

/** Saves never contain the API key: it lives only in browser storage under a separate key. */
export function exportSave(state: GameState): string {
  return JSON.stringify(state);
}

export function importSave(json: string): GameState {
  const parsed = parseSave(JSON.parse(json));
  upgradeSave(parsed);
  ensureGoals(parsed);
  backfillRecords(parsed);
  backfillHonors(parsed, scoredPlayers(parsed));
  return { ...parsed, updatedAt: Date.now() };
}

/* ── LLM config ── */

const LLM_KEY = 'hoops.llm';

export function loadLLMConfig(): { config: LLMConfig; remember: boolean } | null {
  try {
    const local = localStorage.getItem(LLM_KEY);
    if (local) return { config: JSON.parse(local), remember: true };
    const session = sessionStorage.getItem(LLM_KEY);
    if (session) return { config: JSON.parse(session), remember: false };
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function storeLLMConfig(config: LLMConfig, remember: boolean) {
  try {
    localStorage.removeItem(LLM_KEY);
    sessionStorage.removeItem(LLM_KEY);
    (remember ? localStorage : sessionStorage).setItem(LLM_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable */
  }
}

export function clearLLMConfig() {
  try {
    localStorage.removeItem(LLM_KEY);
    sessionStorage.removeItem(LLM_KEY);
  } catch {
    /* ignore */
  }
}

/** Test helper: wipes the local database, as if this were a brand-new device. */
export async function resetLocalDbForTests(): Promise<void> {
  _db?.close();
  _db = null;
  await Dexie.delete('hoops-legacy');
}
