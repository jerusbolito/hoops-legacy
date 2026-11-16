import type { GameLogEntry, GameState, Level, PlayerLine, RecordEntry } from '../state/schemas';

/**
 * The record books: the ten best of everything, per league level, for one game and for a whole season. Every player in
 * the league counts, not only you. Games are filed as they are simulated; seasons are filed when the season closes
 * (before the graduates leave). Names are copied in, so a record outlives the player and the league it was set in.
 * Records are never reset, so a later generation chases the family's marks.
 */

export type Scope = 'game' | 'season';
export type RecordLevel = Level | 'all';

export interface StatDef {
  key: string;
  label: string;
  short: string;
}

const COUNTS: StatDef[] = [
  { key: 'pts', label: 'Points', short: 'PTS' },
  { key: 'reb', label: 'Rebounds', short: 'REB' },
  { key: 'ast', label: 'Assists', short: 'AST' },
  { key: 'stl', label: 'Steals', short: 'STL' },
  { key: 'blk', label: 'Blocks', short: 'BLK' },
  { key: 'tpm', label: 'Threes made', short: '3PM' },
];
export const GAME_STATS: StatDef[] = COUNTS;
export const SEASON_STATS: StatDef[] = [
  ...COUNTS,
  { key: 'ppg', label: 'Points per game', short: 'PPG' },
  { key: 'rpg', label: 'Rebounds per game', short: 'RPG' },
  { key: 'apg', label: 'Assists per game', short: 'APG' },
];
export const statsFor = (scope: Scope) => (scope === 'game' ? GAME_STATS : SEASON_STATS);

export const LEVELS: Level[] = ['hs', 'college', 'pro'];
export const SIZE = 10;
/** Games an average needs before it counts (an 8-for-8 season of one game is not a record). */
export const MIN_GP = 8;

const keyOf = (scope: Scope, level: Level, stat: string) => `${scope}:${level}:${stat}`;

/** Puts an entry on a list if it is good enough. Season entries never repeat for the same player and year. */
function put(state: GameState, key: string, e: RecordEntry, unique: boolean): boolean {
  if (!(e.value > 0)) return false;
  const list = (state.records[key] ??= []);
  if (list.length >= SIZE && e.value <= list[list.length - 1].value) return false;
  if (unique && list.some((x) => x.athleteId === e.athleteId && x.season === e.season && x.level === e.level)) return false;
  list.push(e);
  list.sort((a, b) => b.value - a.value); // stable: on a tie the older mark stays ahead
  list.length = Math.min(list.length, SIZE);
  return list.includes(e);
}

const lineValue = (l: PlayerLine, stat: string): number => {
  switch (stat) {
    case 'pts':
      return l.pts;
    case 'reb':
      return l.orb + l.drb;
    case 'ast':
      return l.ast;
    case 'stl':
      return l.stl;
    case 'blk':
      return l.blk;
    default:
      return l.tpm;
  }
};

const nameOf = (state: GameState, id: string) => {
  const a = state.athletes[id];
  return a ? `${a.firstName} ${a.lastName}` : '';
};

/** Called for every player line of every game simulated. Returns true if it set a record the user owns. */
export function noteGameRecords(state: GameState, l: PlayerLine, teamId: string, oppId: string): boolean {
  const name = nameOf(state, l.athleteId);
  if (!name) return false;
  const level = state.league.level;
  const user = l.athleteId === state.player.athleteId;
  let hit = false;
  for (const s of GAME_STATS) {
    const value = lineValue(l, s.key);
    if (value <= 0) continue;
    const e: RecordEntry = { athleteId: l.athleteId, name, team: state.teams[teamId]?.name ?? '', opp: state.teams[oppId]?.name ?? '', season: state.career.season, level, value, gp: 0, user };
    if (put(state, keyOf('game', level, s.key), e, false) && user) hit = true;
  }
  return hit;
}

/** File the finished season for every player who played it. Safe to call twice. */
export function closeSeasonRecords(state: GameState) {
  const level = state.league.level;
  const season = state.career.season;
  for (const [id, s] of Object.entries(state.leagueStats)) {
    const name = nameOf(state, id);
    if (!name || s.gp <= 0) continue;
    const user = id === state.player.athleteId;
    const team = state.teams[state.athletes[id].teamId ?? '']?.name ?? '';
    const base = { athleteId: id, name, team, opp: '', season, level, gp: s.gp, user };
    const totals: Record<string, number> = { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tpm: s.tpm };
    for (const [k, v] of Object.entries(totals)) put(state, keyOf('season', level, k), { ...base, value: v }, true);
    if (s.gp >= MIN_GP) {
      const avg = (v: number) => Math.round((v / s.gp) * 10) / 10;
      put(state, keyOf('season', level, 'ppg'), { ...base, value: avg(s.pts) }, true);
      put(state, keyOf('season', level, 'rpg'), { ...base, value: avg(s.reb) }, true);
      put(state, keyOf('season', level, 'apg'), { ...base, value: avg(s.ast) }, true);
    }
  }
}

/**
 * Saves from before the record books: rebuild the user's own marks from the game log, and file a finished season
 * still sitting in the league stats. Does nothing once any records exist.
 */
