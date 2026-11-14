import { describe, expect, it } from 'vitest';
import type { GameState } from '../state/schemas';
import { BADGES, applyBadges, badgeStatus, checkBadgeUnlocks } from './badges';
import { advanceWeek, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame, setGamePlan, setPlayHurt, userAthlete, userRole } from './career';
import { coachOf, coachReacts, coachStanding } from './coach';
import { academicStatus, addRipple, activateDueRipples, canPlayHurt, dueRipples, resolveRipple, sitOutReason, updateEstrangement } from './consequences';
import { FILM_BONUS, FILM_ENERGY_COST, PLANS, scoutOpponent } from './gameplan';
import { NO_MODS } from './gameSim';
import { simOptions } from './league';
import { buildUserMods } from './userMods';

function toGameDay(seed = 31, week = 3): GameState {
  const s = createCareer({ firstName: 'Test', lastName: 'Player', hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: ['clutch'], seed });
  let ticks = 0;
  while (!(s.career.phase === 'regular' && s.career.week >= week && s.career.step === 'game') && ticks < 800) {
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
  return s;
}

const clone = (s: GameState) => JSON.parse(JSON.stringify(s)) as GameState;

describe('badges', () => {
  it('start locked with visible progress, and unlock when every requirement is met', () => {
    const s = toGameDay();
    const before = badgeStatus(s);
    expect(before.every((b) => !b.unlocked)).toBe(true);
    for (const b of before) {
      expect(b.progress).toBeGreaterThanOrEqual(0);
      expect(b.progress).toBeLessThanOrEqual(1);
      expect(b.reqs.length).toBeGreaterThan(0);
    }
    // make the player a lockdown defender with plenty of steals and blocks
    const me = userAthlete(s);
    me.ratings.defense = 80;
    me.ratings.athleticism = 80;
    s.gameLog[0].line.stl = 40;
    s.gameLog[0].line.blk = 20;
    const earned = checkBadgeUnlocks(s).map((b) => b.id);
    expect(earned).toContain('clamps');
    expect(earned).toContain('ballhawk');
    expect(earned).toContain('rim_protector');
    expect(s.player.badges).toEqual(expect.arrayContaining(earned));
    // already-earned badges are not awarded twice
    expect(checkBadgeUnlocks(s)).toEqual([]);
  });

  it('fold into the simulator modifiers, adding signature options only for the ones that have them', () => {
    const mods = { ...NO_MODS, shot: { ...NO_MODS.shot }, signatures: [] as typeof NO_MODS.signatures };
    applyBadges(['dime', 'sniper', 'closer', 'stepback', 'nonsense'], mods);
    expect(mods.pass).toBeCloseTo(0.08);
    expect(mods.shot.three).toBeCloseTo(0.04);
    expect(mods.clutch).toBeCloseTo(0.05);
    expect(mods.signatures.map((x) => x.id)).toEqual(['stepback']);
    for (const b of BADGES) expect(b.reqs({ r: { shooting: 0, finishing: 0, handles: 0, passing: 0, defense: 0, rebounding: 0, athleticism: 0, iq: 0, stamina: 0 }, tpm: 0, stl: 0, blk: 0, ast: 0, rimMade: 0, midMade: 0, clutchWins: 0 }).length).toBeGreaterThan(0);
  });

  it('give key moments an extra signature option that resolves like the shot it upgrades', () => {
    const s = toGameDay();
    s.player.badges = ['stepback', 'ballhawk'];
    const { sim } = createUserGameSim(s)!;
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const st = sim.advance();
      if (st.type === 'final') break;
      if (st.type !== 'moment') continue;
      const m = st.moment;
      const sig = m.options.find((o) => o.signature);
      if (sig) {
        seen.push(m.kind);
        expect(sig.id.startsWith('sig:')).toBe(true);
        expect(sig.odds).toBeGreaterThan(0);
        expect(sig.odds).toBeLessThan(1);
        const res = sim.resolveMoment(sig.id);
        expect(res.optionId).toBe(sig.id);
        expect(res.text.length).toBeGreaterThan(5);
      } else {
        sim.resolveMoment(m.options[0].id);
      }
    }
    // the step-back is offense, the ball hawk is defense
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('game plan and film study', () => {
  it('scouts the opponent and recommends a plan that exists', () => {
    const s = toGameDay();
    const next = s.league.schedule.find((g) => !g.played && (g.homeId === s.career.teamId || g.awayId === s.career.teamId))!;
    const oppId = next.homeId === s.career.teamId ? next.awayId : next.homeId;
    const scout = scoutOpponent(s, oppId);
    expect(scout.top).toHaveLength(5);
    expect(scout.top[0].ovr).toBeGreaterThanOrEqual(scout.top[4].ovr);
    expect(PLANS.map((p) => p.id)).toContain(scout.recommended);
    expect(scout.reasons.length).toBeGreaterThan(0);
    expect(scout.bestDefender!.defense).toBeGreaterThanOrEqual(scout.weakDefender!.defense);
  });

  it('recommends saving your legs when you are worn out', () => {
    const s = toGameDay();
    s.player.energy = 30;
    const next = s.league.schedule.find((g) => !g.played && (g.homeId === s.career.teamId || g.awayId === s.career.teamId))!;
    const oppId = next.homeId === s.career.teamId ? next.awayId : next.homeId;
    expect(scoutOpponent(s, oppId).recommended).toBe('conserve');
  });

  it('applies the chosen plan to the simulator, and film study costs energy that is refunded if you back out', () => {
    const s = toGameDay();
    expect(s.career.step).toBe('game');
    const e0 = s.player.energy;
    expect(setGamePlan(s, 'attack_rim', true)).toBe(true);
    expect(s.player.energy).toBe(e0 - FILM_ENERGY_COST);
    let mods = buildUserMods(s);
    expect(mods.shot.rim).toBeCloseTo(0.04);
    expect(mods.shot.three).toBeCloseTo(-0.03);
    expect(mods.all).toBeCloseTo(FILM_BONUS);
    expect(simOptions(s, true).userMods!.shot.rim).toBeCloseTo(0.04);
    // switching the plan keeps film, dropping film refunds
    expect(setGamePlan(s, 'perimeter', true)).toBe(true);
    expect(s.player.energy).toBe(e0 - FILM_ENERGY_COST);
    expect(setGamePlan(s, 'perimeter', false)).toBe(true);
    expect(s.player.energy).toBe(e0);
    mods = buildUserMods(s);
    expect(mods.all).toBe(0);
    expect(mods.shot.three).toBeCloseTo(0.04);
  });

  it('refuses film study when too tired, and refuses plans away from the pre-game step', () => {
    const s = toGameDay();
    s.player.energy = 8;
    expect(setGamePlan(s, 'balanced', true)).toBe(false);
    expect(s.career.plan).toBeNull();
    s.career.step = 'training';
    expect(setGamePlan(s, 'balanced', false)).toBe(false);
  });

  it('clears the plan after the game and reports the plan used', () => {
    const s = toGameDay();
    setGamePlan(s, 'lockdown', false);
    const g = createUserGameSim(s)!;
    g.sim.runToEnd();
    const report = finishUserGame(s, g.sim, g.game);
    expect(report.plan?.id).toBe('lockdown');
    expect(s.career.plan).toBeNull();
  });

  it('"Save your legs" really does cost less energy', () => {
    const run = (planId: 'balanced' | 'conserve') => {
      const s = toGameDay();
      s.player.energy = 90;
      setGamePlan(s, planId, false);
      const g = createUserGameSim(s)!;
      g.sim.runToEnd();
      const r = finishUserGame(s, g.sim, g.game);
      return { energy: s.player.energy, sec: r.line?.sec ?? 0 };
    };
    const a = run('balanced');
    const b = run('conserve');
    expect(a.sec).toBeGreaterThan(0);
    expect(b.energy).toBeGreaterThan(a.energy);
  });
});

describe('coach trust', () => {
  it('moves you up the depth chart and gives you more minutes when he trusts you', () => {
    const s = toGameDay();
    const coach = coachOf(s)!;
    coach.relationship.trust = 95;
    coach.relationship.respect = 90;
    const high = coachStanding(s);
    coach.relationship.trust = 5;
    coach.relationship.respect = 5;
    const low = coachStanding(s);
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.minutesBias).toBeGreaterThan(0);
    expect(low.minutesBias).toBeLessThan(0);
    expect(high.rank).toBeLessThanOrEqual(low.rank);
    expect(high.minutes).toBeGreaterThanOrEqual(low.minutes);
    expect(high.minutesBias).toBeLessThanOrEqual(0.25);
    expect(low.minutesBias).toBeGreaterThanOrEqual(-0.25);
  });

  it('shows up in the simulated game: same game, more trust, more minutes', () => {
    const minutes = (trust: number) => {
      const s = clone(toGameDay());
      const c = coachOf(s)!;
      c.relationship.trust = trust;
      c.relationship.respect = trust;
      const g = createUserGameSim(s)!;
      g.sim.runToEnd();
      return finishUserGame(s, g.sim, g.game).line?.sec ?? 0;
    };
    expect(minutes(95)).toBeGreaterThan(minutes(5));
  });

  it('reacts to a game: a big night builds trust, a bad one costs it, a benched night changes nothing', () => {
    const s = toGameDay();
    const coach = coachOf(s)!;
    const mk = (o: Partial<{ sec: number; pts: number; fgm: number; fga: number; tov: number; pf: number }>) => ({ athleteId: 'x', sec: 1800, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, ...o });
    const t0 = coach.relationship.trust;
    const good = coachReacts(s, { line: mk({ pts: 30, fgm: 12, fga: 18 }), won: true, playoff: false, playedHurt: false });
    expect(good.trust).toBeGreaterThan(0);
    expect(coach.relationship.trust).toBeGreaterThan(t0);
    const t1 = coach.relationship.trust;
    const bad = coachReacts(s, { line: mk({ pts: 2, fgm: 1, fga: 12, tov: 6 }), won: false, playoff: false, playedHurt: false });
    expect(bad.trust).toBeLessThan(0);
    expect(coach.relationship.trust).toBeLessThan(t1);
    const t2 = coach.relationship.trust;
    expect(coachReacts(s, { line: null, won: true, playoff: false, playedHurt: false })).toEqual({ trust: 0, respect: 0, notes: [] });
    expect(coach.relationship.trust).toBe(t2);
    const hurt = coachReacts(s, { line: mk({ pts: 10, fgm: 4, fga: 9 }), won: true, playoff: false, playedHurt: true });
    expect(hurt.notes).toContain('Played through an injury');
    expect(hurt.respect).toBeGreaterThanOrEqual(3);
  });

  it('keeps the role label the story sees in step with the simulation ranking', () => {
    const s = toGameDay();
    expect(userRole(s).rank).toBe(coachStanding(s).rank);
    expect(userRole(s).label).toBe(coachStanding(s).label);
  });
});

describe('consequences', () => {
  it('benches a player whose grades fall below the line, and not a pro', () => {
    const s = toGameDay();
    s.player.academics = 1.8;
    expect(academicStatus(s).eligible).toBe(false);
    expect(sitOutReason(s)).toMatch(/academically ineligible/);
    const g = createUserGameSim(s)!;
    g.sim.runToEnd();
    expect(finishUserGame(s, g.sim, g.game).line).toBeNull();
    s.career.level = 'pro';
    expect(academicStatus(s).eligible).toBe(true);
  });

  it('warns before it benches you', () => {
    const s = toGameDay();
    s.player.academics = 2.2;
    const a = academicStatus(s);
    expect(a.eligible).toBe(true);
    expect(a.warning).toBe(true);
  });

  it('lets you play through a minor injury at a cost, and not through a serious one', () => {
    const s = toGameDay();
    s.player.injury = { weeks: 2, desc: 'rolled ankle' };
    expect(canPlayHurt(s)).toBe(true);
    expect(sitOutReason(s)).toMatch(/rolled ankle/);
    const normal = simOptions(s, true).ratingMods![s.player.athleteId];
    expect(setPlayHurt(s, true)).toBe(true);
    expect(sitOutReason(s)).toBeNull();
    expect(simOptions(s, true).ratingMods![s.player.athleteId]).toBe(normal - 6);
    const g = createUserGameSim(s)!;
    g.sim.runToEnd();
    const r = finishUserGame(s, g.sim, g.game);
    expect(r.playedHurt).toBe(true);
    expect(r.line).not.toBeNull();
    expect(r.coach.notes).toContain('Played through an injury');
    expect(s.career.playHurt).toBe(false);

    const s2 = toGameDay();
    s2.player.injury = { weeks: 4, desc: 'high ankle sprain' };
    expect(canPlayHurt(s2)).toBe(false);
    expect(setPlayHurt(s2, true)).toBe(false);
  });

  it('sometimes makes it worse, and a long injury history makes you injury-prone', () => {
    let worse = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = toGameDay(40 + seed);
      s.player.injury = { weeks: 1, desc: 'bruised knee' };
      setPlayHurt(s, true);
      const g = createUserGameSim(s)!;
      g.sim.runToEnd();
      const r = finishUserGame(s, g.sim, g.game);
      if (r.aggravated) {
        worse++;
        expect(s.player.injury!.weeks).toBeGreaterThanOrEqual(3);
        expect(s.player.injuryHistory).toBeGreaterThanOrEqual(1);
      }
    }
    expect(worse).toBeGreaterThan(0);
    expect(worse).toBeLessThan(25);
  });

  it('makes close people stop speaking to you when it all falls apart, and lets them back when you repair it', () => {
    const s = toGameDay();
    const friend = Object.values(s.npcs).find((n) => n.role === 'friend')!;
    expect(friend.estranged).toBe(false);
    friend.relationship.trust = 10;
    friend.relationship.affinity = -40;
    const morale = s.player.morale;
    expect(updateEstrangement(s)).toEqual([`${friend.name} has stopped speaking to you.`]);
    expect(friend.estranged).toBe(true);
    expect(s.player.morale).toBeLessThan(morale);
    // no repeat announcement
    expect(updateEstrangement(s)).toEqual([]);
    friend.relationship.trust = 50;
    friend.relationship.affinity = 10;
    expect(updateEstrangement(s)).toEqual([`${friend.name} is talking to you again.`]);
    expect(friend.estranged).toBe(false);
  });

  it('remembers choices and brings them back later', () => {
    const s = toGameDay();
    expect(addRipple(s, { text: 'You lied to Coach about the missed practice.', seasons: 1 })).toBe(true);
    expect(addRipple(s, { text: 'You lied to Coach about the missed practice.', seasons: 1 })).toBe(false);
    expect(dueRipples(s)).toHaveLength(0);
    expect(activateDueRipples(s)).toBe(0);
    s.career.season += 1;
    expect(activateDueRipples(s)).toBe(1);
    const due = dueRipples(s);
    expect(due).toHaveLength(1);
    resolveRipple(s, due[0].id);
    expect(dueRipples(s)).toHaveLength(0);
    // a cap on how many can be waiting at once
    for (let i = 0; i < 10; i++) addRipple(s, { text: `Promise number ${i}`, seasons: 3 });
    expect(s.story.ripples.filter((r) => r.status === 'pending').length).toBe(5);
  });
});
