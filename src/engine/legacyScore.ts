import type { GameState, Legend } from '../state/schemas';
import { overall } from './ratings';
import { clamp } from './rng';
import { averages, totals } from './stats';

/**
 * How a finished career is judged. Titles, awards and stats only (money and family do not count toward the score).
 * Pure functions over the save, so the Hall of Fame, the goals and the paper all agree on the same number.
 */

export const TIER_LABELS = ['Journeyman', 'Solid Pro', 'Fan Favorite', 'All-Time Great', 'Hall of Famer', 'Immortal'] as const;
/** Score needed for each tier (index = tier). */
export const TIER_MIN = [0, 30, 65, 120, 190, 290] as const;

export const tierOf = (score: number): number => {
  let t = 0;
  for (let i = 0; i < TIER_MIN.length; i++) if (score >= TIER_MIN[i]) t = i;
  return t;
};

type Lvl = 'hs' | 'college' | 'pro';
const byLevel = (hs: number, college: number, pro: number) => ({ hs, college, pro }) as Record<Lvl, number>;
const W = {
  title: byLevel(3, 7, 14),
  mvp: byLevel(3, 8, 18),
  first: byLevel(1, 3, 7),
  second: byLevel(0.5, 1.5, 3),
  dpoy: byLevel(1, 3, 8),
  allstar: byLevel(1, 1.5, 4),
};

/** The best rating the player has reached, kept up to date at every season start (see `notePeak`). */
export const peakOf = (state: GameState): number => Math.max(Number(state.story.flags.peak_ovr ?? 0), overall(state.athletes[state.player.athleteId].ratings));

export function notePeak(state: GameState) {
  const now = overall(state.athletes[state.player.athleteId].ratings);
  if (now > Number(state.story.flags.peak_ovr ?? 0)) state.story.flags.peak_ovr = now;
}

export interface ScoreParts {
  titles: number;
  mvps: number;
  allStars: number;
  honors: number;
  total: number;
}

export interface CareerTotals {
  gp: number;
  pts: number;
  ppg: number;
  rpg: number;
  apg: number;
  proGp: number;
  proPts: number;
  proPpg: number;
  proSeasons: number;
}

export function careerTotals(state: GameState): CareerTotals {
  const all = totals(state.gameLog);
  const pro = totals(state.gameLog.filter((g) => g.level === 'pro'));
  const a = averages(all);
  const p = averages(pro);
  const proSeasons = new Set(state.gameLog.filter((g) => g.level === 'pro' && g.line.sec > 0).map((g) => g.season)).size;
  return { gp: all.gp, pts: all.pts, ppg: a.ppg, rpg: a.rpg, apg: a.apg, proGp: pro.gp, proPts: pro.pts, proPpg: p.ppg, proSeasons };
}

/** Everything that goes into the score, so the Hall of Fame can show its working. */
export function scoreParts(state: GameState): ScoreParts {
  let total = 0;
  let titles = 0;
  let mvps = 0;
  let allStars = 0;
  const t = careerTotals(state);
  // a ring counts for more when you were the one who won it: a bench player on a dynasty gets about two thirds
  const contribution = clamp(0.4 + t.proPpg / 20, 0.4, 1);
  for (const a of state.player.awards) {
    const lv = a.level as Lvl;
    if (a.name.endsWith('Champion')) {
      titles++;
      total += W.title[lv] * (lv === 'pro' ? contribution : 1);
    } else if (a.name.includes('MVP')) {
      mvps++;
      total += W.mvp[lv];
    } else if (a.name.includes('First Team')) total += W.first[lv];
    else if (a.name.includes('Second Team')) total += W.second[lv];
    else if (a.name.startsWith('Defensive')) total += W.dpoy[lv];
    else if (a.name === 'All-Star') {
      allStars++;
      total += W.allstar[lv];
    }
  }
  // stats: a long pro career with real numbers counts, a cup of coffee does not
  total += t.proPts / 450 + (t.gp - t.proGp) / 120;
  total += Math.max(0, t.proPpg - 8) * Math.min(1, t.proGp / 300) * 1.2;
  total += t.proSeasons * 1.2;
  total += Math.max(0, peakOf(state) - 70) * 1.1;
  const pick = state.player.draftPick;
  if (pick !== null && pick > 0) total += pick === 1 ? 12 : pick <= 5 ? 8 : pick <= 14 ? 4 : pick <= 30 ? 2 : 0;
  return { titles, mvps, allStars, honors: state.player.awards.length, total: Math.round(total * 10) / 10 };
}

