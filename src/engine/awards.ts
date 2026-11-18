import type { GameState } from '../state/schemas';
import { midseasonWeek } from './events';
import { recordAllStars } from './honors';
import { addNews } from './news';
import { logTransaction } from './news';
import { clamp } from './rng';

/**
 * Who is having the best season. The same measure picks the year-end MVP, so a race you can watch in January ends the
 * way it looked. At the midpoint the All-Stars are named from it.
 */

export interface Scored {
  id: string;
  /** Production, scaled up for winning teams. */
  per: number;
  /** Defensive impact. */
  def: number;
}

export function scoredPlayers(state: GameState): Scored[] {
  const league = state.league;
  const winPct = (teamId: string | null) => {
    if (!teamId) return 0.5;
    const s = league.standings[teamId];
    return s ? s.w / Math.max(1, s.w + s.l) : 0.5;
  };
  const ids = league.teamIds.flatMap((t) => state.teams[t].rosterIds);
  return ids
    .map((id) => {
      const s = state.leagueStats[id];
      const a = state.athletes[id];
      if (!s || !a || s.gp < Math.max(3, league.regularWeeks * 0.5)) return null;
      const per = (s.pts + s.reb * 0.6 + s.ast * 0.8 + s.stl * 1.2 + s.blk * 1.2) / s.gp;
      const def = (s.stl + s.blk) / s.gp + a.ratings.defense / 40;
      return { id, per: per * (0.75 + winPct(a.teamId) * 0.5), def };
    })
    .filter((x): x is Scored => !!x)
    .sort((a, b) => b.per - a.per);
}

export interface RaceRow {
  id: string;
  name: string;
  team: string;
  score: number;
  ppg: number;
  isYou: boolean;
  isRival: boolean;
}

/** The MVP race right now: the top of the table, with you and your rival marked. Needs enough games to mean something. */
export function mvpRace(state: GameState, n = 6): RaceRow[] {
  const rivalIds = new Set(Object.values(state.npcs).filter((x) => x.role === 'rival' && x.athleteId).map((x) => x.athleteId!));
  const me = state.player.athleteId;
  const gamesNeeded = Math.max(3, state.league.regularWeeks * 0.5);
  // before the field qualifies, rank on what has been played so far
  const rows = state.league.teamIds
    .flatMap((t) => state.teams[t].rosterIds)
    .map((id) => {
      const s = state.leagueStats[id];
      const a = state.athletes[id];
      if (!s || !a || s.gp < Math.min(2, gamesNeeded)) return null;
      const pct = a.teamId && state.league.standings[a.teamId] ? state.league.standings[a.teamId].w / Math.max(1, state.league.standings[a.teamId].w + state.league.standings[a.teamId].l) : 0.5;
      const per = (s.pts + s.reb * 0.6 + s.ast * 0.8 + s.stl * 1.2 + s.blk * 1.2) / s.gp;
      const raw = per * (0.75 + pct * 0.5);
      return { raw, id, name: `${a.firstName} ${a.lastName}`, team: a.teamId ? state.teams[a.teamId].name : '', score: Math.round(raw * 10) / 10, ppg: Math.round((s.pts / s.gp) * 10) / 10, isYou: id === me, isRival: rivalIds.has(id) };
    })
    .filter((x): x is RaceRow & { raw: number } => !!x)
    // sort on the unrounded score so the race agrees with the year-end awards when two players are within a tenth
    .sort((a, b) => b.raw - a.raw);
  return rows.slice(0, n).map(({ raw: _raw, ...row }) => row);
}

/** All-Stars named at the midpoint, as a comma-joined list of athlete ids (flags can only hold simple values). */
export const allStarIds = (state: GameState, season = state.career.season): string[] => {
  const v = state.story.flags[`allstars_${season}`];
  return typeof v === 'string' && v ? v.split(',') : [];
};

/** Called as each regular-season week ends. Names All-Stars at the midpoint and writes the race up every few weeks. */
export function midseasonHeadlines(state: GameState) {
  const c = state.career;
  if (c.phase !== 'regular') return;
  const key = `allstars_${c.season}`;
  if (c.week === midseasonWeek(state) && state.story.flags[key] === undefined) {
    const picks = mvpRace(state, 10);
    state.story.flags[key] = picks.map((p) => p.id).join(',');
    if (picks.length) {
      recordAllStars(state, picks);
      logTransaction(state, 'recruit', `All-Star rosters are out: ${picks.slice(0, 4).map((p) => p.name).join(', ')} and ${Math.max(0, picks.length - 4)} more. The full list is under League, Honors.`);
      const me = state.athletes[state.player.athleteId];
      if (picks.some((p) => p.isYou)) {
        const p = state.player;
        p.awards.push({ season: c.season, level: c.level, name: 'All-Star' });
        p.reputation = clamp(p.reputation + 2, 0, 100);
        p.morale = clamp(p.morale + 4, 0, 100);
        p.followers += Math.round(Math.max(20, p.followers) * 0.05);
        addNews(state, `${me.lastName} is named an All-Star.`);
        state.story.log.push({ season: c.season, week: c.week, phase: c.phase, kind: 'award', title: 'Named an All-Star', summary: `You made the All-Star team at the midpoint of season ${c.season}.` });
      }
      for (const n of Object.values(state.npcs)) {
        if (n.active && n.athleteId && (n.role === 'rival' || n.role === 'friend') && picks.some((x) => x.id === n.athleteId)) {
          n.memories.push(`Named an All-Star in season ${c.season}.`);
          if (n.memories.length > 8) n.memories.shift();
          addNews(state, `${n.name} is named an All-Star.`);
        }
      }
    }
    return;
  }
  if (c.week % 3 === 0) {
    const race = mvpRace(state, 3);
    if (race.length >= 2) addNews(state, `MVP race: ${race[0].name} (${race[0].team}) leads, with ${race[1].name} and ${race[2]?.name ?? 'the field'} chasing.`);
  }
}
