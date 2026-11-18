import { LEVEL_CONFIG } from '../data/teams';
import type { Athlete, GameState } from '../state/schemas';
import { MIN_SALARY, payroll, salaryCap, salaryOf } from './contracts';
import { teamRoster } from './league';
import { addNews, logTransaction } from './news';
import { overall } from './ratings';

/**
 * The trade market for a coach. Salaries and the cap are the same ones every pro team lives under: a team must
 * finish a trade under the cap or take back no more than 125% of the pay it sends out (plus a little). The other
 * front office says yes when it gets enough value back, and a coach with a name gets the benefit of the doubt.
 */

export const MAX_TRADES = 2;
export const SALARY_MATCH = 1.25;
const SALARY_SLACK = 100_000;

/** What a team sees in a player: now, growth still to come, and a discount for age. */
export function tradeValue(a: Athlete): number {
  const ovr = overall(a.ratings);
  const youth = a.age <= 25 ? Math.max(0, a.potential - ovr) * 0.3 + (25 - a.age) * 0.6 : 0;
  const old = Math.max(0, a.age - 30) * 1.6;
  return ovr + youth - old;
}

export interface TradeCheck {
  ok: boolean;
  /** Why not, in plain words, or what is good about it. */
  reasons: string[];
  /** Value you give divided by the value they want. At or above 1 means they say yes on value alone. */
  ratio: number;
  yourPayroll: number;
  theirPayroll: number;
  cap: number;
}

export interface TradeTarget {
  id: string;
  name: string;
  teamId: string;
  team: string;
  position: string;
  age: number;
  ovr: number;
  salary: number;
  value: number;
}

export function tradeTargets(s: GameState, n = 10): TradeTarget[] {
  const c = s.coaching;
  if (!c.teamId) return [];
  const out: TradeTarget[] = [];
  for (const tid of s.league.teamIds) {
    if (tid === c.teamId) continue;
    for (const a of teamRoster(s, tid)) {
      out.push({ id: a.id, name: `${a.firstName} ${a.lastName}`, teamId: tid, team: s.teams[tid].name, position: a.position, age: a.age, ovr: overall(a.ratings), salary: salaryOf(a), value: tradeValue(a) });
    }
  }
  return out.sort((a, b) => b.value - a.value).slice(0, n);
}

/** How hard a team makes you pay for its player: a famous coach gets a friendlier ear. */
export const askFactor = (rep: number): number => 1.08 - Math.max(0, Math.min(100, rep)) / 600;

const money = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

/** Would they do it? Deterministic, so the screen can show the answer before the coach asks. */
export function checkTrade(s: GameState, targetId: string, giveIds: string[]): TradeCheck {
  const c = s.coaching;
  const cap = salaryCap(s);
  const none: TradeCheck = { ok: false, reasons: [], ratio: 0, yourPayroll: 0, theirPayroll: 0, cap };
  const target = s.athletes[targetId];
  const mine = c.teamId ? s.teams[c.teamId] : undefined;
  if (!c.active || c.stage !== 'offseason' || !mine) return { ...none, reasons: ['Trades happen in the offseason, once you have a job.'] };
  if (!target || !target.teamId || target.teamId === mine.id) return { ...none, reasons: ['Pick a player from another team.'] };
  const theirs = s.teams[target.teamId];
  const give = [...new Set(giveIds)].map((id) => s.athletes[id]).filter((a): a is Athlete => !!a && mine.rosterIds.includes(a.id));
  if (give.length < 1 || give.length > 2) return { ...none, reasons: ['Offer one or two of your players.'] };
  if (c.trades >= MAX_TRADES) return { ...none, reasons: [`You have made ${MAX_TRADES} trades this offseason. That is the limit.`] };

  const out = give.reduce((n, a) => n + salaryOf(a), 0);
  const inc = salaryOf(target);
  const mineAfter = payroll(s, mine) - out + inc;
  const theirsAfter = payroll(s, theirs) - inc + out;
  const reasons: string[] = [];
  let ok = true;
  // a team over the cap afterwards must take back no more than it sends out (plus a margin)
  if (mineAfter > cap && inc > out * SALARY_MATCH + SALARY_SLACK) {
    ok = false;
    reasons.push(`You would be over the cap (${money(mineAfter)} of ${money(cap)}). Send out at least ${money(Math.max(MIN_SALARY, (inc - SALARY_SLACK) / SALARY_MATCH))} to match the pay.`);
  }
  if (theirsAfter > cap && out > inc * SALARY_MATCH + SALARY_SLACK) {
    ok = false;
    reasons.push(`${theirs.name} would be over the cap and cannot take on that much pay.`);
  }
  // a 2-for-1 leaves them one over, which the league allows, but never past a thirteenth man
  if (theirs.rosterIds.length + give.length - 1 > LEVEL_CONFIG.pro.rosterSize + 1) {
    ok = false;
    reasons.push(`${theirs.name} have no room for two more bodies.`);
  }
  const want = tradeValue(target) * askFactor(c.rep);
  const have = give.reduce((n, a) => n + tradeValue(a), 0);
  const ratio = want > 0 ? have / want : 0;
  if (ratio < 1) {
    ok = false;
    reasons.push(ratio >= 0.9 ? `${theirs.name} are close. A little more value and it works.` : `${theirs.name} say it is not enough value.`);
  }
  if (ok) reasons.push(`${theirs.name} would do it.`);
  return { ok, reasons, ratio: Math.round(ratio * 100) / 100, yourPayroll: mineAfter, theirPayroll: theirsAfter, cap };
}

/** Makes the trade if the check passes. */
export function proposeTrade(s: GameState, targetId: string, giveIds: string[]): { done: boolean; text: string } {
  const check = checkTrade(s, targetId, giveIds);
  if (!check.ok) return { done: false, text: check.reasons[0] ?? 'No deal.' };
  const c = s.coaching;
  const mine = s.teams[c.teamId];
  const target = s.athletes[targetId];
  const theirs = s.teams[target.teamId!];
  const give = [...new Set(giveIds)].map((id) => s.athletes[id]);
  mine.rosterIds = mine.rosterIds.filter((id) => !give.some((g) => g.id === id)).concat(target.id);
  theirs.rosterIds = theirs.rosterIds.filter((id) => id !== target.id).concat(give.map((g) => g.id));
  target.teamId = mine.id;
  for (const g of give) g.teamId = theirs.id;
  c.trades++;
  const names = give.map((g) => `${g.firstName} ${g.lastName}`).join(' and ');
  const text = `${mine.name} acquire ${target.firstName} ${target.lastName} from ${theirs.name} for ${names}.`;
  logTransaction(s, 'trade', text);
  addNews(s, text);
  return { done: true, text };
}
