import type { Athlete, GameState, Team } from '../state/schemas';
import { coachOf, coachStanding } from './coach';
import { bumpChemistry } from './chemistry';
import { marketValueFor, receive } from './finance';
import { addNews } from './news';
import { overall } from './ratings';
import { RNG, clamp } from './rng';

/**
 * Pro contracts: everybody on a roster has a salary, every team has a cap, and you can negotiate an extension, push for
 * more, or sit out until the team comes up. Other players' pay follows the same market curve as yours.
 */

export const MIN_SALARY = 1_100_000;
/** The cap never drops below this, however thin the league is. */
export const CAP_FLOOR = 60_000_000;

const round = (n: number, step = 100_000) => Math.round(n / step) * step;

/** What a pro of this rating is worth a year on the open market. */
export const askingPrice = (a: Athlete): number => Math.max(MIN_SALARY, round(marketValueFor(overall(a.ratings))));

export const salaryOf = (a: Athlete): number => a.salary ?? askingPrice(a);

/** A team's total commitments: every player's salary, and yours if you are on it. */
export function payroll(state: GameState, team: Team): number {
  let total = 0;
  for (const id of team.rosterIds) {
    const a = state.athletes[id];
    if (!a) continue;
    if (id === state.player.athleteId) total += state.player.contract && state.player.contract.yearsLeft > 0 ? state.player.contract.salary : 0;
    else total += salaryOf(a);
  }
  return total;
}

/**
 * The cap follows the league: a bit above what the typical team pays, so about two teams in three have room. As talent
 * (and pay) grows over a career, so does the cap, the way a real one grows with revenue.
 */
export function salaryCap(state: GameState): number {
  const pays = state.league.teamIds.map((id) => payroll(state, state.teams[id])).sort((a, b) => a - b);
  const median = pays.length ? pays[Math.floor(pays.length / 2)] : CAP_FLOOR;
  return Math.max(CAP_FLOOR, round(median * 1.2, 1_000_000));
}

export const capSpace = (state: GameState, team: Team): number => salaryCap(state) - payroll(state, team);

/* ───────────────────────── Your extension ───────────────────────── */

export const holdingOut = (state: GameState): boolean => state.story.flags.holdout === true;

export interface ExtensionStatus {
  can: boolean;
  reason: string;
  value: number;
  /** What the front office will pay at most right now. */
  ceiling: number;
  years: number;
  counter: number | null;
}

/** What the team would pay: your worth, nudged by how the coach sees you, and by every week you hold out. */
export function ceilingFor(state: GameState): number {
  const value = marketValueFor(overall(state.athletes[state.player.athleteId].ratings));
  const cs = coachStanding(state);
  const trust = coachOf(state)?.relationship.trust ?? 50;
  const holdout = Number(state.story.flags.holdout_weeks ?? 0);
  const f = clamp(1.05 + (trust - 50) / 450 + (cs.rank <= 2 ? 0.06 : 0) + Math.min(0.2, holdout * 0.04), 0.95, 1.3);
  return Math.max(MIN_SALARY, round(value * f));
}

export const extensionYears = (state: GameState): number => {
  const age = state.athletes[state.player.athleteId].age;
  return age >= 32 ? 2 : age >= 29 ? 3 : 4;
};

export function extensionStatus(state: GameState): ExtensionStatus | null {
  const c = state.career;
  const k = state.player.contract;
  if (c.level !== 'pro' || !k) return null;
  const value = Math.max(MIN_SALARY, round(marketValueFor(overall(state.athletes[state.player.athleteId].ratings))));
  const counter = typeof state.story.flags.ext_counter === 'number' ? (state.story.flags.ext_counter as number) : null;
  const base = { value, ceiling: ceilingFor(state), years: extensionYears(state), counter };
  if (c.phase === 'playoffs' || c.phase === 'draft' || c.phase === 'free_agency' || c.phase === 'retired' || c.phase === 'recruiting') return { ...base, can: false, reason: 'Not now.' };
  if (k.yearsLeft > 2) return { ...base, can: false, reason: 'Your deal has years left. The team will not talk until the last two.' };
  if (holdingOut(state)) return { ...base, can: true, reason: 'You are holding out. The team will come up each week.' };
  if (state.story.flags.ext_season === c.season && counter === null) return { ...base, can: false, reason: 'You already pushed this season.' };
  return { ...base, can: true, reason: 'The front office will talk.' };
}

export type Stance = 'fair' | 'high' | 'max';
export const STANCE: Record<Stance, { label: string; mult: number; blurb: string }> = {
  fair: { label: 'Ask for a fair deal', mult: 0.97, blurb: 'A little under your market price. Usually works.' },
  high: { label: 'Ask for more', mult: 1.2, blurb: 'A stretch. They may meet you partway.' },
  max: { label: 'Ask for the moon', mult: 1.45, blurb: 'Only if they love you. Usually insulting.' },
};

