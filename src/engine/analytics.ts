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

/* ───────────────────────── Shot zones ───────────────────────── */

export type ZoneId = 'rim' | 'midL' | 'midC' | 'midR' | 'cornerL' | 'wingL' | 'top' | 'wingR' | 'cornerR';

export interface ZoneDef {
  id: ZoneId;
  label: string;
  /** Distance range from the basket, in shot-coordinate units. */
  r: [number, number];
  /** Angle range in degrees: 0 = straight out from the basket, negative = left. */
  a: [number, number];
  /** Rough league-average FG% for this zone, used to color a zone hot or cold. */
  baseline: number;
  three: boolean;
}

export const ZONES: ZoneDef[] = [
  { id: 'rim', label: 'At the rim', r: [0, 0.17], a: [-90, 90], baseline: 0.58, three: false },
  { id: 'midL', label: 'Mid-range left', r: [0.17, 0.46], a: [-90, -30], baseline: 0.39, three: false },
  { id: 'midC', label: 'Mid-range center', r: [0.17, 0.46], a: [-30, 30], baseline: 0.41, three: false },
  { id: 'midR', label: 'Mid-range right', r: [0.17, 0.46], a: [30, 90], baseline: 0.39, three: false },
  { id: 'cornerL', label: 'Left corner 3', r: [0.46, 0.65], a: [-90, -60], baseline: 0.36, three: true },
  { id: 'wingL', label: 'Left wing 3', r: [0.46, 0.65], a: [-60, -20], baseline: 0.34, three: true },
  { id: 'top', label: 'Top of the key 3', r: [0.46, 0.65], a: [-20, 20], baseline: 0.34, three: true },
  { id: 'wingR', label: 'Right wing 3', r: [0.46, 0.65], a: [20, 60], baseline: 0.34, three: true },
  { id: 'cornerR', label: 'Right corner 3', r: [0.46, 0.65], a: [60, 90], baseline: 0.36, three: true },
];

/** Which zone a shot belongs to, from the simulator's court coordinates. */
export function zoneOf(x: number, y: number): ZoneId {
  const dx = (x - 0.5) / 0.95;
  const d = Math.hypot(dx, y);
  if (d < 0.17) return 'rim';
  const ang = (Math.atan2(dx, y) * 180) / Math.PI;
  if (d < 0.46) return ang < -30 ? 'midL' : ang > 30 ? 'midR' : 'midC';
  return ang < -60 ? 'cornerL' : ang < -20 ? 'wingL' : ang <= 20 ? 'top' : ang <= 60 ? 'wingR' : 'cornerR';
}

export interface ZoneStat {
  zone: ZoneDef;
  made: number;
  att: number;
  pct: number;
  /** Share of all attempts taken here. */
  share: number;
  /** FG% minus this zone's baseline. Positive = hot. */
  delta: number;
}

export function shotZones(entries: GameLogEntry[]): { zones: ZoneStat[]; total: number } {
  const acc = new Map<ZoneId, { made: number; att: number }>(ZONES.map((z) => [z.id, { made: 0, att: 0 }]));
  let total = 0;
  for (const e of entries) {
    for (const s of e.shots ?? []) {
      const a = acc.get(zoneOf(s.x, s.y))!;
      a.att++;
      if (s.m) a.made++;
      total++;
    }
  }
  const zones = ZONES.map((zone) => {
    const { made, att } = acc.get(zone.id)!;
    const pct = att ? made / att : 0;
    return { zone, made, att, pct, share: total ? att / total : 0, delta: att ? pct - zone.baseline : 0 };
  });
  return { zones, total };
}

/* ───────────────────────── Season story ───────────────────────── */

export interface SeasonStory {
  season: number;
  shot: { zones: ZoneStat[]; total: number };
  form: FormPoint[];
  moments: string[];
  longestWinStreak: number;
  /** Plain-language lines about where the player was hot or cold. */
  shootingNotes: string[];
}

export function seasonStory(state: GameState, season: number): SeasonStory {
  const entries = state.gameLog.filter((e) => e.season === season);
  const shot = shotZones(entries);
  let streak = 0;
  let best = 0;
  for (const e of entries) {
    streak = e.teamScore > e.oppScore ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  const notes: string[] = [];
  const seen = shot.zones.filter((z) => z.att >= 5);
  const hot = [...seen].sort((a, b) => b.delta - a.delta)[0];
  const cold = [...seen].sort((a, b) => a.delta - b.delta)[0];
  if (hot && hot.delta > 0.05) notes.push(`Hottest spot: ${hot.zone.label.toLowerCase()}, ${hot.made} of ${hot.att} (${Math.round(hot.pct * 100)}%).`);
  if (cold && cold.delta < -0.05 && cold !== hot) notes.push(`Coldest spot: ${cold.zone.label.toLowerCase()}, ${cold.made} of ${cold.att} (${Math.round(cold.pct * 100)}%).`);
  const threes = shot.zones.filter((z) => z.zone.three).reduce((a, z) => a + z.att, 0);
  if (shot.total >= 20) notes.push(`${Math.round((threes / shot.total) * 100)}% of your shots were threes and ${Math.round((shot.zones[0].att / shot.total) * 100)}% came at the rim.`);
  return {
    season,
    shot,
    form: formSeries(entries),
    moments: state.story.defining.filter((d) => d.season === season).map((d) => d.text),
    longestWinStreak: best,
    shootingNotes: notes,
  };
}

/* ───────────────────────── Career timeline ───────────────────────── */

export interface TimelineSeason {
  season: number;
  level: Level;
  year: number;
  gp: number;
  ppg: number;
  rpg: number;
  apg: number;
  awards: string[];
  champion: boolean;
  /** Defining moments the narrator pinned this season. */
  moments: string[];
  /** Characters who left the story this season (graduated, retired, moved on). */
  departures: string[];
  isCurrent: boolean;
}

export function careerTimeline(state: GameState): TimelineSeason[] {
  const seasons = new Map<number, GameLogEntry[]>();
  for (const e of state.gameLog) seasons.set(e.season, [...(seasons.get(e.season) ?? []), e]);
  const current = state.career.season;
  if (!seasons.has(current)) seasons.set(current, []);
  return [...seasons.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, es]) => {
      const t = totals(es);
      const g = Math.max(1, t.gp);
      const awards = state.player.awards.filter((a) => a.season === season);
      const first = es[0];
      return {
        season,
        level: first?.level ?? state.career.level,
        year: first?.year ?? state.career.year,
        gp: t.gp,
        ppg: t.pts / g,
        rpg: t.reb / g,
        apg: t.ast / g,
        awards: awards.filter((a) => !a.name.endsWith('Champion')).map((a) => a.name),
        champion: awards.some((a) => a.name.endsWith('Champion')),
        moments: state.story.defining.filter((d) => d.season === season).map((d) => d.text),
        departures: Object.values(state.npcs)
          .filter((n) => !n.active && n.title.includes(`after season ${season})`))
          .map((n) => n.name),
        isCurrent: season === current,
      };
    });
}
