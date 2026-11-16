import type { GameState, Honor, HonorKind, Level } from '../state/schemas';
import type { RaceRow, Scored } from './awards';

/**
 * The league's honor roll: champions, MVPs, Defensive Players of the Year, All-League teams and the midseason All-Stars,
 * for every season of every league you pass through. Names are copied in, so an honor outlives the player and the team.
 * Nothing here rolls dice: it records what the awards code already decided.
 */

export const KIND_ORDER: HonorKind[] = ['champion', 'mvp', 'dpoy', 'first', 'second', 'allstar'];

export const kindLabel = (kind: HonorKind, level: Level): string => {
  const league = level === 'pro' ? 'League' : 'Conference';
  switch (kind) {
    case 'champion':
      return 'Champions';
    case 'mvp':
      return `${league} MVP`;
    case 'dpoy':
      return 'Defensive Player of the Year';
    case 'first':
      return `All-${league} First Team`;
    case 'second':
      return `All-${league} Second Team`;
    default:
      return 'All-Stars';
  }
};

/** Adds an honor unless that exact one is already on the roll. */
function add(state: GameState, h: Honor) {
  if (state.honors.some((x) => x.season === h.season && x.level === h.level && x.kind === h.kind && x.athleteId === h.athleteId && (h.athleteId !== '' || x.name === h.name))) return;
  state.honors.push(h);
}

const personHonor = (state: GameState, id: string, kind: HonorKind, season: number, level: Level, stat: string): Honor | null => {
  const a = state.athletes[id];
  if (!a) return null;
  return { season, level, kind, athleteId: id, name: `${a.firstName} ${a.lastName}`, team: a.teamId ? (state.teams[a.teamId]?.name ?? '') : '', stat, user: id === state.player.athleteId };
};

const ppg = (state: GameState, id: string): string => {
  const s = state.leagueStats[id];
  return s && s.gp > 0 ? `${(s.pts / s.gp).toFixed(1)} ppg` : '';
};

/** The midseason All-Star roster, as the awards code names it. */
export function recordAllStars(state: GameState, picks: RaceRow[]) {
  const { season } = state.career;
  const level = state.league.level;
  for (const p of picks) {
    const h = personHonor(state, p.id, 'allstar', season, level, `${p.ppg.toFixed(1)} ppg`);
    if (h) add(state, h);
  }
}

/** Called at the end of the season, before the awards are handed out, with the whole league's final stats still in place. */
export function recordSeasonHonors(state: GameState, scored: Scored[]) {
  const { season } = state.career;
  const level = state.league.level;
  const champ = state.league.champion ? state.teams[state.league.champion] : null;
  if (champ) add(state, { season, level, kind: 'champion', athleteId: '', name: champ.name, team: champ.name, stat: `${state.league.standings[champ.id]?.w ?? 0}-${state.league.standings[champ.id]?.l ?? 0}`, user: champ.id === state.career.teamId });

  const put = (rows: typeof scored, kind: HonorKind, stat: (id: string) => string) => {
    for (const r of rows) {
      const h = personHonor(state, r.id, kind, season, level, stat(r.id));
      if (h) add(state, h);
    }
  };
  put(scored.slice(0, 1), 'mvp', (id) => ppg(state, id));
  put(scored.slice(0, 5), 'first', (id) => ppg(state, id));
  put(scored.slice(5, 10), 'second', (id) => ppg(state, id));
  const dpoy = [...scored].sort((a, b) => b.def - a.def)[0];
  if (dpoy) {
    put([dpoy], 'dpoy', (id) => {
      const s = state.leagueStats[id];
      return s && s.gp > 0 ? `${((s.stl + s.blk) / s.gp).toFixed(1)} stl+blk` : '';
    });
  }
}

const KIND_OF_AWARD = (name: string): HonorKind | null => {
  if (name === 'All-Star') return 'allstar';
  if (/MVP$/.test(name)) return 'mvp';
  if (/First Team$/.test(name)) return 'first';
  if (/Second Team$/.test(name)) return 'second';
  if (name === 'Defensive Player of the Year') return 'dpoy';
  if (/Champion$/.test(name)) return 'champion';
  return null;
};

