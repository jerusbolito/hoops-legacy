import type { Athlete, GameState, LeagueStatLine } from '../state/schemas';

/**
 * League leaders: every category you would expect in a box-score world, with a qualifying minimum so a player who has
 * taken two shots cannot lead the league in shooting. Also how a player's season is filed away when it ends.
 */

export type StatKey = 'ppg' | 'rpg' | 'orpg' | 'apg' | 'spg' | 'bpg' | 'mpg' | 'topg' | 'fgPct' | 'tpPct' | 'ftPct';

export interface StatDef {
  key: StatKey;
  label: string;
  short: string;
  pct: boolean;
}

export const STAT_DEFS: StatDef[] = [
  { key: 'ppg', label: 'Scoring', short: 'PPG', pct: false },
  { key: 'rpg', label: 'Rebounding', short: 'RPG', pct: false },
  { key: 'apg', label: 'Assists', short: 'APG', pct: false },
  { key: 'spg', label: 'Steals', short: 'SPG', pct: false },
  { key: 'bpg', label: 'Blocks', short: 'BPG', pct: false },
  { key: 'fgPct', label: 'Field goal %', short: 'FG%', pct: true },
  { key: 'tpPct', label: 'Three-point %', short: '3P%', pct: true },
  { key: 'ftPct', label: 'Free throw %', short: 'FT%', pct: true },
  { key: 'orpg', label: 'Offensive rebounds', short: 'ORPG', pct: false },
  { key: 'mpg', label: 'Minutes', short: 'MPG', pct: false },
  { key: 'topg', label: 'Turnovers (most)', short: 'TOPG', pct: false },
];
export const STAT_BY_KEY = Object.fromEntries(STAT_DEFS.map((d) => [d.key, d])) as Record<StatKey, StatDef>;

export interface PerGame {
  gp: number;
  mpg: number;
  ppg: number;
  rpg: number;
  orpg: number;
  drpg: number;
  apg: number;
  spg: number;
  bpg: number;
  topg: number;
  fgPct: number;
  tpPct: number;
  ftPct: number;
  fga: number;
  tpa: number;
  fta: number;
}

export function perGame(s: LeagueStatLine): PerGame {
  const g = Math.max(1, s.gp);
  const pct = (m: number, a: number) => (a > 0 ? m / a : 0);
  return {
    gp: s.gp,
    mpg: s.min / g,
    ppg: s.pts / g,
    rpg: s.reb / g,
    orpg: s.orb / g,
    drpg: s.drb / g,
    apg: s.ast / g,
    spg: s.stl / g,
    bpg: s.blk / g,
    topg: s.tov / g,
    fgPct: pct(s.fgm, s.fga),
    tpPct: pct(s.tpm, s.tpa),
    ftPct: pct(s.ftm, s.fta),
    fga: s.fga,
    tpa: s.tpa,
    fta: s.fta,
  };
}

/** Games the busiest player has played: how far into the season the league is. */
export function gamesSoFar(state: GameState): number {
  let m = 0;
  for (const s of Object.values(state.leagueStats)) if (s.gp > m) m = s.gp;
  return m;
}

/** Enough games, and for a percentage enough attempts, to count. */
export function qualifies(state: GameState, s: LeagueStatLine, key: StatKey, so = gamesSoFar(state)): boolean {
  if (s.gp < Math.max(1, Math.floor(so * 0.5))) return false;
  if (key === 'fgPct') return s.fga >= 3.5 * so;
  if (key === 'tpPct') return s.tpa >= 1.5 * so;
  if (key === 'ftPct') return s.fta >= 1.5 * so;
  return true;
}

export const fmtStat = (key: StatKey, v: number): string => (STAT_BY_KEY[key].pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(1));

export interface LeaderRow {
  rank: number;
  id: string;
  name: string;
  team: string;
  teamId: string;
  value: number;
  display: string;
  gp: number;
  isYou: boolean;
  isRival: boolean;
  isFriend: boolean;
}

function leagueAthletes(state: GameState): Athlete[] {
  return state.league.teamIds.flatMap((t) => state.teams[t].rosterIds).map((id) => state.athletes[id]).filter(Boolean);
}

/** The top of a category, best first. */
export function leaders(state: GameState, key: StatKey, n = 10): LeaderRow[] {
  const rivals = new Set(Object.values(state.npcs).filter((x) => x.role === 'rival' && x.athleteId).map((x) => x.athleteId!));
  const friends = new Set(Object.values(state.npcs).filter((x) => x.role === 'friend' && x.athleteId).map((x) => x.athleteId!));
  const so = gamesSoFar(state);
  const rows = leagueAthletes(state)
    .map((a) => ({ a, s: state.leagueStats[a.id] }))
    .filter((x) => x.s && x.s.gp > 0 && qualifies(state, x.s, key, so))
    .map((x) => ({ a: x.a, v: perGame(x.s)[key] }))
    .sort((p, q) => q.v - p.v || p.a.id.localeCompare(q.a.id))
    .slice(0, n);
  // players level on a number share a rank, the way a real leaderboard does
  const rankAt = (i: number) => rows.findIndex((r) => Math.abs(r.v - rows[i].v) < 1e-9) + 1;
  return rows.map(({ a, v }, i) => ({
    rank: rankAt(i),
    id: a.id,
    name: `${a.firstName} ${a.lastName}`,
    team: a.teamId ? state.teams[a.teamId].name : '',
    teamId: a.teamId ?? '',
    value: v,
    display: fmtStat(key, v),
    gp: state.leagueStats[a.id].gp,
    isYou: a.id === state.player.athleteId,
    isRival: rivals.has(a.id),
    isFriend: friends.has(a.id),
  }));
}

/** Where someone ranks in a category among qualifiers, or null if they do not qualify. */
export function rankOf(state: GameState, id: string, key: StatKey): number | null {
  const so = gamesSoFar(state);
  const s = state.leagueStats[id];
  if (!s || s.gp <= 0 || !qualifies(state, s, key, so)) return null;
  const v = perGame(s)[key];
  let better = 0;
  for (const a of leagueAthletes(state)) {
    const o = state.leagueStats[a.id];
    if (!o || o.gp <= 0 || a.id === id || !qualifies(state, o, key, so)) continue;
    if (perGame(o)[key] > v) better++;
  }
  return better + 1;
}

/** When a season ends, every player's line is filed on them, so next year's card can show last year. */
export function archiveSeasonStats(state: GameState) {
  for (const a of leagueAthletes(state)) {
    const s = state.leagueStats[a.id];
    if (!s || s.gp <= 0) continue;
    const p = perGame(s);
    a.prev = { season: state.career.season, team: a.teamId ? state.teams[a.teamId].name : '', gp: s.gp, mpg: p.mpg, ppg: p.ppg, rpg: p.rpg, apg: p.apg, spg: p.spg, bpg: p.bpg, fgPct: p.fgPct, tpPct: p.tpPct, ftPct: p.ftPct };
  }
}
