import { describe, expect, it } from 'vitest';
import { GameStateSchema, type GameState, type Level } from '../state/schemas';
import { advanceWeek, createCareer, doTraining, userAthlete, withRng } from './career';
import { SERVICES, buyService, hasService, payWeek, servicePrice, weeklyPay } from './finance';
import { offerChance } from './media';
import { lifeContext, lifeEventDefs, lifeEventView, lifeRefs, lifeChance, resolveLifeEvent } from './lifeEvents';
import { executeMove, forceTrade, moveStatus, replaceCoach, startMove, stayPut, tradeOdds } from './moves';
import { overall } from './ratings';
import { RNG } from './rng';
import { athleteStatus, classLabel, storyTitle, upgradeSave } from './storyAthletes';
import { playUntil, tick } from './testkit';

const make = (seed: number) => createCareer({ firstName: 'Life', lastName: `Test${seed}`, hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

/** A career fast-forwarded to the middle of a season at the given level. */
function careerAt(level: Level, seed: number): { s: GameState; rng: RNG } {
  const s = make(seed);
  const rng = new RNG(seed * 17 + 3);
  playUntil(s, rng, (x) => x.career.level === level && x.career.phase === 'regular' && x.career.week >= 2 && !x.career.lifeEvent);
  expect(s.career.level).toBe(level);
  return { s, rng };
}

describe('random moments', () => {
  it('every event reads well and every choice resolves cleanly, at every level', () => {
    const seen = new Set<string>();
    for (const level of ['hs', 'college', 'pro'] as Level[]) {
      const { s } = careerAt(level, 21);
      const refs = lifeRefs(s);
      for (const def of lifeEventDefs().filter((d) => d.levels.includes(level))) {
        if ((def.need ?? []).some((r) => !refs[r])) continue;
        seen.add(def.id);
        const st = structuredClone(s);
        st.player.money = 5_000_000;
        st.career.lifeEvent = { id: def.id, seed: 11, refs };
        const view = lifeEventView(st)!;
        expect(view, def.id).not.toBeNull();
        expect(view.text.length, def.id).toBeGreaterThan(20);
        expect(view.options.length, def.id).toBeGreaterThanOrEqual(1);
        expect(view.text, def.id).not.toMatch(/undefined|NaN|\[object/);
        for (const o of view.options) {
          const t = structuredClone(st);
          const out = withRng(t, (rng) => resolveLifeEvent(t, rng, o.id));
          expect(out, `${def.id}/${o.id}`).not.toBeNull();
          expect(out!.text.length).toBeGreaterThan(10);
          expect(out!.text + out!.lines.join(' ')).not.toMatch(/undefined|NaN|\[object/);
          expect(t.career.lifeEvent).toBeNull();
          const p = t.player;
          for (const v of [p.morale, p.energy, p.reputation]) expect(v).toBeGreaterThanOrEqual(0);
          for (const v of [p.morale, p.energy, p.reputation]) expect(v).toBeLessThanOrEqual(100);
          expect(p.academics).toBeGreaterThanOrEqual(0);
          expect(p.academics).toBeLessThanOrEqual(4);
          expect(Number.isFinite(p.money) && p.money >= 0).toBe(true);
          expect(Number.isFinite(p.followers) && p.followers >= 0).toBe(true);
          for (const n of Object.values(t.npcs)) for (const val of Object.values(n.relationship)) expect(Number.isFinite(val)).toBe(true);
        }
        // the whole save still loads after the first choice
        const t = structuredClone(st);
        withRng(t, (rng) => resolveLifeEvent(t, rng, view.options[0].id));
        expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(t)))).not.toThrow();
      }
    }
    // nearly every event gets exercised somewhere in a career
    expect(seen.size).toBeGreaterThanOrEqual(lifeEventDefs().length - 3);
  }, 120_000);

  it('a choice that costs money charges for it, and one you cannot afford is refused', () => {
    const { s } = careerAt('hs', 5);
    const refs = lifeRefs(s);
    s.career.lifeEvent = { id: 'family_money', seed: 3, refs };
    const cost = lifeEventView(s)!.options.find((o) => o.id === 'help')!.cost!;
    expect(cost).toBeGreaterThan(0);
    const broke = structuredClone(s);
    broke.player.money = cost - 1;
    expect(lifeEventView(broke)!.options.find((o) => o.id === 'help')!.affordable).toBe(false);
    expect(withRng(broke, (rng) => resolveLifeEvent(broke, rng, 'help'))).toBeNull();
    expect(broke.player.money).toBe(cost - 1);
    expect(broke.career.lifeEvent).not.toBeNull();

    const rich = structuredClone(s);
    rich.player.money = cost + 40;
    const out = withRng(rich, (rng) => resolveLifeEvent(rich, rng, 'help'))!;
    expect(rich.player.money).toBe(40);
    expect(out.lines.some((l) => l.includes(`$${cost.toLocaleString()}`))).toBe(true);
    // the family notices
    const fam = rich.npcs[refs.family];
    expect(fam.relationship.affinity).toBeGreaterThan(s.npcs[refs.family].relationship.affinity);
  });

  it('they come up often enough to matter, vary a lot, and never twice in a row', () => {
    for (const seed of [4, 8]) {
      const s = make(seed);
      const rng = new RNG(seed);
      let weeks = 0;
      const order: string[] = [];
      let n = 0;
      while (s.career.phase !== 'retired' && n++ < 20000) {
        const before = s.career.week + s.career.season * 100;
        const had = s.career.lifeEvent?.id;
        tick(s, rng);
        if (had) order.push(had);
        if (s.career.week + s.career.season * 100 !== before) weeks++;
        if (s.career.season >= 9) break;
      }
      const rate = order.length / weeks;
      expect(rate).toBeGreaterThan(0.12);
      expect(rate).toBeLessThan(0.5);
      expect(new Set(order).size).toBeGreaterThanOrEqual(18);
      for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
    }
  });

  it('gives a quiet stretch a nudge, but never two weeks in a row', () => {
    const { s } = careerAt('hs', 6);
    s.career.lifeEvent = null;
    s.career.weeksSinceLife = 1;
    const low = lifeChance(s);
    s.career.weeksSinceLife = 6;
    expect(lifeChance(s)).toBeGreaterThan(low);
    s.career.lifeEvent = { id: 'flu', seed: 1, refs: {} };
    expect(lifeChance(s)).toBe(0);
  });

  it('the context builder is stable for the same seed', () => {
    const { s } = careerAt('hs', 7);
    const refs = lifeRefs(s);
    const a = lifeContext(s, refs, 9);
    const b = lifeContext(s, refs, 9);
    expect(a.pick([1, 2, 3, 4, 5, 6, 7, 8])).toBe(b.pick([1, 2, 3, 4, 5, 6, 7, 8]));
  });
});

describe('money', () => {
  it('pays every game week, and takes taxes and living costs out of a professional salary', () => {
    const { s } = careerAt('pro', 9);
    s.player.deals = [];
    const w = weeklyPay(s);
    expect(s.career.level).toBe('pro');
    expect(w.salary).toBeGreaterThan(0);
    expect(w.taxes).toBeCloseTo(w.salary * 0.3, 5);
    expect(w.living).toBeCloseTo(w.salary * 0.08, 5);
    expect(w.net).toBeCloseTo(w.salary * 0.62, 5);
    const before = s.player.money;
    const earnedBefore = s.player.finance.earned;
    payWeek(s);
    expect(s.player.money - before).toBe(Math.round(before + w.net) - before);
    expect(s.player.finance.earned - earnedBefore).toBe(Math.round(w.gross));
    expect(s.player.finance.taxes).toBeGreaterThan(0);
  });

  it('a whole pro season of paychecks adds up to the contract, less taxes and costs', () => {
    const { s, rng } = careerAt('pro', 13);
    s.player.deals = [];
    s.offers = [];
    // start from a clean ledger at the top of a season
    playUntil(s, rng, (x) => x.career.phase === 'preseason' && !x.career.lifeEvent);
    s.player.deals = [];
    s.offers = [];
    const salary = s.player.contract!.salary;
    const money0 = s.player.money;
    // a random moment answered on the way here may already be in the ledger, so compare changes
    const f0 = s.player.finance;
    const kept0 = f0.earned + f0.gifts - f0.taxes - f0.living - f0.services - f0.spent;
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && !x.career.lifeEvent);
    const f = s.player.finance;
    // endorsements signed along the way come on top of the salary
    const base = f.earned - f.endorse;
    expect(base).toBeGreaterThan(salary * 0.97);
    expect(base).toBeLessThanOrEqual(salary * 1.03);
    expect(f.taxes).toBeGreaterThan(salary * 0.28);
    expect(f.living).toBeGreaterThan(salary * 0.07);
    // what is in the bank lines up with the ledger, give or take what the random moments and hires did
    const kept = f.earned + f.gifts - f.taxes - f.living - f.services - f.spent - kept0;
    expect(s.player.money - money0).toBeGreaterThan(kept - 1000);
    expect(s.player.money - money0).toBeLessThan(kept + 1000);
  });

  it('high school and college players get an allowance, not a lump sum', () => {
    const hs = careerAt('hs', 14).s;
    const w = weeklyPay(hs);
    expect(w.allowance).toBeGreaterThan(0);
    expect(w.taxes).toBe(0);
    expect(w.net).toBe(w.allowance);
    const col = careerAt('college', 14).s;
    expect(weeklyPay(col).allowance).toBeGreaterThan(w.allowance);
  });

  it('services cost money, refuse you when broke, and last through the season they were bought in', () => {
    const { s } = careerAt('hs', 31);
    const price = servicePrice(s, 'trainer');
    s.player.money = price - 1;
    expect(buyService(s, 'trainer').ok).toBe(false);
    expect(s.player.money).toBe(price - 1);
    s.player.money = price + 7;
    const r = buyService(s, 'trainer');
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(7);
    expect(hasService(s, 'trainer')).toBe(true);
    expect(s.player.finance.services).toBe(price);
    // you cannot buy it twice for the same stretch
    s.player.money = price * 3;
    expect(buyService(s, 'trainer').ok).toBe(false);
    // it runs out when the next season starts
    const rng = new RNG(2);
    playUntil(s, rng, (x) => x.career.phase === 'preseason' && x.career.season === 2 && !x.career.lifeEvent);
    expect(hasService(s, 'trainer')).toBe(false);
  });

  it('a service hired in the offseason covers the summer and the whole next season', () => {
    const { s, rng } = careerAt('hs', 32);
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && !x.career.lifeEvent);
    s.player.money = 10_000;
    expect(buyService(s, 'nutrition').ok).toBe(true);
    expect(hasService(s, 'nutrition')).toBe(true);
    playUntil(s, rng, (x) => x.career.phase === 'regular' && x.career.season === 2 && !x.career.lifeEvent);
    expect(hasService(s, 'nutrition')).toBe(true);
  });

  it('a private trainer really does make training pay off more', () => {
    const base = careerAt('hs', 40).s;
    base.player.energy = 90;
    const gain = (withTrainer: boolean) => {
      let total = 0;
      for (let i = 0; i < 40; i++) {
        const t = structuredClone(base);
        t.rngState = 1000 + i;
        if (withTrainer) {
          t.player.money = 1e6;
          buyService(t, 'trainer');
        }
        const a = userAthlete(t);
        const before = a.ratings.shooting + (t.player.progress.shooting ?? 0);
        doTraining(t, 'shooting');
        total += a.ratings.shooting + (t.player.progress.shooting ?? 0) - before;
      }
      return total;
    };
    const plain = gain(false);
    const trained = gain(true);
    expect(trained / plain).toBeGreaterThan(1.1);
    expect(trained / plain).toBeLessThan(1.35);
  });

  it('a tutor stops grades from slipping on their own', () => {
    const { s } = careerAt('hs', 41);
    s.player.academics = 3;
    s.player.money = 1e6;
    buyService(s, 'tutor');
    const before = s.player.academics;
    advanceWeek(s);
    expect(s.player.academics).toBe(before);
    expect(SERVICES.find((x) => x.id === 'tutor')!.levels).not.toContain('pro');
  });

  it('a PR and brand team brings more endorsement offers, but only once you can have them', () => {
    const { s } = careerAt('college', 16);
    s.player.reputation = 40;
    s.player.followers = 50_000;
    s.offers = [];
    s.player.deals = [];
    const plain = offerChance(s);
    expect(plain).toBeGreaterThan(0);
    s.player.money = 1e7;
    expect(buyService(s, 'agency').ok).toBe(true);
    expect(offerChance(s)).toBeGreaterThan(plain * 1.4);
    expect(SERVICES.find((x) => x.id === 'agency')!.levels).not.toContain('hs');
  });

  it('endorsements still pay out in full over the season', () => {
    const { s, rng } = careerAt('college', 15);
    s.player.deals = [{ id: 'd1', brand: 'Apex', category: 'shoes', perSeason: 9000, yearsLeft: 2, energy: 0, sketchy: false, commission: 0, signedSeason: s.career.season }];
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && !x.career.lifeEvent);
    // signed a couple of weeks in, so it pays for the weeks that are left
    expect(s.player.finance.endorse).toBeGreaterThan(9000 * 0.75);
    // the play-through may sign more deals along the way; together they can never pay more than they are worth
    expect(s.player.finance.endorse).toBeLessThanOrEqual(s.player.deals.reduce((t, d) => t + d.perSeason, 0));
  });
});