/**
 * Saves from before the honor roll. The player's own awards go on it (with the team they actually played for that year),
 * a season that has just ended but not yet rolled over is read from the final stats still in the league, and the
 * midseason All-Stars of a season in progress are read back from the flag that named them. Other players' honors from
 * seasons already gone were never kept, so those seasons stay incomplete. Runs only while the roll is empty.
 */
export function backfillHonors(state: GameState, scored: Scored[] = []) {
  if (state.honors.length) return;
  const me = state.athletes[state.player.athleteId];
  const teamIn = (season: number) => {
    const g = state.gameLog.find((e) => e.season === season && e.line.sec > 0) ?? state.gameLog.find((e) => e.season === season);
    return g ? (state.teams[g.teamId]?.name ?? '') : '';
  };
  if (me) {
    const name = `${me.firstName} ${me.lastName}`;
    for (const aw of state.player.awards) {
      const kind = KIND_OF_AWARD(aw.name);
      if (!kind) continue;
      const team = teamIn(aw.season);
      if (kind === 'champion') {
        if (team) add(state, { season: aw.season, level: aw.level, kind, athleteId: '', name: team, team, stat: '', user: true });
      } else add(state, { season: aw.season, level: aw.level, kind, athleteId: me.id, name, team, stat: '', user: true });
    }
  }
  // the season that just ended, if the league has not rolled over yet
  const ended = ['offseason', 'recruiting', 'draft', 'free_agency', 'retired'].includes(state.career.phase) && !!state.league.champion;
  if (ended && scored.length) recordSeasonHonors(state, scored);
  const flag = state.story.flags[`allstars_${state.career.season}`];
  if (typeof flag === 'string' && flag) {
    for (const id of flag.split(',')) {
      const h = personHonor(state, id, 'allstar', state.career.season, state.league.level, ppg(state, id));
      if (h) add(state, h);
    }
  }
}

export interface SeasonBlock {
  season: number;
  level: Level;
  byKind: Partial<Record<HonorKind, Honor[]>>;
}

/** The honor roll grouped by season, newest first, optionally for one league only. */
export function honorRoll(state: GameState, level: Level | 'all'): SeasonBlock[] {
  const blocks = new Map<string, SeasonBlock>();
  for (const h of state.honors) {
    if (level !== 'all' && h.level !== level) continue;
    const key = `${h.season}:${h.level}`;
    const b = blocks.get(key) ?? { season: h.season, level: h.level, byKind: {} };
    (b.byKind[h.kind] ??= []).push(h);
    blocks.set(key, b);
  }
  return [...blocks.values()].sort((a, b) => b.season - a.season);
}

const WEIGHT: Record<HonorKind, number> = { champion: 0, mvp: 4, dpoy: 2, first: 2, second: 1, allstar: 1 };

export interface Decorated {
  athleteId: string;
  name: string;
  user: boolean;
  mvps: number;
  teams: number;
  allStars: number;
  total: number;
  score: number;
}

/** Who has collected the most honors, across every season and league on record. */
export function mostDecorated(state: GameState, n = 5): Decorated[] {
  const by = new Map<string, Decorated>();
  for (const h of state.honors) {
    if (!h.athleteId) continue;
    const d = by.get(h.athleteId) ?? { athleteId: h.athleteId, name: h.name, user: h.user, mvps: 0, teams: 0, allStars: 0, total: 0, score: 0 };
    if (h.kind === 'mvp') d.mvps++;
    else if (h.kind === 'first' || h.kind === 'second') d.teams++;
    else if (h.kind === 'allstar') d.allStars++;
    d.total++;
    d.score += WEIGHT[h.kind];
    by.set(h.athleteId, d);
  }
  return [...by.values()].sort((a, b) => b.score - a.score || b.total - a.total).slice(0, n);
}
