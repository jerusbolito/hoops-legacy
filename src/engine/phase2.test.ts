import { describe, expect, it } from 'vitest';
import type { GameState } from '../state/schemas';
import { advanceWeek, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, draftStock, finishUserGame, userAthlete, withRng } from './career';
import { applyCombine, applyContestResult, availableEvents, midseasonWeek, playRound, runCombine, startContest, type Style } from './events';
import { acceptOffer, answerPress, dealsAllowed, declineOffer, expireOffers, maybeOffer, maybePress, nameValue, offerChance, postGamePosts, settleDeals, type PressFacts } from './media';
import { RNG } from './rng';

function toWeek(seed: number, week: number, level: 'hs' | 'college' | 'pro' = 'hs'): GameState {
  const s = createCareer({ firstName: 'Test', lastName: 'Player', hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: ['clutch'], seed });
  let ticks = 0;
  while (!(s.career.phase === 'regular' && s.career.week >= week && s.career.step === 'training') && ticks < 800) {
    const c = s.career;
    if (c.step === 'training') (c.phase === 'offseason' ? doSummerTraining(s, ['shooting']) : doTraining(s, s.player.energy < 40 ? 'rest' : 'study'));
    else if (c.step === 'scene') completeScene(s);
    else if (c.step === 'game') {
      const g = createUserGameSim(s)!;
      g.sim.runToEnd();
      finishUserGame(s, g.sim, g.game);
    } else advanceWeek(s);
    ticks++;
  }
  void level;
  return s;
}

describe('events', () => {
  it('offers the skills contests only at midseason, only if you qualify, and only once', () => {
    const s = toWeek(5, 2);
    const mid = midseasonWeek(s);
    s.career.week = mid + 1;
    expect(availableEvents(s)).toEqual([]);
    s.career.week = mid;
    const a = userAthlete(s);
    a.ratings.shooting = 90;
    a.ratings.athleticism = 90;
    a.ratings.finishing = 80;
    const ids = availableEvents(s).map((e) => e.id);
    expect(ids).toContain('skills_three');
    expect(ids).toContain('skills_dunk');
    // a weak, unknown player is not invited
    a.ratings.shooting = 20;
    a.ratings.athleticism = 20;
    s.player.reputation = 0;
    expect(availableEvents(s)).toEqual([]);
  });

  it('plays a contest: finals for the top three, a placement, and the same result for the same choices', () => {
    const s = toWeek(5, 2);
    userAthlete(s).ratings.shooting = 85;
    const mean = 56;
    const run = (styles: Style[]) => {
      let c = startContest(s, 'skills_three');
      expect(c.entrants).toHaveLength(6);
      expect(c.entrants.filter((e) => e.isUser)).toHaveLength(1);
      for (const st of styles) {
        if (c.finished) break;
        c = playRound(c, mean, st);
      }
      return c;
    };
    const a = run(['balanced', 'risky']);
    const b = run(['balanced', 'risky']);
    expect(a).toEqual(b);
    expect(a.finished).toBe(true);
    expect(a.placement).toBeGreaterThanOrEqual(1);
    expect(a.placement).toBeLessThanOrEqual(6);
    // after round one exactly three are still alive, unless you were cut, in which case the contest ends
    const r1 = playRound(startContest(s, 'skills_three'), mean, 'safe');
    expect(r1.entrants.filter((e) => e.alive)).toHaveLength(3);
    for (const e of r1.entrants) expect(e.rounds).toHaveLength(1);
    if (!r1.finished) {
      expect(r1.round).toBe(2);
      expect(r1.entrants.find((e) => e.isUser)!.alive).toBe(true);
    } else {
      expect(r1.placement).toBeGreaterThanOrEqual(4);
    }
  });

  it('rewards a win with reputation, followers, an award, and records that it was played', () => {
    const s = toWeek(5, 2);
    s.career.week = midseasonWeek(s);
    userAthlete(s).ratings.shooting = 95;
    const rep = s.player.reputation;
    const fol = s.player.followers;
    const c = { ...startContest(s, 'skills_three'), finished: true, placement: 1 };
    const r = applyContestResult(s, c);
    expect(r.placement).toBe(1);
    expect(s.player.reputation).toBeGreaterThan(rep);
    expect(s.player.followers).toBeGreaterThan(fol);
    expect(s.player.awards.some((x) => /Three-Point Contest Champion/.test(x.name))).toBe(true);
    expect(availableEvents(s).map((e) => e.id)).not.toContain('skills_three');
    // last place: no award, small morale hit
    const s2 = toWeek(5, 2);
    s2.career.week = midseasonWeek(s2);
    const m = s2.player.morale;
    applyContestResult(s2, { ...startContest(s2, 'skills_three'), finished: true, placement: 6 });
    expect(s2.player.awards.some((x) => /Champion/.test(x.name))).toBe(false);
    expect(s2.player.morale).toBeLessThan(m);
  });

  it('a stronger shooter scores more on average than a weak one', () => {
    const s = toWeek(5, 2);
    const mean = 56;
    const avg = (rating: number) => {
      let total = 0;
      const n = 120;
      for (let i = 0; i < n; i++) {
        s.rngState = (i * 7919 + 13) >>> 0;
        const c = startContest(s, 'skills_three');
        c.entrants[0].rating = rating;
        total += playRound(c, mean, 'balanced').entrants[0].rounds[0];
      }
      return total / n;
    };
    expect(avg(85)).toBeGreaterThan(avg(40) + 4);
  });

  it('runs the combine only at draft time, moves draft stock, and cannot be repeated', () => {
    const s = toWeek(5, 2);
    expect(availableEvents(s).map((e) => e.id)).not.toContain('combine');
    s.career.phase = 'draft';
    expect(availableEvents(s).map((e) => e.id)).toContain('combine');
    const stock0 = draftStock(s);
    const res = runCombine(s, 'steady');
    expect(res.drills).toHaveLength(5);
    expect(res.boost).toBeGreaterThanOrEqual(-3);
    expect(res.boost).toBeLessThanOrEqual(5);
    applyCombine(s, res);
    expect(draftStock(s)).toBeCloseTo(stock0 + res.boost, 5);
    expect(availableEvents(s).map((e) => e.id)).not.toContain('combine');
    // a great athlete grades better than a poor one
    const good = toWeek(5, 2);
    for (const k of ['athleticism', 'finishing', 'shooting', 'handles', 'iq'] as const) userAthlete(good).ratings[k] = 95;
    const bad = toWeek(5, 2);
    for (const k of ['athleticism', 'finishing', 'shooting', 'handles', 'iq'] as const) userAthlete(bad).ratings[k] = 25;
    expect(runCombine(good, 'steady').boost).toBeGreaterThan(runCombine(bad, 'steady').boost);
  });
});

