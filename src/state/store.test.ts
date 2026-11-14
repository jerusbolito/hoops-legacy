import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { advanceWeek, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame, recruitingOffers } from '../engine/career';
import type { GameState } from './schemas';
import { useStore } from './store';

const fresh = (seed: number) => createCareer({ firstName: 'Test', lastName: 'Player', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

/** Plays the calendar with default choices until `stop` says to halt. Never calls the store. */
function playUntil(s: GameState, stop: (s: GameState) => boolean) {
  for (let i = 0; i < 20000; i++) {
    if (stop(s)) return;
    const c = s.career;
    if (c.phase === 'recruiting' || c.phase === 'draft' || c.phase === 'free_agency') throw new Error(`unexpected phase ${c.phase}`);
    if (c.step === 'training') {
      if (c.phase === 'offseason') doSummerTraining(s, ['shooting', 'finishing']);
      else doTraining(s, 'shooting');
    } else if (c.step === 'scene') completeScene(s);
    else if (c.step === 'game') {
      const g = createUserGameSim(s)!;
      g.sim.runToEnd();
      finishUserGame(s, g.sim, g.game);
    } else {
      if (c.level === 'college' && c.phase === 'offseason' && c.year >= 3) s.story.flags.declared_for_draft = true;
      advanceWeek(s);
    }
  }
  throw new Error('never reached stop condition');
}

/** True when the *next* advanceWeek would end the season. */
const seasonEndsNext = (s: GameState) => s.career.step === 'done' && advanceWeek(structuredClone(s)).seasonEnded;

describe('reveal queue', () => {
  it('queues a season card (and champion/award cards when earned) at season end', async () => {
    const s = fresh(21);
    playUntil(s, seasonEndsNext);
    useStore.setState({ game: s, screen: 'game', reveals: [], client: null });
    await useStore.getState().advance();
    const { reveals, game } = useStore.getState();
    const season = reveals.find((r) => r.kind === 'season');
    expect(season).toBeDefined();
    if (season?.kind === 'season') {
      expect(season.review.season).toBe(1);
      expect(season.review.w + season.review.l).toBeGreaterThan(0);
      expect(season.summary.length).toBeGreaterThan(5);
    }
    // the season card always comes after any champion/award cards
    const idx = reveals.findIndex((r) => r.kind === 'season');
    expect(reveals.slice(idx + 1).every((r) => r.kind === 'season')).toBe(true);
    // ids are unique and dismissing moves through the queue in order
    expect(new Set(reveals.map((r) => r.id)).size).toBe(reveals.length);
    const n = reveals.length;
    useStore.getState().dismissReveal();
    expect(useStore.getState().reveals.length).toBe(n - 1);
    // champion reveal only if the user's team really won
    expect(reveals.some((r) => r.kind === 'champion')).toBe(game!.league.champion === game!.career.teamId);
  });

  it('queues a commitment card and a draft card through the real store actions', async () => {
    const s = fresh(8);
    // HS: four full seasons until recruiting begins
    const phase = (x: GameState): string => x.career.phase; // widen: TS narrows inside the loop
    for (let guard = 0; guard < 50 && phase(s) !== 'recruiting'; guard++) {
      playUntil(s, (x) => x.career.phase === 'recruiting' || (x.career.phase === 'offseason' && x.career.step === 'done' && x.career.year === 4));
      if (phase(s) !== 'recruiting') advanceWeek(s);
    }
    expect(s.career.phase).toBe('recruiting');
    useStore.setState({ game: s, screen: 'game', reveals: [], client: null, offers: {} });
    const offer = recruitingOffers(structuredClone(s))[0];
    await useStore.getState().commit(offer.name);
    let r = useStore.getState().reveals;
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('commit');
    if (r[0].kind === 'commit') {
      expect(r[0].college).toBe(offer.name);
      expect(r[0].stars).toBeGreaterThanOrEqual(1);
      expect(r[0].stars).toBeLessThanOrEqual(5);
    }

    // college: play until the draft
    useStore.setState({ reveals: [] });
    const c = useStore.getState().game!;
    for (let guard = 0; guard < 80 && phase(c) !== 'draft'; guard++) {
      playUntil(c, (x) => x.career.phase === 'draft' || (x.career.phase === 'offseason' && x.career.step === 'done'));
      if (phase(c) !== 'draft') advanceWeek(c);
    }
    expect(c.career.phase).toBe('draft');
    useStore.setState({ game: c });
    await useStore.getState().enterDraft();
    r = useStore.getState().reveals;
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('draft');
    if (r[0].kind === 'draft') {
      expect(r[0].college).toBe(offer.name);
      expect(r[0].pick === null || (r[0].pick >= 1 && r[0].pick <= 30)).toBe(true);
      expect(r[0].salary).toBeGreaterThan(0);
    }
  });
});