export const legacyScore = (state: GameState): number => scoreParts(state).total;
export const legacyTier = (state: GameState): number => tierOf(legacyScore(state));

const ONE = ['', 'once', 'twice'];
const times = (n: number) => (n <= 2 ? ONE[n] : `${n} times`);

/** One honest sentence about a career, from the numbers alone. */
export function legendSummary(l: Pick<Legend, 'name' | 'titles' | 'mvps' | 'allStars' | 'seasons' | 'proPpg' | 'proGp' | 'tierLabel' | 'draftPick'>): string {
  const bits: string[] = [];
  if (l.titles) bits.push(`won ${l.titles === 1 ? 'a title' : `${l.titles} titles`}`);
  if (l.mvps) bits.push(`was MVP ${times(l.mvps)}`);
  if (l.allStars) bits.push(`made ${l.allStars} All-Star team${l.allStars === 1 ? '' : 's'}`);
  const stats = l.proGp > 0 ? ` and averaged ${l.proPpg.toFixed(1)} points in the pros` : '';
  const did = bits.length ? bits.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'never won the big prizes';
  return `${l.name} ${did}${stats} over ${l.seasons} season${l.seasons === 1 ? '' : 's'}. Remembered as a ${l.tierLabel}.`;
}

/** The record of a career, for the Hall of Fame and the family tree. Safe to call at any point; most meaningful at retirement. */
export function legendOf(state: GameState): Legend {
  const a = state.athletes[state.player.athleteId];
  const s = scoreParts(state);
  const t = careerTotals(state);
  const tier = tierOf(s.total);
  const seasons = new Set(state.gameLog.filter((g) => g.line.sec > 0).map((g) => g.season)).size;
  const gen = state.legacy.generation;
  const firstSeason = state.gameLog.length ? Math.min(...state.gameLog.map((g) => g.season)) : state.career.season;
  const married = state.story.flags.love_stage === 'married';
  const base: Legend = {
    id: `${state.id}:${gen}`,
    saveId: state.id,
    generation: gen,
    name: `${a.firstName} ${a.lastName}`,
    firstName: a.firstName,
    lastName: a.lastName,
    hometown: state.player.hometown,
    position: a.position,
    firstSeason,
    lastSeason: state.career.season,
    seasons,
    peakOverall: peakOf(state),
    score: s.total,
    tier,
    tierLabel: TIER_LABELS[tier],
    titles: s.titles,
    mvps: s.mvps,
    allStars: s.allStars,
    honors: s.honors,
    gp: t.gp,
    ppg: Math.round(t.ppg * 10) / 10,
    rpg: Math.round(t.rpg * 10) / 10,
    apg: Math.round(t.apg * 10) / 10,
    proGp: t.proGp,
    proPpg: Math.round(t.proPpg * 10) / 10,
    earnings: state.player.money,
    kids: Number(state.story.flags.kids ?? 0),
    married,
    draftPick: state.player.draftPick,
    badges: state.player.badges.length,
    goalsDone: state.goals.filter((g) => g.doneSeason > 0).length,
    goalsTotal: state.goals.length,
    parent: state.legacy.parent,
    challenge: gen === 1 && typeof state.story.flags.challenge === 'string' ? state.story.flags.challenge : '',
    teams: [state.teams[state.career.teamId]?.name ?? ''].filter(Boolean),
    summary: '',
    retiredAt: Date.now(),
  };
  base.summary = legendSummary(base);
  return base;
}
