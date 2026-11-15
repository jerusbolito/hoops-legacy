import { describe, expect, it } from 'vitest';
import type { GameState } from '../state/schemas';
import { createCareer, freeAgencyOffers, marketValue, withRng } from './career';
import { MIN_SALARY, acceptCounter, askingPrice, capSpace, endHoldout, extensionStatus, holdingOut, negotiate, payroll, salaryCap, salaryOf, startHoldout, weeklyHoldout, type Stance } from './contracts';
import { sitOutReason } from './consequences';
import { RNG } from './rng';
import { playUntil } from './testkit';
import { leagueOffseasonMoves } from './transactions';

const make = (seed: number) => createCareer({ firstName: 'Ct', lastName: `Test${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

function pro(seed: number): GameState {
  const s = make(seed);
  const rng = new RNG(seed + 7);
  playUntil(s, rng, (x) => x.career.level === 'pro' && x.career.phase === 'regular' && x.career.week >= 3 && x.career.step === 'training' && !x.career.lifeEvent);
  s.player.contract!.yearsLeft = 1;
  s.story.flags.ext_season = 0;
  return s;
}

describe('pro contracts and the cap', () => {
  it('everyone on a pro roster has a price, and a payroll adds up', () => {
    const s = pro(3);
    for (const id of s.league.teamIds) {
      const t = s.teams[id];
      const total = payroll(s, t);
      expect(total).toBeGreaterThan(8 * MIN_SALARY);
      expect(capSpace(s, t)).toBe(salaryCap(s) - total);
      for (const a of t.rosterIds.map((r) => s.athletes[r])) expect(salaryOf(a)).toBeGreaterThanOrEqual(MIN_SALARY);
    }
    // better players cost more
    const sorted = s.teams[s.career.teamId].rosterIds.map((r) => s.athletes[r]).sort((a, b) => askingPrice(b) - askingPrice(a));
    expect(askingPrice(sorted[0])).toBeGreaterThan(askingPrice(sorted[sorted.length - 1]));
    // your own deal is what you signed, not a guess
    expect(payroll(s, s.teams[s.career.teamId])).toBeGreaterThan(s.player.contract!.salary);
  });

  it('when contracts run out, new deals have a salary, and teams do not blow past the cap', () => {
    const s = pro(4);
    const before = new Map(s.league.teamIds.map((id) => [id, payroll(s, s.teams[id])]));
    leagueOffseasonMoves(s, new RNG(2));
    let signed = 0;
    for (const id of s.league.teamIds) {
      const t = s.teams[id];
      for (const a of t.rosterIds.map((r) => s.athletes[r])) {
        if (a.id === s.player.athleteId) continue;
        expect(a.salary).toBeDefined();
        expect(a.salary!).toBeGreaterThanOrEqual(MIN_SALARY);
        signed++;
      }
      // a team under the cap stays about there; one already over it only adds minimum deals
      expect(payroll(s, t)).toBeLessThanOrEqual(Math.max(before.get(id)!, salaryCap(s)) + 4 * MIN_SALARY + 0.15 * before.get(id)!);
    }
    expect(signed).toBeGreaterThan(80);
  });

  it('free-agent offers fit under each team\'s cap', () => {
    const s = make(5);
    const rng = new RNG(5);
    playUntil(s, rng, (x) => x.career.phase === 'free_agency');
    expect(s.career.phase).toBe('free_agency');
    const offers = freeAgencyOffers(s);
    expect(offers.length).toBeGreaterThanOrEqual(3);
    // the list leads with teams that can really pay you, not ones with no room
    expect(Math.max(...offers.map((o) => o.salary))).toBeGreaterThanOrEqual(marketValue(s) * 0.6);
    for (const o of offers) {
      expect(typeof o.capSpace).toBe('number');
      expect(o.salary).toBeGreaterThanOrEqual(MIN_SALARY);
      expect(o.salary).toBeLessThanOrEqual(Math.max(MIN_SALARY, Math.round(o.capSpace / 100_000) * 100_000));
    }
  });
});

describe('extensions and holdouts', () => {
  it('talks open in the last two years of a deal', () => {
    const s = pro(6);
    expect(extensionStatus(s)!.can).toBe(true);
    s.player.contract!.yearsLeft = 4;
    expect(extensionStatus(s)!.can).toBe(false);
    expect(extensionStatus(s)!.reason).toMatch(/last two/);
    expect(withRng(s, (r) => negotiate(s, r, 'fair'))).toBeNull();
  });

  it('a fair ask usually works, an absurd one usually does not, and in between you get a counter', () => {
    const base = pro(7);
    const rate = (stance: Stance) => {
      const out = { accepted: 0, counter: 0, rejected: 0 };
      for (let i = 0; i < 40; i++) {
        const s = structuredClone(base);
        s.rngState = 1000 + i;
        const r = withRng(s, (rng) => negotiate(s, rng, stance))!;
        out[r.outcome]++;
      }
      return out;
    };
    const fair = rate('fair');
    const high = rate('high');
    const max = rate('max');
    expect(fair.accepted).toBeGreaterThan(28);
    expect(max.rejected).toBeGreaterThan(20);
    expect(fair.accepted).toBeGreaterThanOrEqual(high.accepted);
    expect(high.accepted).toBeGreaterThanOrEqual(max.accepted);
    expect(high.accepted + high.counter + high.rejected).toBe(40);
  }, 60_000);

  it('a deal changes the contract, pays a bonus, and is a one-shot per season; a rejection costs you', () => {
    const s = pro(8);
    const m0 = s.player.money;
    const r = withRng(s, (rng) => negotiate(s, rng, 'fair'))!;
    if (r.outcome === 'accepted') {
      expect(s.player.contract!.salary).toBe(r.salary);
      expect(s.player.contract!.yearsLeft).toBe(r.years);
      expect(s.player.money).toBeGreaterThan(m0);
      expect(s.news.some((n) => /extension/.test(n.text))).toBe(true);
    }
    // the same season, no second go
    const t = pro(8);
    const first = withRng(t, (rng) => negotiate(t, rng, 'max'))!;
    if (first.outcome === 'rejected') {
      expect(extensionStatus(t)!.can).toBe(false);
      expect(withRng(t, (rng) => negotiate(t, rng, 'fair'))).toBeNull();
      expect(t.news.some((n) => /talks stall/.test(n.text))).toBe(true);
    }
  });

  it('a counteroffer can be taken', () => {
    let done = false;
    const base = pro(9);
    // a coach who neither loves nor distrusts you: asking 20% over market lands in counteroffer territory
    Object.values(base.npcs).find((n) => n.role === 'coach')!.relationship.trust = 50;
    for (let i = 0; i < 60 && !done; i++) {
      const s = structuredClone(base);
      s.rngState = 5000 + i;
      const r = withRng(s, (rng) => negotiate(s, rng, 'high'))!;
      if (r.outcome !== 'counter') continue;
      done = true;
      expect(extensionStatus(s)!.counter).toBe(r.salary);
      const out = acceptCounter(s)!;
      expect(s.player.contract!.salary).toBe(out.salary);
      expect(extensionStatus(s)!.counter).toBeNull();
    }
    expect(done).toBe(true);
  }, 60_000);

  it('a holdout keeps you out of games and wears everyone down, but the front office comes up', () => {
    const s = pro(10);
    const rej = structuredClone(s);
    withRng(rej, (rng) => negotiate(rej, rng, 'max'));
    expect(startHoldout(s)).toBe(true);
    expect(holdingOut(s)).toBe(true);
    expect(sitOutReason(s)).toMatch(/holding out/);
    const ceil0 = extensionStatus(s)!.ceiling;
    const coach = Object.values(s.npcs).find((n) => n.role === 'coach')!;
    const trust0 = coach.relationship.trust;
    const morale0 = s.player.morale;
    const chem0 = s.career.chemistry;
    for (let i = 0; i < 3; i++) weeklyHoldout(s);
    expect(coach.relationship.trust).toBeLessThan(trust0);
    expect(s.player.morale).toBeLessThan(morale0);
    expect(s.career.chemistry).toBeLessThan(chem0);
    expect(extensionStatus(s)!.ceiling).toBeGreaterThan(ceil0);
    // signing ends it
    const r = withRng(s, (rng) => negotiate(s, rng, 'fair'))!;
    expect(r.outcome).toBe('accepted');
    expect(holdingOut(s)).toBe(false);
    expect(sitOutReason(s)).toBeNull();
  });

  it('nobody holds out forever, and going back without a deal costs trust', () => {
    const s = pro(11);
    startHoldout(s);
    const coach = Object.values(s.npcs).find((n) => n.role === 'coach')!;
    const t0 = coach.relationship.trust;
    for (let i = 0; i < 8; i++) weeklyHoldout(s);
    expect(holdingOut(s)).toBe(false);
    expect(coach.relationship.trust).toBeLessThan(t0 - 8);
    const u = pro(11);
    startHoldout(u);
    const c2 = Object.values(u.npcs).find((n) => n.role === 'coach')!;
    const before = c2.relationship.trust;
    endHoldout(u);
    expect(c2.relationship.trust).toBe(before - 3);
    expect(startHoldout(pro(11)) && true).toBe(true);
  });

  it('you cannot hold out when your deal has years left or the season is not on', () => {
    const s = pro(12);
    s.player.contract!.yearsLeft = 4;
    expect(startHoldout(s)).toBe(false);
    const t = pro(12);
    t.career.phase = 'offseason';
    expect(startHoldout(t)).toBe(false);
  });
});
