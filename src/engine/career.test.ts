import { describe, expect, it } from 'vitest';
import { GameStateSchema, type GameState } from '../state/schemas';
import {
  advanceWeek,
  commitToCollege,
  completeScene,
  createCareer,
  createUserGameSim,
  doSummerTraining,
  doTraining,
  finishUserGame,
  freeAgencyOffers,
  recruitingOffers,
  runDraft,
  signFreeAgent,
  userAthlete,
} from './career';
import { applyEffects } from './effects';
import { overall } from './ratings';
import { RNG } from './rng';
import { seasonAverages } from './stats';

function newGame(seed = 123): GameState {
  return createCareer({
    firstName: 'Test',
    lastName: 'Player',
    hometown: 'Oakland, CA',
    archetype: 'slasher',
    position: 'SG',
    heightIn: 76,
    schoolIndex: 0,
    traits: ['clutch'],
    seed,
  });
}

/** Plays one "tick" of the calendar with simple default choices. */
function tick(state: GameState) {
  const c = state.career;
  switch (c.phase) {
    case 'recruiting': {
      const offers = recruitingOffers(state);
      commitToCollege(state, offers[0].name);
      return;
    }
    case 'draft':
      runDraft(state);
      return;
    case 'free_agency': {
      const offers = freeAgencyOffers(state);
      signFreeAgent(state, offers[0]);
      return;
    }
    case 'retired':
      return;
  }
  if (c.step === 'training') {
    if (c.phase === 'offseason') doSummerTraining(state, ['shooting', 'finishing']);
    else doTraining(state, state.player.energy < 40 ? 'rest' : 'shooting');
    return;
  }
  if (c.step === 'scene') {
    completeScene(state);
    return;
  }
  if (c.step === 'game') {
    const g = createUserGameSim(state)!;
    g.sim.runToEnd();
    finishUserGame(state, g.sim, g.game);
    return;
  }
  if (c.step === 'done') {
    if (c.level === 'college' && c.phase === 'offseason' && c.year >= 3) state.story.flags.declared_for_draft = true;
    if (c.level === 'pro' && c.phase === 'offseason' && userAthlete(state).age >= 34) state.story.flags.retiring = true;
    advanceWeek(state);
  }
}

describe('career', () => {
  it('creates a valid save', () => {
    const s = newGame();
    expect(() => GameStateSchema.parse(s)).not.toThrow();
    expect(Object.values(s.npcs).length).toBeGreaterThanOrEqual(5);
    expect(s.teams[s.career.teamId].rosterIds).toContain(s.player.athleteId);
  });

  it('plays an entire HS → college → pro career without getting stuck', () => {
    const s = newGame(99);
    const seen = new Set<string>();
    let ticks = 0;
    while (s.career.phase !== 'retired' && ticks < 20000) {
      tick(s);
      seen.add(`${s.career.level}:${s.career.phase}`);
      ticks++;
    }
    expect(s.career.phase).toBe('retired');
    for (const k of ['hs:regular', 'hs:offseason', 'college:regular', 'pro:regular']) expect(seen).toContain(k);
    expect([...seen].some((k) => k.endsWith(':playoffs'))).toBe(true);
    expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(s)))).not.toThrow();

    // user progressed
    expect(s.gameLog.length).toBeGreaterThan(60);
    const levels = new Set(s.gameLog.map((g) => g.level));
    expect(levels).toEqual(new Set(['hs', 'college', 'pro']));

    // stats in the game log match league table results
    for (const e of s.gameLog) {
      const l = e.line;
      expect(l.pts).toBe(2 * (l.fgm - l.tpm) + 3 * l.tpm + l.ftm);
    }
  });

  it('the user develops from a HS freshman into a pro-level player', () => {
    const s = newGame(5);
    const start = overall(userAthlete(s).ratings);
    let ticks = 0;
    while (!(s.career.level === 'pro' && s.career.year >= 2) && ticks < 20000) {
      tick(s);
      ticks++;
    }
    const now = overall(userAthlete(s).ratings);
    expect(now).toBeGreaterThan(start + 15);
  });

  it('records each user game in the log exactly once and standings add up', () => {
    const s = newGame(7);
    while (s.career.phase !== 'offseason') tick(s);
    const season = seasonAverages(s.gameLog, 1);
    expect(season.gp).toBeGreaterThan(0);
    const ids = s.gameLog.map((g) => g.gameId);
    expect(new Set(ids).size).toBe(ids.length);
    const totalW = Object.values(s.league.standings).reduce((a, b) => a + b.w, 0);
    const totalL = Object.values(s.league.standings).reduce((a, b) => a + b.l, 0);
    expect(totalW).toBe(totalL);
    expect(totalW).toBe(s.league.schedule.filter((g) => !g.playoffRound).length);
    expect(s.league.champion).not.toBeNull();
  });
});

describe('applyEffects', () => {
  it('clamps LLM-proposed effects', () => {
    const s = newGame();
    const npc = Object.values(s.npcs).find((n) => n.role === 'rival')!;
    const before = { ...npc.relationship };
    const ratingBefore = { ...userAthlete(s).ratings };
    const res = applyEffects(
      s,
      [
        { type: 'rel', npc: npc.id, field: 'rivalry', delta: 80 },
        { type: 'rel', npc: npc.name, field: 'rivalry', delta: 80 },
        { type: 'rating', key: 'shooting', delta: 20 },
        { type: 'rating', key: 'finishing', delta: 5 },
        { type: 'morale', delta: 500 },
        { type: 'rel', npc: 'Nobody Real', field: 'affinity', delta: 5 },
        { type: 'npc_new', name: 'Fake Teammate', role: 'teammate', title: 'x', personality: [] },
        { type: 'money', delta: 1_000_000 },
      ],
      'test',
      undefined,
      new RNG(1),
    );
    expect(npc.relationship.rivalry - before.rivalry).toBeLessThanOrEqual(15);
    expect(userAthlete(s).ratings.shooting - ratingBefore.shooting).toBe(1);
    expect(userAthlete(s).ratings.finishing).toBe(ratingBefore.finishing);
    expect(s.player.morale).toBeLessThanOrEqual(80);
    expect(s.player.money).toBeLessThanOrEqual(500);
    expect(res.rejected.some((r) => r.includes('Nobody Real'))).toBe(true);
    expect(res.rejected.some((r) => r.includes('engine-only'))).toBe(true);
  });
});