export function backfillRecords(state: GameState) {
  if (Object.keys(state.records).length || !state.gameLog.length) return;
  const me = state.player.athleteId;
  const name = nameOf(state, me);
  if (!name) return;
  const teamName = (id: string) => state.teams[id]?.name ?? '';
  for (const g of state.gameLog) {
    if (g.line.sec <= 0) continue;
    for (const s of GAME_STATS) {
      const value = lineValue(g.line, s.key);
      if (value > 0) put(state, keyOf('game', g.level, s.key), { athleteId: me, name, team: teamName(g.teamId), opp: teamName(g.oppId), season: g.season, level: g.level, value, gp: 0, user: true }, false);
    }
  }
  const bySeason = new Map<number, GameLogEntry[]>();
  for (const g of state.gameLog) if (g.line.sec > 0) bySeason.set(g.season, [...(bySeason.get(g.season) ?? []), g]);
  for (const [season, rows] of bySeason) {
    if (season >= state.career.season) continue; // this one is still being played
    const sum = (f: (l: PlayerLine) => number) => rows.reduce((t, r) => t + f(r.line), 0);
    const level = rows[0].level;
    const base = { athleteId: me, name, team: teamName(rows[0].teamId), opp: '', season, level, gp: rows.length, user: true };
    const t: Record<string, number> = { pts: sum((l) => l.pts), reb: sum((l) => l.orb + l.drb), ast: sum((l) => l.ast), stl: sum((l) => l.stl), blk: sum((l) => l.blk), tpm: sum((l) => l.tpm) };
    for (const [k, v] of Object.entries(t)) put(state, keyOf('season', level, k), { ...base, value: v }, true);
    if (rows.length >= MIN_GP) {
      for (const [k, src] of [['ppg', 'pts'], ['rpg', 'reb'], ['apg', 'ast']] as const) put(state, keyOf('season', level, k), { ...base, value: Math.round((t[src] / rows.length) * 10) / 10 }, true);
    }
  }
  // a season that has just ended is still in the league stats
  if (['offseason', 'recruiting', 'draft', 'free_agency', 'retired'].includes(state.career.phase) && !bySeason.has(state.career.season)) closeSeasonRecords(state);
}

/** The ten best of one stat. "All" merges the three leagues. */
export function recordList(state: GameState, scope: Scope, level: RecordLevel, stat: string): RecordEntry[] {
  if (level !== 'all') return state.records[keyOf(scope, level, stat)] ?? [];
  return LEVELS.flatMap((l) => state.records[keyOf(scope, l, stat)] ?? [])
    .sort((a, b) => b.value - a.value)
    .slice(0, SIZE);
}

export const formatValue = (stat: string, v: number) => (stat.endsWith('pg') ? v.toFixed(1) : String(v));

export interface Best {
  label: string;
  value: string;
  detail: string;
  /** Place in the record book (1 to 10), when it made one. */
  rank: number | null;
}

/** Your own career highs, from the game log, with where each stands in the record books. */
export function careerHighs(state: GameState): { games: Best[]; seasons: Best[] } {
  const log = state.gameLog.filter((g) => g.line.sec > 0);
  const teamName = (id: string) => state.teams[id]?.name ?? 'Unknown';
  const rankOf = (scope: Scope, stat: string, value: number, season: number, level: Level): number | null => {
    const i = recordList(state, scope, 'all', stat).findIndex((e) => e.user && e.value === value && e.season === season && e.level === level);
    return i >= 0 ? i + 1 : null;
  };
  const place = (l: Level) => (l === 'hs' ? 'HS' : l === 'college' ? 'College' : 'Pro');

  const games: Best[] = [];
  const extra: { key: string; label: string; f: (l: PlayerLine) => number }[] = [
    { key: 'fgm', label: 'Field goals', f: (l) => l.fgm },
    { key: 'ftm', label: 'Free throws', f: (l) => l.ftm },
  ];
  const defs = [...GAME_STATS.map((s) => ({ key: s.key, label: s.label, f: (l: PlayerLine) => lineValue(l, s.key) })), ...extra];
  for (const d of defs) {
    let best: GameLogEntry | null = null;
    for (const g of log) if (!best || d.f(g.line) > d.f(best.line)) best = g;
    if (!best || d.f(best.line) <= 0) continue;
    const v = d.f(best.line);
    games.push({ label: d.label, value: String(v), detail: `vs ${teamName(best.oppId)} · S${best.season} ${place(best.level)}`, rank: rankOf('game', d.key, v, best.season, best.level) });
  }

  const seasons: Best[] = [];
  const bySeason = new Map<number, GameLogEntry[]>();
  for (const g of log) bySeason.set(g.season, [...(bySeason.get(g.season) ?? []), g]);
  const rows = [...bySeason.entries()].map(([season, gs]) => ({ season, gs, level: gs[0].level }));
  const sdefs: { key: string; label: string; avg: boolean; f: (l: PlayerLine) => number }[] = [
    { key: 'ppg', label: 'Points per game', avg: true, f: (l) => l.pts },
    { key: 'rpg', label: 'Rebounds per game', avg: true, f: (l) => l.orb + l.drb },
    { key: 'apg', label: 'Assists per game', avg: true, f: (l) => l.ast },
    { key: 'pts', label: 'Points in a season', avg: false, f: (l) => l.pts },
    { key: 'reb', label: 'Rebounds in a season', avg: false, f: (l) => l.orb + l.drb },
    { key: 'ast', label: 'Assists in a season', avg: false, f: (l) => l.ast },
  ];
  for (const d of sdefs) {
    let best: { season: number; level: Level; v: number; gp: number } | null = null;
    for (const r of rows) {
      if (d.avg && r.gs.length < MIN_GP) continue;
      const tot = r.gs.reduce((t, g) => t + d.f(g.line), 0);
      const v = d.avg ? Math.round((tot / r.gs.length) * 10) / 10 : tot;
      if (!best || v > best.v) best = { season: r.season, level: r.level, v, gp: r.gs.length };
    }
    if (!best || best.v <= 0) continue;
    seasons.push({ label: d.label, value: formatValue(d.key, best.v), detail: `S${best.season} ${place(best.level)} · ${best.gp} games`, rank: rankOf('season', d.key, best.v, best.season, best.level) });
  }
  return { games, seasons };
}
