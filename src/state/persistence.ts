import Dexie, { type Table } from 'dexie';
import type { LLMConfig } from '../llm/types';
import { upgradeSave } from '../engine/storyAthletes';
import { GameStateSchema, type GameState } from './schemas';
import { LEVEL_CONFIG, yearLabel } from '../data/teams';

export interface SaveRow {
  id: string;
  name: string;
  subtitle: string;
  updatedAt: number;
  state: GameState;
}

class HoopsDB extends Dexie {
  saves!: Table<SaveRow, string>;
  constructor() {
    super('hoops-legacy');
    this.version(1).stores({ saves: 'id, updatedAt' });
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
    subtitle: `${LEVEL_CONFIG[c.level].label} · ${yearLabel(c.level, c.year)} · ${team?.name ?? ''} · Season ${c.season}${c.phase === 'retired' ? ' · Retired' : ''}`,
  };
}

export async function saveGame(state: GameState): Promise<void> {
  await db().saves.put({ id: state.id, ...describe(state), updatedAt: Date.now(), state });
}

export async function listSaves(): Promise<Omit<SaveRow, 'state'>[]> {
  const rows = await db().saves.orderBy('updatedAt').reverse().toArray();
  return rows.map(({ id, name, subtitle, updatedAt }) => ({ id, name, subtitle, updatedAt }));
}

export async function loadGame(id: string): Promise<GameState | null> {
  const row = await db().saves.get(id);
  if (!row) return null;
  const state = GameStateSchema.parse(row.state);
  upgradeSave(state);
  return state;
}

export async function deleteSave(id: string): Promise<void> {
  await db().saves.delete(id);
}

/** Saves never contain the API key: it lives only in browser storage under a separate key. */
export function exportSave(state: GameState): string {
  return JSON.stringify(state);
}

export function importSave(json: string): GameState {
  const parsed = GameStateSchema.parse(JSON.parse(json));
  upgradeSave(parsed);
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