describe('moving on', () => {
  it('opens the transfer window for a high schooler only in the offseason, and not for a senior', () => {
    const { s, rng } = careerAt('hs', 50);
    expect(moveStatus(s)!.can).toBe(false);
    expect(moveStatus(s)!.reason).toMatch(/season is over/i);
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && !x.career.lifeEvent);
    expect(moveStatus(s)!.can).toBe(true);
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && x.career.year === 4 && !x.career.lifeEvent);
    expect(moveStatus(s)!.can).toBe(false);
  });

  it('transferring changes your school, coach, teammates and friends, and keeps every roster whole', () => {
    const { s, rng } = careerAt('hs', 51);
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && !x.career.lifeEvent);
    const oldTeam = s.teams[s.career.teamId];
    const oldCoach = Object.values(s.npcs).find((n) => n.role === 'coach' && n.active)!;
    const sizes = Object.fromEntries(Object.values(s.teams).filter((t) => s.league.teamIds.includes(t.id)).map((t) => [t.id, t.rosterIds.length]));

    const res = withRng(s, (r) => startMove(s, r));
    expect(res.ok).toBe(true);
    const pm = s.career.pendingMove!;
    expect(pm.kind).toBe('transfer');
    expect(pm.offers.length).toBeGreaterThanOrEqual(1);
    expect(pm.offers.length).toBeLessThanOrEqual(3);
    expect(pm.offers.every((o) => o.teamId !== oldTeam.id)).toBe(true);
    // already asked: no second window this year
    expect(moveStatus(s)!.can).toBe(false);

    const offer = pm.offers[0];
    const out = withRng(s, (r) => executeMove(s, r, offer.teamId))!;
    expect(out.to).toBe(offer.name);
    expect(s.career.teamId).toBe(offer.teamId);
    expect(s.career.pendingMove).toBeNull();
    expect(userAthlete(s).teamId).toBe(offer.teamId);
    expect(s.teams[offer.teamId].rosterIds).toContain(s.player.athleteId);
    expect(oldTeam.rosterIds).not.toContain(s.player.athleteId);
    for (const t of Object.values(s.teams).filter((t) => s.league.teamIds.includes(t.id))) {
      expect(t.rosterIds.length).toBe(sizes[t.id]);
      for (const id of t.rosterIds) expect(s.athletes[id].teamId).toBe(t.id);
    }
    // the old coach is now a former coach, and a new head coach with little trust takes over
    expect(s.npcs[oldCoach.id].role).toBe('mentor');
    const newCoach = Object.values(s.npcs).find((n) => n.role === 'coach' && n.active)!;
    expect(newCoach.name).toBe(offer.coachName);
    expect(newCoach.relationship.trust).toBeLessThanOrEqual(35);
    // old teammates are not part of your daily life any more
    for (const n of Object.values(s.npcs)) if (n.role === 'teammate' && n.active) expect(s.athletes[n.athleteId!].teamId).toBe(offer.teamId);
    expect(s.story.log.some((e) => e.kind === 'transfer')).toBe(true);
    expect(s.news.some((n) => /transfers from/.test(n.text))).toBe(true);
  });

  it('staying put after looking around costs a little trust and closes the window', () => {
    const { s, rng } = careerAt('hs', 52);
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && !x.career.lifeEvent);
    const coach = Object.values(s.npcs).find((n) => n.role === 'coach' && n.active)!;
    const t0 = coach.relationship.trust;
    withRng(s, (r) => startMove(s, r));
    expect(s.career.pendingMove).not.toBeNull();
    stayPut(s);
    expect(s.career.pendingMove).toBeNull();
    expect(coach.relationship.trust).toBeLessThan(t0);
    expect(s.career.teamId).toBe(s.teams[s.career.teamId].id);
    expect(moveStatus(s)!.can).toBe(false);
  });

  it('a college transfer comes with a signing package from the new school', () => {
    const { s, rng } = careerAt('college', 53);
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && x.career.year <= 2 && !x.career.lifeEvent);
    expect(moveStatus(s)!.can).toBe(true);
    withRng(s, (r) => startMove(s, r));
    const offer = s.career.pendingMove!.offers[0];
    expect(offer.nil).toBeGreaterThan(0);
    const bank = s.player.money;
    withRng(s, (r) => executeMove(s, r, offer.teamId));
    expect(s.player.money).toBe(bank + offer.nil);
    expect(s.player.collegeId).toBe(offer.teamId);
  });

  it('a pro can ask for a trade before the deadline, once a season; the answer depends on how they stand', () => {
    const { s } = careerAt('pro', 54);
    expect(moveStatus(s)!.kind).toBe('trade');
    expect(moveStatus(s)!.can).toBe(true);
    const base = tradeOdds(s);
    expect(base).toBeGreaterThanOrEqual(0.1);
    expect(base).toBeLessThanOrEqual(0.9);
    const pushed = structuredClone(s);
    pushed.story.flags.trade_interest = pushed.career.season;
    expect(tradeOdds(pushed)).toBeGreaterThan(base - 1e-9);

    let granted = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      const t = structuredClone(s);
      const r = withRng(t, (rng) => {
        rng.next();
        for (let k = 0; k < i; k++) rng.next();
        return startMove(t, rng);
      });
      expect(t.career.moveSeason).toBe(t.career.season);
      expect(moveStatus(t)!.can).toBe(false);
      if (r.ok) {
        granted++;
        expect(t.career.pendingMove!.offers.length).toBeGreaterThanOrEqual(1);
      } else {
        expect(t.career.pendingMove).toBeNull();
        expect(t.news[t.news.length - 1].text).toMatch(/turn down|no team/i);
      }
    }
    expect(granted).toBeGreaterThan(N * 0.1);
    expect(granted).toBeLessThan(N * 0.95);
  });

  it('a granted trade keeps the contract, moves the player, and puts a new coach in charge', () => {
    const { s } = careerAt('pro', 55);
    const salary = s.player.contract!.salary;
    const oldId = s.career.teamId;
    let done = false;
    for (let i = 0; i < 40 && !done; i++) {
      const t = structuredClone(s);
      t.story.flags.trade_interest = t.career.season;
      withRng(t, (rng) => {
        for (let k = 0; k < i; k++) rng.next();
        startMove(t, rng);
      });
      if (!t.career.pendingMove) continue;
      const offer = t.career.pendingMove.offers[0];
      const res = withRng(t, (rng) => executeMove(t, rng, offer.teamId))!;
      expect(res.kind).toBe('trade');
      expect(t.career.teamId).toBe(offer.teamId);
      expect(t.player.contract!.salary).toBe(salary);
      expect(t.player.contract!.teamId).toBe(offer.teamId);
      expect(t.teams[oldId].rosterIds).not.toContain(t.player.athleteId);
      expect(Object.values(t.npcs).find((n) => n.role === 'coach' && n.active)!.name).toBe(offer.coachName);
      done = true;
    }
    expect(done).toBe(true);
  });

  it('there is no trade after the deadline or in the playoffs', () => {
    const { s } = careerAt('pro', 56);
    s.career.week = s.league.regularWeeks;
    expect(moveStatus(s)!.can).toBe(false);
    expect(moveStatus(s)!.reason).toMatch(/deadline/i);
    s.career.phase = 'playoffs';
    expect(moveStatus(s)!.can).toBe(false);
  });

  it('the league can trade you away, and a coach can be fired', () => {
    const { s } = careerAt('pro', 57);
    const from = s.career.teamId;
    const r = withRng(s, (rng) => forceTrade(s, rng))!;
    expect(r).not.toBeNull();
    expect(s.career.teamId).not.toBe(from);
    expect(r.headline).toMatch(/trade/i);
    const old = Object.values(s.npcs).find((n) => n.role === 'coach' && n.active)!.name;
    const swap = withRng(s, (rng) => replaceCoach(s, rng))!;
    expect(swap.oldName).toBe(old);
    expect(swap.newName).not.toBe(old);
    expect(Object.values(s.npcs).filter((n) => n.role === 'coach' && n.active)).toHaveLength(1);
    expect(s.teams[s.career.teamId].coachName).toBe(swap.newName);
  });
});

