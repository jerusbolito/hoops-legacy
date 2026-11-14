import { describe, expect, it } from 'vitest';
import { GameStateSchema, type GameState } from '../state/schemas';
import { fullContext } from '../narrative/context';
import { pickScene } from '../narrative/scenes';
import { advanceWeek, commitToCollege, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame, freeAgencyOffers, recruitingOffers, runDraft, setGamePlan, signFreeAgent, userAthlete, withRng } from './career';
import { applyCombine, availableEvents, playRound, runCombine, startContest, applyContestResult } from './events';
import { acceptOffer, answerPress } from './media';
import { PLANS } from './gameplan';
import { RNG } from './rng';

/** Plays one step with deliberately varied choices so every system gets exercised. */
function tick(s: GameState, rng: RNG) {
  const c = s.career;
  switch (c.phase) {
    case 'recruiting':
      commitToCollege(s, recruitingOffers(s)[0].name);
      return;
    case 'draft': {
      // use the combine when offered
      if (availableEvents(s).some((e) => e.id === 'combine')) applyCombine(s, runCombine(s, rng.chance(0.5) ? 'push' : 'steady'));
      runDraft(s);
      return;
    }
    case 'free_agency':
      signFreeAgent(s, freeAgencyOffers(s)[0]);
      return;
    case 'retired':
      return;
  }
  if (c.step === 'training') {
    if (c.phase === 'offseason') doSummerTraining(s, ['shooting', 'defense']);
    else doTraining(s, s.player.energy < 40 ? 'rest' : s.player.academics < 2.6 && c.level !== 'pro' ? 'study' : rng.pick(['shooting', 'finishing', 'defense', 'passing', 'study']));
    return;
  }
  if (c.step === 'scene') {
    // the scene picker must always produce something playable
    const plan = withRng(s, (r) => pickScene(s, r));
    expect(plan.kind.length).toBeGreaterThan(0);
    expect(plan.brief.length).toBeGreaterThan(5);
    expect(fullContext(s, plan.castIds).length).toBeGreaterThan(100);
    completeScene(s);
    return;
  }
  if (c.step === 'game') {
    // random plans, sometimes film, sometimes play hurt, sometimes enter an offer or a contest
    setGamePlan(s, rng.pick(PLANS).id, rng.chance(0.4));
    const g = createUserGameSim(s)!;
    for (let i = 0; i < 60; i++) {
      const st = g.sim.advance();
      if (st.type === 'final') break;
      if (st.type === 'moment') g.sim.resolveMoment(rng.pick(st.moment.options).id);
    }
    finishUserGame(s, g.sim, g.game);
    if (s.career.press) withRng(s, (r) => answerPress(s, r, rng.pick(['humble', 'bold', 'deflect'] as const)));
    return;
  }
  // wrap-up: sign offers, enter contests
  for (const o of [...s.offers]) if (rng.chance(0.5)) withRng(s, (r) => acceptOffer(s, r, o.id));
  for (const e of availableEvents(s)) {
    if (e.id === 'combine') continue;
    let ct = startContest(s, e.id);
    while (!ct.finished) ct = playRound(ct, 56, rng.pick(['safe', 'balanced', 'risky'] as const));
    applyContestResult(s, ct);
  }
  if (c.level === 'college' && c.phase === 'offseason' && c.year >= 3) s.story.flags.declared_for_draft = true;
  if (c.level === 'pro' && c.phase === 'offseason' && userAthlete(s).age >= 34) s.story.flags.retiring = true;
  advanceWeek(s);
}

function invariants(s: GameState) {
  const p = s.player;
  expect(p.energy).toBeGreaterThanOrEqual(0);
  expect(p.energy).toBeLessThanOrEqual(100);
  expect(p.morale).toBeGreaterThanOrEqual(0);
  expect(p.morale).toBeLessThanOrEqual(100);
  expect(p.reputation).toBeGreaterThanOrEqual(0);
  expect(p.reputation).toBeLessThanOrEqual(100);
  expect(p.academics).toBeGreaterThanOrEqual(0);
  expect(p.academics).toBeLessThanOrEqual(4);
  expect(p.money).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(p.followers)).toBe(true);
  expect(s.feed.length).toBeLessThanOrEqual(80);
  expect(s.offers.length).toBeLessThanOrEqual(3);
  expect(new Set(p.badges).size).toBe(p.badges.length);
  const cats = p.deals.map((d) => d.category);
  expect(new Set(cats).size).toBe(cats.length);
  for (const n of Object.values(s.npcs)) {
    for (const v of Object.values(n.relationship)) expect(Number.isFinite(v)).toBe(true);
    expect(n.relationship.trust).toBeGreaterThanOrEqual(0);
    expect(n.relationship.trust).toBeLessThanOrEqual(100);
    // someone who left the story is never also marked estranged-and-active nonsense
    if (!n.active) expect(n.athleteId === undefined || !!s.athletes[n.athleteId]).toBe(true);
  }
  expect(s.story.ripples.filter((r) => r.status !== 'resolved').length).toBeLessThanOrEqual(5);
}

describe('smoke: whole careers with every system in play', () => {
  for (const seed of [3, 12, 99, 2024]) {
    it(`seed ${seed} runs from freshman to retirement without breaking`, () => {
      const s = createCareer({ firstName: 'Smoke', lastName: `Test${seed}`, hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: ['showman'], seed });
      const rng = new RNG(seed * 31 + 7);
      let ticks = 0;
      while (s.career.phase !== 'retired' && ticks < 20000) {
        tick(s, rng);
        if (ticks % 7 === 0) invariants(s);
        ticks++;
      }
      invariants(s);
      expect(s.career.phase).toBe('retired');
      // and the save is still valid after all of that
      expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(s)))).not.toThrow();
    });
  }
});

describe('older saves', () => {
  it('load with sensible defaults for everything added since', () => {
    const s = createCareer({ firstName: 'Old', lastName: 'Save', hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 1 });
    const raw = JSON.parse(JSON.stringify(s));
    for (const k of ['badges', 'deals', 'injuryHistory', 'clutchWins', 'draftBoost', 'eventsDone']) delete raw.player[k];
    for (const k of ['plan', 'playHurt', 'press', 'gamesSincePress']) delete raw.career[k];
    for (const k of ['careerSummary', 'defining', 'threads', 'ripples']) delete raw.story[k];
    delete raw.feed;
    delete raw.offers;
    for (const n of Object.values(raw.npcs) as Record<string, unknown>[]) {
      delete n.keyMemories;
      delete n.estranged;
    }
    for (const e of raw.gameLog) delete e.shots;
    const loaded = GameStateSchema.parse(raw);
    expect(loaded.player.badges).toEqual([]);
    expect(loaded.career.plan).toBeNull();
    expect(loaded.career.playHurt).toBe(false);
    expect(loaded.story.ripples).toEqual([]);
    expect(loaded.feed).toEqual([]);
    expect(Object.values(loaded.npcs).every((n) => n.estranged === false)).toBe(true);
    // and it still plays
    const rng = new RNG(5);
    for (let i = 0; i < 60; i++) tick(loaded, rng);
    expect(loaded.gameLog.length).toBeGreaterThan(0);
  });
});
