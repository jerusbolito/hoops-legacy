import type { FinanceLine, GameState, Level, ServiceId } from '../state/schemas';
import { difficultyOf } from './difficulty';
import { modsOf } from './origin';

/**
 * Money that makes sense: it arrives every week of the season (salary, a stipend, endorsements), taxes and living costs
 * come out of it, and what is left is yours to spend on things that help your career. All plain engine math.
 */

/** Taxes and agent fees on professional income. */
export const PRO_TAX_RATE = 0.3;
/** Rent, food, staff and everything else a pro spends, as a share of salary. */
export const PRO_LIVING_RATE = 0.08;
/** Weekly money for players who have no salary. */
export const WEEKLY_ALLOWANCE: Record<Level, number> = { hs: 30, college: 200, pro: 0 };
export const ALLOWANCE_LABEL: Record<Level, string> = { hs: 'Allowance and odd jobs', college: 'Scholarship stipend', pro: '' };

/** How much bigger prices and amounts are at each level. A high school kid and an NBA star do not shop in the same store. */
export const LEVEL_SCALE: Record<Level, number> = { hs: 1, college: 12, pro: 700 };

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const STEP: Record<Level, number> = { hs: 10, college: 100, pro: 5_000 };

/** Round a base (high school) amount up to this level's scale. */
export function scaled(state: GameState, base: number): number {
  const lvl = state.career.level;
  return Math.max(STEP[lvl], roundTo(base * LEVEL_SCALE[lvl], STEP[lvl]));
}

/** What a pro of this rating is worth on the market in dollars a year (the same curve free agency uses). */
export const marketValueFor = (ovr: number): number => Math.max(1.1, (Math.max(0, ovr - 62) / 26) ** 2.2 * 45) * 1_000_000;

/* ───────────────────────── Services ───────────────────────── */

export interface ServiceDef {
  id: ServiceId;
  name: string;
  icon: string;
  blurb: string;
  effect: string;
  /** Price in high school dollars. */
  base: number;
  levels: Level[];
}

export const SERVICES: ServiceDef[] = [
  { id: 'trainer', name: 'Private trainer', icon: '🏋️', blurb: 'One-on-one sessions built around your game.', effect: 'Training and summer work pay off 20% more.', base: 250, levels: ['hs', 'college', 'pro'] },
  { id: 'recovery', name: 'Recovery team', icon: '🩺', blurb: 'A physio, massage and a sleep plan.', effect: 'Injuries heal a week sooner, you get hurt about a quarter less, and you win back a little energy each week.', base: 300, levels: ['hs', 'college', 'pro'] },
  { id: 'nutrition', name: 'Nutritionist', icon: '🥗', blurb: 'A meal plan that actually fits a hooper.', effect: 'You recover 5 more energy every week.', base: 150, levels: ['hs', 'college', 'pro'] },
  { id: 'agency', name: 'PR and brand team', icon: '📣', blurb: 'People whose whole job is making your name worth more.', effect: 'Endorsement offers come about 50% more often and pay 10% more.', base: 400, levels: ['college', 'pro'] },
  { id: 'tutor', name: 'Tutor', icon: '📚', blurb: 'Someone to keep you on top of school work.', effect: 'Grades stop slipping on their own and studying works 50% better.', base: 150, levels: ['hs', 'college'] },
];
export const SERVICE_BY_ID = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<ServiceId, ServiceDef>;

export const servicesFor = (state: GameState): ServiceDef[] => SERVICES.filter((s) => s.levels.includes(state.career.level));
export const servicePrice = (state: GameState, id: ServiceId): number => scaled(state, SERVICE_BY_ID[id].base);

/** A service works until the end of the season it was bought in (summer included), or the next one if bought in the offseason. */
export function hasService(state: GameState, id: ServiceId): boolean {
  return state.player.services.some((s) => s.id === id && s.until >= state.career.season);
}

export function serviceUntil(state: GameState): number {
  return state.career.season + (state.career.phase === 'offseason' ? 1 : 0);
}