const playUntilSenior = (s: GameState) => playUntil(s, new RNG(77), (x) => x.career.phase === 'preseason' && x.career.year === 4 && !x.career.lifeEvent);

describe('rivals and friends keep growing up', () => {
  it('names the right class year as the seasons go by instead of calling a senior a freshman', () => {
    expect(classLabel('hs', 14)).toBe('Freshman');
    expect(classLabel('hs', 17)).toBe('Senior');
    expect(classLabel('college', 18)).toBe('Freshman');
    expect(classLabel('college', 21)).toBe('Senior');
    for (const seed of [3, 12, 99, 2024]) {
      const s = make(seed);
      const rng = new RNG(seed);
      const rivalOf = () => Object.values(s.npcs).find((n) => n.role === 'rival')!;
      const friendOf = () => Object.values(s.npcs).find((n) => n.role === 'friend')!;
      expect(rivalOf().title).toMatch(/Freshman/);
      const want: Record<number, string> = { 2: 'Sophomore', 3: 'Junior', 4: 'Senior' };
      for (const year of [2, 3, 4]) {
        playUntil(s, rng, (x) => x.career.phase === 'preseason' && x.career.year === year && !x.career.lifeEvent);
        expect(rivalOf().title, `seed ${seed} year ${year}`).toContain(want[year]);
        expect(rivalOf().title).not.toMatch(/Freshman|phenom/);
        expect(friendOf().title).toContain(want[year]);
        // they have a line from last season to talk about
        expect(rivalOf().lastSeason, `seed ${seed} year ${year}`).toBeDefined();
        expect(rivalOf().lastSeason!.season).toBe(s.career.season - 1);
      }
    }
  });

  it('the rival works their way up their team, and is a real player by senior year', () => {
    const ranks: number[] = [];
    for (const seed of [3, 12, 99, 2024]) {
      const s = make(seed);
      const rng = new RNG(seed);
      playUntil(s, rng, (x) => x.career.phase === 'preseason' && x.career.year === 4 && !x.career.lifeEvent);
      const rival = Object.values(s.npcs).find((n) => n.role === 'rival')!;
      const st = athleteStatus(s, rival)!;
      const me = overall(userAthlete(s).ratings);
      const them = overall(s.athletes[rival.athleteId!].ratings);
      expect(st.rank).toBeGreaterThan(0);
      ranks.push(st.rank);
      expect(st.cls).toBe('Senior');
      expect(them).toBeGreaterThan(me - 6);
      expect(them).toBeLessThanOrEqual(me + 10);
      // last season they were a rotation player or better, with real minutes
      expect(rival.lastSeason!.mpg).toBeGreaterThan(10);
    }
    // a starter on their team (top five of ten) in every one of these careers
    expect(Math.max(...ranks)).toBeLessThanOrEqual(5);
  });

  it('a best friend stays on the roster and in the picture through senior year', () => {
    for (const seed of [3, 12, 99, 2024]) {
      const s = make(seed);
      const rng = new RNG(seed);
      const friend = Object.values(s.npcs).find((n) => n.role === 'friend')!;
      expect(s.athletes[friend.athleteId!].age).toBe(userAthlete(s).age);
      playUntil(s, rng, (x) => x.career.phase === 'regular' && x.career.year === 4 && x.career.week === 3 && !x.career.lifeEvent);
      const a = s.athletes[friend.athleteId!];
      expect(a.teamId).not.toBeNull();
      expect(storyTitle(s, friend)).toContain('Senior');
      if (a.teamId === s.career.teamId) {
        expect(s.teams[s.career.teamId].rosterIds).toContain(a.id);
        expect(athleteStatus(s, friend)!.rank).toBeLessThanOrEqual(6);
      } else {
        // the friend transferred (a benched friend sometimes does); it is on the record and in their title
        expect(friend.memories.some((m) => /Left /.test(m))).toBe(true);
        expect(friend.title).toContain(s.teams[a.teamId!].name);
      }
    }
  });

  it('their numbers stay in the story: a memory each season and a headline about the rival', () => {
    const s = make(12);
    const rng = new RNG(12);
    playUntil(s, rng, (x) => x.career.phase === 'preseason' && x.career.year === 3 && !x.career.lifeEvent);
    const rival = Object.values(s.npcs).find((n) => n.role === 'rival')!;
    expect(rival.memories.filter((m) => /^Season \d+:/.test(m)).length).toBeGreaterThanOrEqual(2);
    expect(s.news.some((n) => n.text.includes(rival.name) && /finishes the season/.test(n.text))).toBe(true);
  });

  it('an older save gets its rival and friend brought up to date the first time it opens', () => {
    const { s } = careerAt('hs', 12);
    playUntilSenior(s);
    // make it look like a save from before: stale title, a rival who never grew, a friend a year too old
    delete s.story.flags.story_athletes_v2;
    const rival = Object.values(s.npcs).find((n) => n.role === 'rival')!;
    const friend = Object.values(s.npcs).find((n) => n.role === 'friend')!;
    rival.title = 'Freshman phenom at St. Augustine Prep';
    rival.lastSeason = undefined;
    const ra = s.athletes[rival.athleteId!];
    for (const k of Object.keys(ra.ratings) as (keyof typeof ra.ratings)[]) ra.ratings[k] = 30;
    s.athletes[friend.athleteId!].age = userAthlete(s).age + 1;
    const before = overall(ra.ratings);
    expect(upgradeSave(s)).toBe(true);
    expect(rival.title).toContain('Senior');
    expect(rival.title).not.toContain('Freshman');
    expect(overall(ra.ratings)).toBeGreaterThan(before + 5);
    expect(s.athletes[friend.athleteId!].age).toBe(userAthlete(s).age);
    // only once
    const after = overall(ra.ratings);
    expect(upgradeSave(s)).toBe(false);
    expect(overall(ra.ratings)).toBe(after);
  });

  it('they follow you up a level with a fresh class year and no stale numbers', () => {
    const { s } = careerAt('college', 12);
    for (const n of Object.values(s.npcs)) if (n.role === 'rival' && n.athleteId && s.athletes[n.athleteId]) {
      expect(n.title).not.toMatch(/Senior.*ppg last season/);
      expect(n.title).toMatch(/Freshman|Sophomore|gone pro|Your rival/);
      expect(n.lastSeason === undefined || n.lastSeason.season >= s.career.season - 1).toBe(true);
    }
  });
});
