import { LEVEL_CONFIG } from '../data/teams';
import type { GameState } from '../state/schemas';
import { coachOf } from './coach';
import { addNews } from './news';
import { RNG, clamp } from './rng';

/**
 * Big events that break up the grind: skills contests at the midpoint of the season and the draft combine.
 * Each is a short interactive contest where your ratings and your choices matter, and the result has lasting effects.
 */

export type EventId = 'skills_three' | 'skills_dunk' | 'combine';
export type Style = 'safe' | 'balanced' | 'risky';

export interface EventDef {
  id: EventId;
  title: string;
  blurb: string;
  icon: string;
}

const eventKey = (state: GameState, id: EventId) => `${state.career.season}:${id}`;
export const eventDone = (state: GameState, id: EventId) => state.player.eventsDone.includes(eventKey(state, id));

const levelName = (state: GameState) => (state.career.level === 'hs' ? 'Showcase' : state.career.level === 'college' ? 'Conference Skills Night' : 'All-Star Weekend');

/** The week the midseason events happen. */
export function midseasonWeek(state: GameState): number {
  return Math.max(2, Math.floor(state.league.regularWeeks / 2));
}

/** Events the player can enter right now. */
export function availableEvents(state: GameState): EventDef[] {
  const out: EventDef[] = [];
  const c = state.career;
  const a = state.athletes[state.player.athleteId];
  const mean = LEVEL_CONFIG[c.level].ratingMean;
  if (c.phase === 'regular' && c.week === midseasonWeek(state)) {
    if (!eventDone(state, 'skills_three') && (a.ratings.shooting >= mean + 6 || state.player.reputation >= 35)) {
      out.push({ id: 'skills_three', title: `${levelName(state)}: Three-Point Contest`, blurb: 'Five racks, five shots each. Pick your money-ball racks wisely. The best shooters in the league are in the field.', icon: '🎯' });
    }
    if (!eventDone(state, 'skills_dunk') && a.ratings.athleticism >= mean + 8 && a.ratings.finishing >= mean) {
      out.push({ id: 'skills_dunk', title: `${levelName(state)}: Slam Dunk Contest`, blurb: 'Two rounds in front of the judges. Safe and clean, or something nobody has seen before.', icon: '🚀' });
    }
  }
  if (c.phase === 'draft' && !eventDone(state, 'combine')) {
    out.push({ id: 'combine', title: 'Draft Combine', blurb: 'Sprints, verticals, shooting and interviews in front of every front office. It moves your draft stock.', icon: '📋' });
  }
  return out;
}

/* ───────────────────────── Contests ───────────────────────── */

export interface Entrant {
  id: string;
  name: string;
  rating: number;
  isUser: boolean;
  /** Score for each round played so far. */
  rounds: number[];
  alive: boolean;
  style?: Style;
}

export interface ContestState {
  eventId: 'skills_three' | 'skills_dunk';
  seed: number;
  round: number;
  entrants: Entrant[];
  finished: boolean;
  /** 1 = champion. Set when finished. */
  placement?: number;
  /** One line per round about what happened. */
  notes: string[];
}

export function contestRating(state: GameState, id: ContestState['eventId'], athleteId: string): number {
  const a = state.athletes[athleteId];
  if (id === 'skills_three') return a.ratings.shooting;
  return Math.round(a.ratings.athleticism * 0.6 + a.ratings.finishing * 0.4);
}