describe('media: feed', () => {
  const facts = (o: Partial<Parameters<typeof postGamePosts>[2]> = {}) => ({ won: true, teamScore: 71, oppScore: 64, oppId: '', playoff: false, line: { sec: 1900, pts: 31, fgm: 12, fga: 20, tpm: 3, orb: 2, drb: 6, ast: 5, stl: 1, blk: 0, tov: 2 }, gameScore: 24, clutchHeroics: false, ...o });

  it('writes posts that only use the real numbers from the game', () => {
    const s = toWeek(5, 3);
    const opp = s.league.teamIds.find((t) => t !== s.career.teamId)!;
    const rng = new RNG(9);
    postGamePosts(s, rng, facts({ oppId: opp }));
    expect(s.feed.length).toBeGreaterThan(0);
    const text = s.feed.map((p) => p.text).join(' ');
    expect(text).toMatch(/31/);
    expect(text).toMatch(/71-64|71/);
    for (const p of s.feed) {
      expect(p.likes).toBeGreaterThanOrEqual(0);
      expect(p.handle.startsWith('@')).toBe(true);
    }
    // a quiet game gets quiet posts, and never invents a stat line
    const before = s.feed.length;
    postGamePosts(s, new RNG(2), facts({ oppId: opp, line: null, gameScore: 0 }));
    const added = s.feed.slice(before).map((p) => p.text).join(' ');
    expect(added).not.toMatch(/\d+ points/);
  });

  it('keeps the feed from growing without limit', () => {
    const s = toWeek(5, 3);
    const opp = s.league.teamIds.find((t) => t !== s.career.teamId)!;
    const rng = new RNG(4);
    for (let i = 0; i < 100; i++) postGamePosts(s, rng, facts({ oppId: opp }));
    expect(s.feed.length).toBeLessThanOrEqual(80);
    const ids = s.feed.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('media: endorsements', () => {
  const asCollege = (s: GameState) => {
    s.career.level = 'college';
    s.player.followers = 40_000;
    s.player.reputation = 60;
    return s;
  };

  it('does not let high school players take money', () => {
    const s = toWeek(5, 3);
    expect(s.career.level).toBe('hs');
    expect(dealsAllowed(s)).toBe(false);
    expect(offerChance(s)).toBe(0);
    expect(maybeOffer(s, new RNG(1))).toBeNull();
  });

  it('brings offers once you are known, with honest facts and an adviser who may not be', () => {
    const s = asCollege(toWeek(5, 3));
    expect(offerChance(s)).toBeGreaterThan(0.05);
    let offer = null;
    const rng = new RNG(3);
    for (let i = 0; i < 80 && !offer; i++) offer = maybeOffer(s, rng);
    expect(offer).not.toBeNull();
    expect(offer!.perSeason).toBeGreaterThan(0);
    expect(offer!.years).toBeGreaterThanOrEqual(1);
    expect(offer!.years).toBeLessThanOrEqual(3);
    expect(offer!.advice.length).toBeGreaterThan(5);
    expect(s.offers.length).toBeLessThanOrEqual(3);
  });

  it('never has more than three offers waiting or two in the same category', () => {
    const s = asCollege(toWeek(5, 3));
    const rng = new RNG(8);
    for (let i = 0; i < 400; i++) maybeOffer(s, rng);
    expect(s.offers.length).toBeLessThanOrEqual(3);
    const cats = s.offers.map((o) => o.category);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it('signs a deal, blocks a second in the same category, and lets you say no', () => {
    const s = asCollege(toWeek(5, 3));
    const rng = new RNG(5);
    for (let i = 0; i < 400 && s.offers.length < 2; i++) maybeOffer(s, rng);
    const [first, second] = s.offers;
    const fol = s.player.followers;
    const deal = acceptOffer(s, rng, first.id)!;
    expect(deal.brand).toBe(first.brand);
    expect(s.player.deals).toHaveLength(1);
    expect(s.player.followers).toBeGreaterThan(fol);
    expect(s.offers.find((o) => o.id === first.id)).toBeUndefined();
    declineOffer(s, second.id);
    expect(s.offers.find((o) => o.id === second.id)).toBeUndefined();
    expect(acceptOffer(s, rng, 'nope')).toBeNull();
  });

  it('lets offers lapse', () => {
    const s = asCollege(toWeek(5, 3));
    const rng = new RNG(5);
    for (let i = 0; i < 400 && !s.offers.length; i++) maybeOffer(s, rng);
    expect(s.offers.length).toBeGreaterThan(0);
    s.career.week += 10;
    expect(expireOffers(s)).toBeUndefined();
    expect(s.offers).toHaveLength(0);
  });

  it('pays out at the end of the season minus the adviser’s cut, and ends finished deals', () => {
    const s = toWeek(5, 3);
    s.player.deals = [
      { id: 'a', brand: 'Stride', category: 'shoes', perSeason: 100_000, yearsLeft: 2, energy: 1, sketchy: false, commission: 0.1, signedSeason: 1 },
      { id: 'b', brand: 'Hydra', category: 'drinks', perSeason: 50_000, yearsLeft: 1, energy: 0, sketchy: false, commission: 0, signedSeason: 1 },
    ];
    const money = s.player.money;
    const r = withRng(s, (rng) => settleDeals(s, rng));
    expect(r.income).toBe(90_000 + 50_000);
    expect(s.player.money).toBe(money + 140_000);
    expect(s.player.deals.map((d) => d.brand)).toEqual(['Stride']);
    expect(s.player.deals[0].yearsLeft).toBe(1);
  });

  it('shady deals pay more but sometimes blow up on you', () => {
    let blown = 0;
    for (let i = 0; i < 60; i++) {
      const s = toWeek(5, 3);
      s.player.followers = 10_000;
      s.player.reputation = 40;
      s.player.deals = [{ id: 'x', brand: 'Rocket Coin', category: 'crypto', perSeason: 200_000, yearsLeft: 3, energy: 0, sketchy: true, commission: 0, signedSeason: 1 }];
      const rng = new RNG(i + 1);
      const r = settleDeals(s, rng);
      expect(r.income).toBe(200_000);
      if (r.lines.some((l) => /blew up/.test(l))) {
        blown++;
        expect(s.player.followers).toBeLessThan(10_000);
        expect(s.player.reputation).toBe(36);
        expect(s.player.deals).toHaveLength(0);
      }
    }
    expect(blown).toBeGreaterThan(5);
    expect(blown).toBeLessThan(45);
  });

  it('values a pro more than a college player of the same fame', () => {
    const s = asCollege(toWeek(5, 3));
    const college = nameValue(s);
    s.career.level = 'pro';
    expect(nameValue(s)).toBeGreaterThan(college);
  });
});

describe('media: press', () => {
  const big: PressFacts = { line: { sec: 2000, pts: 33, fgm: 13, fga: 20, tpm: 4, orb: 1, drb: 5, ast: 6, stl: 1, blk: 0, tov: 2 }, gameScore: 27, won: true, playoff: false, teamScore: 80, oppScore: 70, oppId: '' };

  it('asks questions only about real events, and not too often', () => {
    const s = toWeek(5, 3);
    // an opponent with no rival on it, so the question is about the game itself
    const rivalTeams = new Set(Object.values(s.npcs).filter((n) => n.role === 'rival' && n.athleteId).map((n) => s.athletes[n.athleteId!]?.teamId));
    const opp = s.league.teamIds.find((t) => t !== s.career.teamId && !rivalTeams.has(t))!;
    const f = { ...big, oppId: opp };
    s.career.gamesSincePress = 0;
    expect(maybePress(s, new RNG(1), f)).toBeNull(); // too soon
    s.career.gamesSincePress = 5;
    let q = null;
    for (let i = 0; i < 40 && !q; i++) q = maybePress(s, new RNG(i + 1), f);
    expect(q).not.toBeNull();
    expect(q!.question).toMatch(/33/);
    // an ordinary game, a win with no story, gets no question
    expect(maybePress(s, new RNG(1), { ...f, gameScore: 8 })).toBeNull();
    // sitting on the bench gets none either
    expect(maybePress(s, new RNG(1), { ...f, line: null })).toBeNull();
  });

  it('answers: humble pleases the coach, bold is a gamble, and the question is cleared', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = toWeek(5, 3);
      s.career.press = { id: 'p', kind: 'big_game', question: 'q', context: 'c', rival: false };
      const rep = s.player.reputation;
      const r = answerPress(s, new RNG(seed), 'bold')!;
      expect(s.career.press).toBeNull();
      expect(s.career.gamesSincePress).toBe(0);
      outcomes.add(s.player.reputation > rep ? 'up' : 'down');
      expect(r.quote.length).toBeGreaterThan(5);
    }
    expect(outcomes.has('up')).toBe(true);
    expect(outcomes.has('down')).toBe(true);

    const s = toWeek(5, 3);
    s.career.press = { id: 'p', kind: 'tough_loss', question: 'q', context: 'c', rival: false };
    const coach = Object.values(s.npcs).find((n) => n.role === 'coach')!;
    const resp = coach.relationship.respect;
    answerPress(s, new RNG(1), 'humble');
    expect(coach.relationship.respect).toBeGreaterThan(resp);
    expect(answerPress(s, new RNG(1), 'humble')).toBeNull();
  });
});

describe('a whole career with all of it switched on', () => {
  it('stays consistent: no negative money, bounded feed and offers, deals never exceed one per category', () => {
    const s = createCareer({ firstName: 'Test', lastName: 'Player', hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: ['showman'], seed: 77 });
    let ticks = 0;
    while (s.career.phase !== 'retired' && ticks < 20000) {
      const c = s.career;
      if (c.phase === 'recruiting') {
        // the test only needs the career to keep moving
        break;
      }
      if (c.step === 'training') (c.phase === 'offseason' ? doSummerTraining(s, ['shooting']) : doTraining(s, s.player.energy < 40 ? 'rest' : s.player.academics < 2.6 ? 'study' : 'shooting'));
      else if (c.step === 'scene') completeScene(s);
      else if (c.step === 'game') {
        const g = createUserGameSim(s)!;
        g.sim.runToEnd();
        finishUserGame(s, g.sim, g.game);
      } else advanceWeek(s);
      expect(s.feed.length).toBeLessThanOrEqual(80);
      expect(s.offers.length).toBeLessThanOrEqual(3);
      expect(s.player.money).toBeGreaterThanOrEqual(0);
      const cats = s.player.deals.map((d) => d.category);
      expect(new Set(cats).size).toBe(cats.length);
      expect(s.player.energy).toBeGreaterThanOrEqual(0);
      expect(s.player.energy).toBeLessThanOrEqual(100);
      ticks++;
    }
    expect(s.feed.length).toBeGreaterThan(5);
  });
});
