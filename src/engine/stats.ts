import type { GameLogEntry, Level, PlayerLine } from '../state/schemas';

export interface StatTotals {
  gp: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  wins: number;
}

export interface StatAverages {
  gp: number;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  topg: number;
  fgPct: number;
  tpPct: number;
  ftPct: number;
}

export function totals(entries: GameLogEntry[]): StatTotals {
  const t: StatTotals = { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, wins: 0 };
  for (const e of entries) {
    const l = e.line;
    if (l.sec <= 0) continue;
    t.gp++;
    t.min += l.sec / 60;
    t.pts += l.pts;
    t.reb += l.orb + l.drb;
    t.ast += l.ast;
    t.stl += l.stl;
    t.blk += l.blk;
    t.tov += l.tov;
    t.fgm += l.fgm;
    t.fga += l.fga;
    t.tpm += l.tpm;
    t.tpa += l.tpa;
    t.ftm += l.ftm;
    t.fta += l.fta;
    if (e.teamScore > e.oppScore) t.wins++;
  }
  return t;
}

export function averages(t: StatTotals): StatAverages {
  const g = Math.max(1, t.gp);
  const pct = (m: number, a: number) => (a > 0 ? m / a : 0);
  return {
    gp: t.gp,
    mpg: t.min / g,
    ppg: t.pts / g,
    rpg: t.reb / g,
    apg: t.ast / g,
    spg: t.stl / g,
    bpg: t.blk / g,
    topg: t.tov / g,
    fgPct: pct(t.fgm, t.fga),
    tpPct: pct(t.tpm, t.tpa),
    ftPct: pct(t.ftm, t.fta),
  };
}

export function seasonEntries(log: GameLogEntry[], season: number): GameLogEntry[] {
  return log.filter((e) => e.season === season);
}

export function seasonAverages(log: GameLogEntry[], season: number): StatAverages {
  return averages(totals(seasonEntries(log, season)));
}

export interface SeasonRow {
  season: number;
  level: Level;
  year: number;
  teamId: string;
  avg: StatAverages;
}

export function seasonRows(log: GameLogEntry[]): SeasonRow[] {
  const bySeason = new Map<number, GameLogEntry[]>();
  for (const e of log) {
    if (!bySeason.has(e.season)) bySeason.set(e.season, []);
    bySeason.get(e.season)!.push(e);
  }
  return [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, es]) => ({ season, level: es[0].level, year: es[0].year, teamId: es[es.length - 1].teamId, avg: averages(totals(es)) }));
}

export function lineSummary(l: PlayerLine): string {
  const reb = l.orb + l.drb;
  const parts = [`${l.pts} PTS`, `${reb} REB`, `${l.ast} AST`];
  if (l.stl) parts.push(`${l.stl} STL`);
  if (l.blk) parts.push(`${l.blk} BLK`);
  parts.push(`${l.fgm}-${l.fga} FG`);
  if (l.tpa) parts.push(`${l.tpm}-${l.tpa} 3P`);
  return parts.join(', ');
}

export function fmt1(n: number) {
  return n.toFixed(1);
}

export function fmtPct(n: number) {
  return n > 0 ? `${(n * 100).toFixed(1)}%` : '—';
}

/** Game score (Hollinger), used to decide great/bad games. */
export function gameScore(l: PlayerLine): number {
  return l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.orb + 0.3 * l.drb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov;
}
