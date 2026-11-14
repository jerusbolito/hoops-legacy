import type { GameLogEntry, GameState, Level } from '../state/schemas';
import { overall } from './ratings';
import { gameScore, totals, type StatTotals } from './stats';

/* ───────────────────────── Advanced shooting / production ───────────────────────── */

export interface AdvancedLine {
  gp: number;
  /** True shooting %: points per scoring attempt, counting threes and free throws properly. */
  ts: number;
  /** Effective FG %: FG% with a bonus for threes. */
  efg: number;
  /** Share of shots that are threes. */
  threeRate: number;
  /** Free throw attempts per field goal attempt. */
  ftRate: number;
  /** Assists per turnover. */
  astTov: number;
  /** Points per shot attempt (FGA + 0.44 FTA). */
  ptsPerShot: number;
  /** Per-36-minute production. */
  per36: { pts: number; reb: number; ast: number; stocks: number };
  /** Average Hollinger game score. */
  gmsc: number;
  doubleDoubles: number;
  tripleDoubles: number;
  twentyPlus: number;
}

const div = (a: number, b: number) => (b > 0 ? a / b : 0);

export function advancedLine(entries: GameLogEntry[]): AdvancedLine {
  const t: StatTotals = totals(entries);
  const played = entries.filter((e) => e.line.sec > 0);
  const gs = played.map((e) => gameScore(e.line));
  let dd = 0;
  let td = 0;
  let twenty = 0;
  for (const e of played) {
    const l = e.line;
    const cats = [l.pts, l.orb + l.drb, l.ast, l.stl, l.blk].filter((x) => x >= 10).length;
    if (cats >= 2) dd++;
    if (cats >= 3) td++;
    if (l.pts >= 20) twenty++;
  }
  const per36 = (n: number) => div(n * 36, t.min);
  return {
    gp: t.gp,
    ts: div(t.pts, 2 * (t.fga + 0.44 * t.fta)),
    efg: div(t.fgm + 0.5 * t.tpm, t.fga),
    threeRate: div(t.tpa, t.fga),
    ftRate: div(t.fta, t.fga),
    astTov: div(t.ast, Math.max(1, t.tov)),
    ptsPerShot: div(t.pts, t.fga + 0.44 * t.fta),
    per36: { pts: per36(t.pts), reb: per36(t.reb), ast: per36(t.ast), stocks: per36(t.stl + t.blk) },
    gmsc: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : 0,
    doubleDoubles: dd,
    tripleDoubles: td,
    twentyPlus: twenty,
  };
}

/* ───────────────────────── Game-by-game form ───────────────────────── */

export interface FormPoint {
  n: number;
  gmsc: number;
  /** Rolling average of the last `window` games. */
  rolling: number;
  pts: number;
  won: boolean;
  playoff: boolean;
  season: number;
  oppId: string;
}

export function formSeries(log: GameLogEntry[], window = 5): FormPoint[] {
  const played = log.filter((e) => e.line.sec > 0);
  const gs = played.map((e) => gameScore(e.line));
  return played.map((e, i) => {
    const slice = gs.slice(Math.max(0, i - window + 1), i + 1);
    return {
      n: i + 1,
      gmsc: gs[i],
      rolling: slice.reduce((a, b) => a + b, 0) / slice.length,
      pts: e.line.pts,
      won: e.teamScore > e.oppScore,
      playoff: e.playoff,
      season: e.season,
      oppId: e.oppId,
    };
  });
}

/** Spread of game scores: lower means steadier. Reported as a label, since the raw number means little to a player. */
export function consistency(series: FormPoint[]): { stdev: number; label: string } {
  if (series.length < 4) return { stdev: 0, label: 'Not enough games' };
  const mean = series.reduce((a, p) => a + p.gmsc, 0) / series.length;
  const sd = Math.sqrt(series.reduce((a, p) => a + (p.gmsc - mean) ** 2, 0) / series.length);
  const label = sd < 4.5 ? 'Metronome' : sd < 7 ? 'Steady' : sd < 9.5 ? 'Streaky' : 'Boom or bust';
  return { stdev: sd, label };
}

export interface Split {
  label: string;
  gp: number;
  ppg: number;
  rpg: number;
  apg: number;
  ts: number;
}

export function splits(log: GameLogEntry[]): Split[] {
  const mk = (label: string, es: GameLogEntry[]): Split | null => {
    const t = totals(es);
    if (!t.gp) return null;
    return { label, gp: t.gp, ppg: t.pts / t.gp, rpg: t.reb / t.gp, apg: t.ast / t.gp, ts: div(t.pts, 2 * (t.fga + 0.44 * t.fta)) };
  };
  const won = (e: GameLogEntry) => e.teamScore > e.oppScore;
  const margin = (e: GameLogEntry) => Math.abs(e.teamScore - e.oppScore);
  return [
    mk('Wins', log.filter(won)),
    mk('Losses', log.filter((e) => !won(e))),
    mk('Regular season', log.filter((e) => !e.playoff)),
    mk('Playoffs', log.filter((e) => e.playoff)),
    mk('Close games (≤6)', log.filter((e) => margin(e) <= 6)),
    mk('Blowouts (15+)', log.filter((e) => margin(e) >= 15)),
  ].filter((s): s is Split => !!s);
}