export interface NegotiationResult {
  outcome: 'accepted' | 'counter' | 'rejected';
  salary: number;
  years: number;
  text: string;
}

function applyDeal(state: GameState, salary: number, years: number) {
  const k = state.player.contract!;
  k.salary = salary;
  k.yearsLeft = years;
  // a signing bonus: a tenth of the first year
  receive(state, Math.round(salary * 0.1));
  state.story.flags.holdout = false;
  state.story.flags.holdout_weeks = 0;
  state.story.flags.ext_counter = false;
  state.player.morale = clamp(state.player.morale + 6, 0, 100);
  const coach = coachOf(state);
  if (coach) coach.relationship.trust = clamp(coach.relationship.trust + 1, 0, 100);
  addNews(state, `${state.athletes[state.player.athleteId].lastName} agrees to a ${years}-year, $${(salary / 1e6).toFixed(1)}M a year extension.`);
}

/** Ask for an extension. The answer is yes, a counteroffer, or no. */
export function negotiate(state: GameState, rng: RNG, stance: Stance): NegotiationResult | null {
  const st = extensionStatus(state);
  if (!st || !st.can) return null;
  const ask = round(st.value * STANCE[stance].mult);
  const years = st.years;
  state.story.flags.ext_season = state.career.season;
  const ceiling = st.ceiling;
  const noise = rng.range(0.97, 1.03);
  if (ask <= ceiling * noise) {
    applyDeal(state, ask, years);
    return { outcome: 'accepted', salary: ask, years, text: `They agree to ${years} years at $${(ask / 1e6).toFixed(1)}M a year. Handshakes all around.` };
  }
  if (ask <= ceiling * 1.22) {
    state.story.flags.ext_counter = ceiling;
    return { outcome: 'counter', salary: ceiling, years, text: `They come back at $${(ceiling / 1e6).toFixed(1)}M a year for ${years} years. It is below your number, and it is real.` };
  }
  const coach = coachOf(state);
  if (coach) coach.relationship.trust = clamp(coach.relationship.trust - 2, 0, 100);
  state.player.morale = clamp(state.player.morale - 3, 0, 100);
  addNews(state, `${state.athletes[state.player.athleteId].lastName}'s contract talks stall.`);
  return { outcome: 'rejected', salary: 0, years, text: 'The front office laughs politely and says that number is not happening. Word gets around that you asked.' };
}

/** Take the counteroffer on the table. */
export function acceptCounter(state: GameState): NegotiationResult | null {
  const st = extensionStatus(state);
  const salary = typeof state.story.flags.ext_counter === 'number' ? (state.story.flags.ext_counter as number) : 0;
  if (!st || !salary) return null;
  applyDeal(state, salary, st.years);
  return { outcome: 'accepted', salary, years: st.years, text: `You take it: ${st.years} years at $${(salary / 1e6).toFixed(1)}M a year.` };
}

/** Refuse to play until the team pays you. You sit out games, and the team feels it. */
export function startHoldout(state: GameState): boolean {
  const k = state.player.contract;
  if (state.career.level !== 'pro' || !k || k.yearsLeft > 2 || holdingOut(state) || state.career.phase !== 'regular') return false;
  state.story.flags.holdout = true;
  state.story.flags.holdout_weeks = 0;
  state.story.flags.ext_counter = false;
  addNews(state, `${state.athletes[state.player.athleteId].lastName} is holding out for a new contract.`);
  return true;
}

/** Back to work without a deal. It costs you with the coach. */
export function endHoldout(state: GameState) {
  if (!holdingOut(state)) return;
  state.story.flags.holdout = false;
  state.story.flags.holdout_weeks = 0;
  const coach = coachOf(state);
  if (coach) {
    coach.relationship.trust = clamp(coach.relationship.trust - 3, 0, 100);
    coach.relationship.respect = clamp(coach.relationship.respect - 2, 0, 100);
  }
  addNews(state, `${state.athletes[state.player.athleteId].lastName} ends the holdout and returns to the team.`);
}

/** Each week of a holdout: the team and the locker room feel it, and the front office inches up. Capped. */
export function weeklyHoldout(state: GameState) {
  if (!holdingOut(state)) return;
  const weeks = Number(state.story.flags.holdout_weeks ?? 0) + 1;
  state.story.flags.holdout_weeks = weeks;
  const coach = coachOf(state);
  if (coach) coach.relationship.trust = clamp(coach.relationship.trust - 1.5, 0, 100);
  state.player.morale = clamp(state.player.morale - 2, 0, 100);
  state.player.reputation = clamp(state.player.reputation - 0.3, 0, 100);
  bumpChemistry(state, -1);
  if (weeks >= 6) endHoldout(state); // nobody holds out forever
}