export type BuyResult = { ok: true; price: number } | { ok: false; reason: string };

export function buyService(state: GameState, id: ServiceId): BuyResult {
  const def = SERVICE_BY_ID[id];
  if (!def || !def.levels.includes(state.career.level)) return { ok: false, reason: 'That is not available right now.' };
  if (hasService(state, id) && state.player.services.find((s) => s.id === id)!.until >= serviceUntil(state)) return { ok: false, reason: `${def.name} is already working for you.` };
  const price = servicePrice(state, id);
  if (state.player.money < price) return { ok: false, reason: 'You cannot afford that yet.' };
  state.player.money -= price;
  state.player.finance.services += price;
  state.player.services = state.player.services.filter((s) => s.id !== id).concat({ id, until: serviceUntil(state) });
  return { ok: true, price };
}

/* ───────────────────────── Spending and gifts ───────────────────────── */

/** Spend money on something. Returns false (and spends nothing) if there is not enough. */
export function spend(state: GameState, amount: number): boolean {
  const n = Math.max(0, Math.round(amount));
  if (state.player.money < n) return false;
  state.player.money -= n;
  state.player.finance.spent += n;
  return true;
}

/** Money that simply shows up (a windfall, a gift, a bonus). */
export function receive(state: GameState, amount: number) {
  const n = Math.max(0, Math.round(amount));
  state.player.money += n;
  state.player.finance.gifts += n;
}

/* ───────────────────────── Weekly pay ───────────────────────── */

export interface WeeklyPay {
  salary: number;
  allowance: number;
  endorse: number;
  gross: number;
  taxes: number;
  living: number;
  net: number;
}

/** What one regular-season week brings in and takes out. */
export function weeklyPay(state: GameState): WeeklyPay {
  const lvl = state.career.level;
  const weeks = Math.max(1, state.league.regularWeeks);
  const salary = lvl === 'pro' && state.player.contract ? state.player.contract.salary / weeks : 0;
  // a family with money (or without) shows up in what you have to spend as an amateur
  const allowance = WEEKLY_ALLOWANCE[lvl] * modsOf(state).allowance / difficultyOf(state).cost;
  const endorse = state.player.deals.reduce((a, d) => a + d.perSeason * (1 - d.commission), 0) / weeks;
  const taxable = lvl === 'pro' ? salary + endorse : 0;
  const taxes = taxable * PRO_TAX_RATE;
  const living = lvl === 'pro' ? salary * PRO_LIVING_RATE * difficultyOf(state).cost : 0;
  const gross = salary + allowance + endorse;
  return { salary, allowance, endorse, gross, taxes, living, net: gross - taxes - living };
}

/** Pay one week of the regular season. Called once for each week played. */
export function payWeek(state: GameState): WeeklyPay {
  const w = weeklyPay(state);
  const f = state.player.finance;
  f.season = state.career.season;
  state.player.money = Math.max(0, Math.round(state.player.money + w.net));
  f.earned += Math.round(w.gross);
  f.endorse += Math.round(w.endorse);
  f.taxes += Math.round(w.taxes);
  f.living += Math.round(w.living);
  return w;
}

const EMPTY: FinanceLine = { earned: 0, endorse: 0, taxes: 0, living: 0, services: 0, spent: 0, gifts: 0 };

/** Season turn: file this season away and start a clean page. Expired services drop off. */
export function rollFinanceSeason(state: GameState) {
  const f = state.player.finance;
  const { season: _s, prev: _p, ...line } = f;
  void _s;
  void _p;
  const last = { ...EMPTY, ...line };
  state.player.finance = { ...EMPTY, season: state.career.season, prev: last };
  state.player.services = state.player.services.filter((s) => s.until >= state.career.season);
}

/** Money you could spend after a season of this level without going broke: used to word advice, never to block anything. */
export const comfortable = (state: GameState): number => weeklyPay(state).net * Math.max(1, state.league.regularWeeks) * 0.5;

export const netWorthLabel = (n: number): string => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`);

