import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../state/schemas';
import { createCareer } from './career';
import { startCoaching, takeJob } from './coaching';
import { MAX_TRADES, askFactor, checkTrade, proposeTrade, tradeTargets, tradeValue } from './coachingTrades';
import { MIN_SALARY, payroll, salaryCap, salaryOf } from './contracts';
import { RNG } from './rng';
import { playUntil } from './testkit';

let base: GameState;
beforeAll(() => {
  const s = createCareer({ firstName: 'Tr', lastName: 'Ader', hometown: 'Akron, OH', archetype: 'playmaker', position: 'PG', heightIn: 74, schoolIndex: 0, traits: [], seed: 4 });
  playUntil(s, new RNG(5), (x) => x.career.phase === 'retired');
  base = s;
}, 120_000);

function coach(): GameState {
  const s = structuredClone(base);
  startCoaching(s);
  takeJob(s, s.coaching.offers[0]);
  return s;
}

const mineOf = (s: GameState) => s.teams[s.coaching.teamId];
const bestOf = (s: GameState, n = 1) => [...mineOf(s).rosterIds].sort((a, b) => tradeValue(s.athletes[b]) - tradeValue(s.athletes[a])).slice(0, n);

describe('coach trade market', () => {
  it('lists the best players on other teams, never your own', () => {
    const s = coach();
    const t = tradeTargets(s, 8);
    expect(t).toHaveLength(8);
    for (let i = 1; i < t.length; i++) expect(t[i - 1].value).toBeGreaterThanOrEqual(t[i].value);
    for (const x of t) expect(x.teamId).not.toBe(s.coaching.teamId);
  });

  it('younger and higher-potential players are worth more, old ones less', () => {
    const s = coach();
    const a = { ...s.athletes[mineOf(s).rosterIds[0]] };
    const young = { ...a, age: 21, potential: a.potential + 10 };
    const prime = { ...a, age: 27 };
    const old = { ...a, age: 35 };
    expect(tradeValue(young)).toBeGreaterThan(tradeValue(prime));
    expect(tradeValue(prime)).toBeGreaterThan(tradeValue(old));
  });

  it('a famous coach is asked for less than an unknown one', () => {
    expect(askFactor(100)).toBeLessThan(askFactor(0));
  });

  it('is closed outside the offseason and before you have a job', () => {
    const s = structuredClone(base);
    startCoaching(s); // no job yet
    expect(checkTrade(s, 'x', ['y']).ok).toBe(false);
    const c = coach();
    c.coaching.stage = 'review';
    const t = tradeTargets(c, 1)[0];
    expect(checkTrade(c, t.id, bestOf(c)).ok).toBe(false);
  });

  it('turns down a bad offer and explains why, and changes nothing', () => {
    const s = coach();
    const star = tradeTargets(s, 1)[0];
    const worst = [...mineOf(s).rosterIds].sort((a, b) => tradeValue(s.athletes[a]) - tradeValue(s.athletes[b]))[0];
    const before = JSON.stringify([mineOf(s).rosterIds, s.teams[star.teamId].rosterIds]);
    const chk = checkTrade(s, star.id, [worst]);
    expect(chk.ok).toBe(false);
    expect(chk.reasons.join(' ')).toMatch(/value|cap|close/);
    const r = proposeTrade(s, star.id, [worst]);
    expect(r.done).toBe(false);
    expect(JSON.stringify([mineOf(s).rosterIds, s.teams[star.teamId].rosterIds])).toBe(before);
    expect(s.coaching.trades).toBe(0);
  });

  it('a good offer goes through: rosters, teams and the trade count all agree afterwards', () => {
    const s = coach();
    // a salary-neutral two-for-one, so only the value rule is being tested, and well in your favour
    const target = tradeTargets(s, 10).at(-1)!;
    const mine = mineOf(s);
    const give = bestOf(s, 2);
    for (const id of [...give, target.id]) s.athletes[id].salary = MIN_SALARY;
    s.coaching.rep = 100;
    const sizeMine = mine.rosterIds.length;
    const sizeTheirs = s.teams[target.teamId].rosterIds.length;
    const chk = checkTrade(s, target.id, give);
    expect(chk.reasons.join(' ')).toContain('would do it');
    expect(chk.ok).toBe(true);
    const r = proposeTrade(s, target.id, give);
    expect(r.done).toBe(true);
    expect(r.text).toContain('acquire');
    expect(mine.rosterIds).toContain(target.id);
    for (const g of give) {
      expect(mine.rosterIds).not.toContain(g);
      expect(s.teams[target.teamId].rosterIds).toContain(g);
      expect(s.athletes[g].teamId).toBe(target.teamId);
    }
    expect(s.athletes[target.id].teamId).toBe(mine.id);
    // two went out and one came in, so they are one up and you are one down
    expect(mine.rosterIds.length).toBe(sizeMine - 1);
    expect(s.teams[target.teamId].rosterIds.length).toBe(sizeTheirs + 1);
    for (const tid of s.league.teamIds) for (const id of s.teams[tid].rosterIds) expect(s.athletes[id].teamId).toBe(tid);
    expect(s.coaching.trades).toBe(1);
    expect(s.transactions.at(-1)?.kind).toBe('trade');
  });

  it('respects the cap: taking on a lot more pay than you send out is refused', () => {
    const s = coach();
    const cap = salaryCap(s);
    const mine = mineOf(s);
    // fill your books so you are over the cap, then ask for a big salary for a small one
    for (const id of mine.rosterIds) s.athletes[id].salary = Math.ceil(cap / mine.rosterIds.length) + 2_000_000;
    expect(payroll(s, mine)).toBeGreaterThan(cap);
    const target = tradeTargets(s, 10)[0];
    s.athletes[target.id].salary = 40_000_000;
    const cheap = [...mine.rosterIds].sort((a, b) => salaryOf(s.athletes[a]) - salaryOf(s.athletes[b]))[0];
    s.athletes[cheap].salary = 2_000_000;
    s.coaching.rep = 100;
    const chk = checkTrade(s, target.id, [cheap]);
    expect(chk.ok).toBe(false);
    expect(chk.reasons.join(' ')).toMatch(/over the cap/);
  });

  it('is limited to a couple of trades an offseason, and you can only offer your own players', () => {
    const s = coach();
    const t = tradeTargets(s, 3)[0];
    s.coaching.trades = MAX_TRADES;
    expect(checkTrade(s, t.id, bestOf(s)).reasons[0]).toMatch(/limit/);
    s.coaching.trades = 0;
    expect(checkTrade(s, t.id, [t.id]).ok).toBe(false); // not yours to give
    expect(checkTrade(s, t.id, []).ok).toBe(false);
    expect(checkTrade(s, t.id, bestOf(s, 3)).ok).toBe(false); // at most two
  });
});