export function startContest(state: GameState, id: ContestState['eventId']): ContestState {
  const me = state.athletes[state.player.athleteId];
  const rng = new RNG((state.rngState ^ Math.imul(state.career.season, 2654435761) ^ (id === 'skills_three' ? 0x3a3a : 0xd0d0)) >>> 0);
  const pool = state.league.teamIds
    .flatMap((t) => state.teams[t].rosterIds)
    .map((aid) => state.athletes[aid])
    .filter((a) => a && a.id !== me.id)
    .sort((a, b) => contestRating(state, id, b.id) - contestRating(state, id, a.id))
    .slice(0, 12);
  const field = rng.shuffle([...pool]).slice(0, 5);
  const energyMod = Math.round((state.player.energy - 70) / 10);
  const entrants: Entrant[] = [
    { id: me.id, name: `${me.firstName} ${me.lastName}`, rating: contestRating(state, id, me.id) + energyMod, isUser: true, rounds: [], alive: true },
    ...field.map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}`, rating: contestRating(state, id, a.id), isUser: false, rounds: [], alive: true })),
  ];
  return { eventId: id, seed: rng.state, round: 1, entrants, finished: false, notes: [] };
}

/** Penalty on a money-ball rack: it is harder, and harder still for weaker shooters. */
const moneyPenalty = (rating: number, mean: number) => clamp(0.2 - (rating - mean) * 0.004, 0.05, 0.3);

export const STYLE_INFO: Record<'skills_three' | 'skills_dunk', Record<Style, { name: string; blurb: string }>> = {
  skills_three: {
    safe: { name: 'Steady', blurb: 'No money-ball racks. A little extra focus on every shot.' },
    balanced: { name: 'One money rack', blurb: 'Put the money balls on one rack. The normal approach.' },
    risky: { name: 'Three money racks', blurb: 'Big points if you are hot. If your shot is not elite, it can fall apart.' },
  },
  skills_dunk: {
    safe: { name: 'Clean and reliable', blurb: 'Consistent, no big risks. Judges give solid marks.' },
    balanced: { name: 'Show some flair', blurb: 'A creative dunk with a real chance of a big score.' },
    risky: { name: 'Go for the legendary one', blurb: 'The highest ceiling. It also fails about one time in four.' },
  },
};

function scoreOne(rng: RNG, id: ContestState['eventId'], rating: number, mean: number, style: Style): number {
  if (id === 'skills_three') {
    const k = style === 'safe' ? 0 : style === 'balanced' ? 1 : 3;
    const base = clamp(0.36 + (rating - mean) * 0.007 + (style === 'safe' ? 0.04 : 0), 0.12, 0.85);
    const pen = moneyPenalty(rating, mean);
    let pts = 0;
    for (let rack = 0; rack < 5; rack++) {
      const money = rack < k;
      const p = clamp(base - (money ? pen : 0), 0.05, 0.9);
      for (let s = 0; s < 5; s++) if (rng.chance(p)) pts += money ? 2 : 1;
    }
    return pts;
  }
  // dunk contest: two dunks, each scored out of 50
  const baseScore = 36 + (rating - mean) * 0.22;
  let total = 0;
  for (let d = 0; d < 2; d++) {
    if (style === 'risky' && rng.chance(0.25)) {
      total += clamp(Math.round(rng.range(22, 32)), 0, 50);
      continue;
    }
    const bonus = style === 'safe' ? 0 : style === 'balanced' ? 3 : 7;
    const sd = style === 'safe' ? 2.2 : style === 'balanced' ? 3.8 : 5;
    total += clamp(Math.round(baseScore + bonus + rng.normal(0, sd)), 20, 50);
  }
  return total;
}

/** Computer-controlled entrants lean on what suits them: strong ones go bigger. */
function aiStyle(rng: RNG, rating: number, mean: number): Style {
  const edge = (rating - mean) / 14;
  return rng.weighted<Style>(['safe', 'balanced', 'risky'], (s) => (s === 'safe' ? 1.2 - edge : s === 'balanced' ? 1 : 0.6 + edge));
}

/**
 * Plays one round for everyone. The user picks a style, the field chooses its own. Round 1 cuts to three finalists.
 * Pure: returns a new state and never touches the save.
 */
export function playRound(c: ContestState, mean: number, userStyle: Style): ContestState {
  const next: ContestState = { ...c, entrants: c.entrants.map((e) => ({ ...e, rounds: [...e.rounds] })), notes: [...c.notes] };
  const rng = new RNG((c.seed ^ Math.imul(c.round, 40503)) >>> 0);
  const contenders = next.entrants.filter((e) => e.alive);
  for (const e of contenders) {
    const style = e.isUser ? userStyle : aiStyle(rng, e.rating, mean);
    e.style = style;
    e.rounds.push(scoreOne(rng, c.eventId, e.rating, mean, style));
  }
  const ranked = [...contenders].sort((a, b) => b.rounds[b.rounds.length - 1] - a.rounds[a.rounds.length - 1]);
  if (c.round === 1) {
    const cut = new Set(ranked.slice(0, 3).map((e) => e.id));
    for (const e of contenders) e.alive = cut.has(e.id);
    const me = next.entrants.find((e) => e.isUser)!;
    next.notes.push(me.alive ? 'You made the finals.' : 'You missed the cut for the finals.');
    next.round = 2;
    if (!me.alive) return finishContest(next);
    return next;
  }
  return finishContest(next);
}

function finishContest(c: ContestState): ContestState {
  const me = c.entrants.find((e) => e.isUser)!;
  // finalists rank by their total over both rounds; anyone cut in round 1 ranks below them by their round-1 score
  const total = (e: Entrant) => e.rounds.reduce((x, y) => x + y, 0);
  const finalists = c.entrants.filter((e) => e.alive).sort((a, b) => total(b) - total(a));
  const out = c.entrants.filter((e) => !e.alive).sort((a, b) => b.rounds[0] - a.rounds[0]);
  const order = [...finalists, ...out];
  return { ...c, finished: true, placement: order.findIndex((e) => e.id === me.id) + 1 };
}

export interface ContestReward {
  placement: number;
  lines: string[];
}

/** Apply the outcome to the save: reputation, followers, morale, award, news. Marks the event as played. */
export function applyContestResult(state: GameState, c: ContestState): ContestReward {
  const p = state.player;
  const me = state.athletes[p.athleteId];
  const place = c.placement ?? 6;
  const title = c.eventId === 'skills_three' ? 'Three-Point Contest' : 'Slam Dunk Contest';
  const lines: string[] = [];
  const rep = place === 1 ? 4 : place === 2 ? 2 : place === 3 ? 1 : 0;
  const folPct = place === 1 ? 0.12 : place === 2 ? 0.05 : place === 3 ? 0.02 : 0;
  const morale = place === 1 ? 8 : place === 2 ? 4 : place === 3 ? 1 : -2;
  p.reputation = clamp(p.reputation + rep, 0, 100);
  p.followers += Math.round(p.followers * folPct);
  p.morale = clamp(p.morale + morale, 0, 100);
  p.energy = clamp(p.energy - 6, 0, 100);
  if (rep) lines.push(`Reputation +${rep}`);
  if (folPct) lines.push(`Followers +${Math.round(folPct * 100)}%`);
  lines.push(`Morale ${morale > 0 ? '+' : ''}${morale}`);
  if (place === 1) {
    p.awards.push({ season: state.career.season, level: state.career.level, name: `${title} Champion` });
    lines.push(`Award: ${title} Champion`);
  }
  const coach = coachOf(state);
  if (coach) coach.relationship.respect = clamp(coach.relationship.respect + (place <= 3 ? 1.5 : 0.5), 0, 100);
  addNews(state, place === 1 ? `${me.lastName} wins the ${title}.` : place <= 3 ? `${me.lastName} places ${place === 2 ? 'second' : 'third'} in the ${title}.` : `${me.lastName} takes part in the ${title}.`);
  p.eventsDone.push(eventKey(state, c.eventId));
  return { placement: place, lines };
}

/* ───────────────────────── Draft combine ───────────────────────── */

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D';
const GRADE_POINTS: Record<Grade, number> = { 'A+': 1.2, A: 0.8, B: 0.3, C: -0.3, D: -0.9 };

export interface CombineDrill {
  id: string;
  label: string;
  note: string;
  grade: Grade;
}

export interface CombineResult {
  drills: CombineDrill[];
  /** Added to draft stock. */
  boost: number;
  injured: boolean;
  summary: string;
}

const gradeOf = (z: number): Grade => (z >= 1.3 ? 'A+' : z >= 0.5 ? 'A' : z >= -0.3 ? 'B' : z >= -1.1 ? 'C' : 'D');

/**
 * Run the combine. "Push" means going all out for a higher ceiling at a small risk of a minor injury that costs you;
 * "steady" is the safer, flatter read.
 */
export function runCombine(state: GameState, approach: 'push' | 'steady'): CombineResult {
  const rng = new RNG((state.rngState ^ Math.imul(state.career.season, 2246822519) ^ 0xc0b1) >>> 0);
  const a = state.athletes[state.player.athleteId];
  const mean = LEVEL_CONFIG.pro.ratingMean - 4;
  const r = a.ratings;
  const noise = approach === 'push' ? 0.9 : 0.5;
  const lift = approach === 'push' ? 0.25 : 0;
  const z = (rating: number) => (rating - mean) / 9 + lift + rng.normal(0, noise);
  const drills: CombineDrill[] = [
    { id: 'sprint', label: 'Three-quarter court sprint', note: `Athleticism ${r.athleticism}`, grade: gradeOf(z(r.athleticism)) },
    { id: 'vertical', label: 'Max vertical', note: `Athleticism ${r.athleticism}, finishing ${r.finishing}`, grade: gradeOf(z((r.athleticism + r.finishing) / 2)) },
    { id: 'shooting', label: 'Shooting drill', note: `Shooting ${r.shooting}`, grade: gradeOf(z(r.shooting)) },
    { id: 'agility', label: 'Lane agility and handles', note: `Handles ${r.handles}, athleticism ${r.athleticism}`, grade: gradeOf(z((r.handles + r.athleticism) / 2)) },
    { id: 'interviews', label: 'Team interviews', note: `IQ ${r.iq}, reputation ${state.player.reputation}`, grade: gradeOf(z((r.iq + 40 + state.player.reputation * 0.5) / 1.6) - 0.3) },
  ];
  let boost = drills.reduce((s, d) => s + GRADE_POINTS[d.grade], 0);
  const injured = approach === 'push' && rng.chance(0.06);
  if (injured) boost -= 1.5;
  boost = clamp(Math.round(boost * 10) / 10, -3, 5);
  const summary = boost >= 2.5 ? 'Scouts walk out talking about you.' : boost >= 0.5 ? 'A solid showing that helped your stock.' : boost > -0.5 ? 'Nothing that changed anyone’s mind.' : 'You left some questions unanswered.';
  return { drills, boost, injured, summary };
}

export function applyCombine(state: GameState, res: CombineResult) {
  state.player.draftBoost = res.boost;
  if (res.injured) state.player.injuryHistory++;
  state.player.eventsDone.push(eventKey(state, 'combine'));
  const me = state.athletes[state.player.athleteId];
  addNews(state, `${me.lastName} ${res.boost >= 2 ? 'impresses' : res.boost <= -1 ? 'struggles' : 'works out'} at the draft combine.`);
}