export function bestGames(log: GameLogEntry[], n = 3): GameLogEntry[] {
  return [...log].filter((e) => e.line.sec > 0).sort((a, b) => gameScore(b.line) - gameScore(a.line)).slice(0, n);
}

/* ───────────────────────── League-wide player table ───────────────────────── */

export interface PlayerRow {
  id: string;
  name: string;
  teamId: string | null;
  position: string;
  age: number;
  ovr: number;
  potential: number;
  gp: number;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  /** Per-36 box production (pts + reb + ast + stl + blk), a cheap overall-impact number. */
  impact36: number;
  /** Production relative to rating: positive means outplaying the rating. */
  overPerform: number;
  isUser: boolean;
}

export function playerRows(state: GameState, minGames = 1): PlayerRow[] {
  const rows: PlayerRow[] = [];
  for (const [id, s] of Object.entries(state.leagueStats)) {
    const a = state.athletes[id];
    if (!a || s.gp < minGames || s.min <= 0) continue;
    const per36 = (n: number) => (n * 36) / s.min;
    rows.push({
      id,
      name: `${a.firstName} ${a.lastName}`,
      teamId: a.teamId,
      position: a.position,
      age: a.age,
      ovr: overall(a.ratings),
      potential: a.potential,
      gp: s.gp,
      mpg: s.min / s.gp,
      ppg: s.pts / s.gp,
      rpg: s.reb / s.gp,
      apg: s.ast / s.gp,
      spg: s.stl / s.gp,
      bpg: s.blk / s.gp,
      impact36: per36(s.pts + s.reb + s.ast + s.stl + s.blk),
      overPerform: 0,
      isUser: id === state.player.athleteId,
    });
  }
  // outplaying the rating = impact above what a player of this overall usually produces in this league
  if (rows.length >= 4) {
    const n = rows.length;
    const mx = rows.reduce((a, r) => a + r.ovr, 0) / n;
    const my = rows.reduce((a, r) => a + r.impact36, 0) / n;
    const sxx = rows.reduce((a, r) => a + (r.ovr - mx) ** 2, 0);
    const slope = sxx > 0 ? rows.reduce((a, r) => a + (r.ovr - mx) * (r.impact36 - my), 0) / sxx : 0;
    for (const r of rows) r.overPerform = r.impact36 - (my + slope * (r.ovr - mx));
  }
  return rows;
}

/** Percentile (0-100) of `value` among `values`; ties count half. */
export function percentile(values: number[], value: number): number {
  if (!values.length) return 0;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return Math.round(((below + equal / 2) / values.length) * 100);
}

export interface PercentileRow {
  key: string;
  label: string;
  value: string;
  pct: number;
}

export function userPercentiles(rows: PlayerRow[]): PercentileRow[] {
  const me = rows.find((r) => r.isUser);
  if (!me || rows.length < 5) return [];
  const spec: { key: keyof PlayerRow; label: string; fmt: (n: number) => string }[] = [
    { key: 'ovr', label: 'Overall', fmt: (n) => `${n}` },
    { key: 'ppg', label: 'Points', fmt: (n) => n.toFixed(1) },
    { key: 'rpg', label: 'Rebounds', fmt: (n) => n.toFixed(1) },
    { key: 'apg', label: 'Assists', fmt: (n) => n.toFixed(1) },
    { key: 'spg', label: 'Steals', fmt: (n) => n.toFixed(1) },
    { key: 'bpg', label: 'Blocks', fmt: (n) => n.toFixed(1) },
    { key: 'impact36', label: 'Impact / 36', fmt: (n) => n.toFixed(1) },
  ];
  return spec.map((s) => {
    const vals = rows.map((r) => r[s.key] as number);
    const v = me[s.key] as number;
    return { key: s.key as string, label: s.label, value: s.fmt(v), pct: percentile(vals, v) };
  });
}

/* ───────────────────────── Team analytics ───────────────────────── */

export interface TeamAnalyticsRow {
  teamId: string;
  w: number;
  l: number;
  gp: number;
  ppg: number;
  oppg: number;
  margin: number;
  /** Win % expected from points scored/allowed (Pythagorean). */
  pythag: number;
  /** Actual wins minus expected wins: positive means lucky, negative means unlucky. */
  luck: number;
  /** Rank by average scoring margin (1 = best). */
  rank: number;
}

const PYTHAG_EXPONENT: Record<Level, number> = { hs: 10, college: 11, pro: 14 };

export function teamAnalytics(state: GameState): TeamAnalyticsRow[] {
  const exp = PYTHAG_EXPONENT[state.league.level];
  const rows = state.league.teamIds
    .map((id) => {
      const s = state.league.standings[id];
      if (!s) return null;
      const gp = s.w + s.l;
      if (!gp) return null;
      const pyth = s.pf ** exp / (s.pf ** exp + s.pa ** exp || 1);
      return { teamId: id, w: s.w, l: s.l, gp, ppg: s.pf / gp, oppg: s.pa / gp, margin: (s.pf - s.pa) / gp, pythag: pyth, luck: s.w - pyth * gp, rank: 0 };
    })
    .filter((r): r is TeamAnalyticsRow => !!r)
    .sort((a, b) => b.margin - a.margin);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
