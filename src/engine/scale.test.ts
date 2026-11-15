import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_LISTED_OTHERS, fullContext } from '../narrative/context';
import type { Effect, GameState } from '../state/schemas';
import { advanceWeek, commitToCollege, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame, freeAgencyOffers, recruitingOffers, runDraft, signFreeAgent } from './career';
import { MAX_ACTIVE_CAST, byRelevance, relevance, trimCast } from './cast';
import { applyEffects, SCENE_CAPS } from './effects';
import { RNG } from './rng';

const ROLES = ['friend', 'media', 'scout', 'mentor', 'other', 'love_interest', 'agent'] as const;

/** The state the last stress career ended in, so the tests can look inside it. */
let lastState: GameState | null = null;

interface Report {
  seed: number;
  seasons: number;
  jsonKB: number;
  cloneMs: number;
  npcTotal: number;
  npcActive: number;
  contextChars: { early: number; late: number; max: number };
  parts: Record<string, number>;
}

/**
 * Plays a whole career while a very chatty narrator keeps introducing new people, adding memories, moments and
 * consequences. This is a stress test: real play will meet far fewer people than this.
 */
function stressCareer(seed: number): Report {
  const s: GameState = createCareer({ firstName: 'Scale', lastName: 'Test', hometown: 'X', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });
  const rng = new RNG(seed);
  let ticks = 0;
  let sceneCount = 0;
  const ctx = { early: 0, late: 0, max: 0 };
  const measure = () => {
    const n = fullContext(s, []).length;
    ctx.max = Math.max(ctx.max, n);
    return n;
  };
  while (s.career.phase !== 'retired' && ticks < 20000) {
    const c = s.career;
    if (c.phase === 'recruiting') commitToCollege(s, recruitingOffers(s)[0].name);
    else if (c.phase === 'draft') runDraft(s);
    else if (c.phase === 'free_agency') signFreeAgent(s, freeAgencyOffers(s)[0]);
    else if (c.step === 'training') {
      if (c.phase === 'offseason') doSummerTraining(s, ['shooting', 'defense']);
      else doTraining(s, s.player.energy < 40 ? 'rest' : s.player.academics < 2.7 && c.level !== 'pro' ? 'study' : rng.pick(['shooting', 'finishing', 'defense', 'study'] as const));
    } else if (c.step === 'scene') {
      // a scene resolves: the narrator adds effects, far more freely than it would in real play
      sceneCount++;
      const active = Object.values(s.npcs).filter((n) => n.active);
      const fx: Effect[] = [];
      if (rng.chance(0.4)) fx.push({ type: 'npc_new', name: `Person ${sceneCount}`, role: rng.pick(ROLES), title: `Someone you met in season ${s.career.season}`, personality: ['curious'] });
      if (active.length) fx.push({ type: 'memory', npc: rng.pick(active).id, text: `Remembers scene ${sceneCount} and what you said.`, important: rng.chance(0.2) });
      if (rng.chance(0.15)) fx.push({ type: 'moment', text: `A turning point in scene ${sceneCount}.` });
      if (rng.chance(0.1)) fx.push({ type: 'ripple', text: `A choice from scene ${sceneCount}.`, seasons: 2 });
      const r = new RNG(s.rngState);
      applyEffects(s, fx, 'scene:test', SCENE_CAPS, r);
      s.rngState = r.state;
      s.story.log.push({ season: s.career.season, week: s.career.week, phase: s.career.phase, kind: 'practice', title: `Scene ${sceneCount}`, summary: 'Something happened that was worth a sentence in the story log.' });
      if (s.story.log.length > 200) s.story.log.splice(0, s.story.log.length - 200);
      if (c.season === 3 && !ctx.early) ctx.early = measure();
      completeScene(s);
    } else if (c.step === 'game') {
      const g = createUserGameSim(s)!;
      g.sim.runToEnd();
      finishUserGame(s, g.sim, g.game);
    } else {
      if (c.level === 'college' && c.phase === 'offseason' && c.year >= 3) s.story.flags.declared_for_draft = true;
      if (c.level === 'pro' && c.phase === 'offseason' && s.athletes[s.player.athleteId].age >= 34) s.story.flags.retiring = true;
      advanceWeek(s);
    }
    if (ticks % 40 === 0) measure();
    ticks++;
  }
  ctx.late = measure();

  lastState = s;
  const json = JSON.stringify(s);
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) structuredClone(s);
  const cloneMs = (performance.now() - t0) / 10;
  const parts: Record<string, number> = {};
  for (const [k, v] of Object.entries(s)) parts[k] = Math.round(JSON.stringify(v).length / 1024);
  const all = Object.values(s.npcs);
  return { seed, seasons: s.career.season, jsonKB: Math.round(json.length / 1024), cloneMs: Math.round(cloneMs * 10) / 10, npcTotal: all.length, npcActive: all.filter((n) => n.active).length, contextChars: ctx, parts };
}

describe('scale over a long career', () => {
  let runs: { r: Report; s: GameState }[] = [];
  beforeAll(() => {
    runs = [3, 99].map((seed) => {
      const r = stressCareer(seed);
      return { r, s: lastState! };
    });
  }, 120_000);

  it('keeps the save small and quick to copy (measured about 300-370 KB and 3-4 ms after 21 seasons)', () => {
    for (const { r } of runs) {
      expect(r.seasons).toBeGreaterThan(15);
      expect(r.jsonKB).toBeLessThan(1500);
      expect(r.cloneMs).toBeLessThan(100);
    }
  });

  it('keeps the narrator’s prompt from growing without bound (measured about 3.7k to 5.3k characters)', () => {
    for (const { r } of runs) {
      expect(r.contextChars.max).toBeLessThan(9000);
      expect(r.contextChars.late).toBeLessThan(r.contextChars.early * 2.2);
    }
  });

  it('holds the active cast at its limit however many people the narrator introduces', () => {
    for (const { r, s } of runs) {
      expect(r.npcTotal).toBeGreaterThan(MAX_ACTIVE_CAST * 2); // the stress test really did introduce a crowd
      expect(r.npcActive).toBeLessThanOrEqual(MAX_ACTIVE_CAST + 2);
      // the people the game is built around are never the ones who fade out
      const coaches = Object.values(s.npcs).filter((n) => n.role === 'coach' && n.active);
      expect(coaches.length).toBeGreaterThan(0);
      expect(Object.values(s.npcs).some((n) => n.role === 'family' && n.active)).toBe(true);
    }
  });
});

describe('trimCast', () => {
  const base = () => createCareer({ firstName: 'Trim', lastName: 'Test', hometown: 'X', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 5 });
  const add = (s: GameState, i: number, role: (typeof ROLES)[number], extra: Partial<GameState['npcs'][string]> = {}) => {
    const id = `extra_${i}`;
    s.npcs[id] = { id, name: `Extra ${i}`, role, title: `Acquaintance ${i}`, personality: [], relationship: { affinity: 0, respect: 30, trust: 30, rivalry: 0, romance: 0 }, memories: [], keyMemories: [], estranged: false, h2h: { w: 0, l: 0 }, active: true, metSeason: 1, ...extra };
    return s.npcs[id];
  };

  it('does nothing while the cast is small', () => {
    const s = base();
    expect(trimCast(s)).toEqual([]);
  });

  it('lets the least relevant minor people go first, and keeps the ones who matter', () => {
    const s = base();
    s.career.season = 6;
    const close = add(s, 0, 'friend', { relationship: { affinity: 80, respect: 80, trust: 80, rivalry: 0, romance: 0 }, keyMemories: ['Stood by you.', 'Told you the truth.'], metSeason: 5 });
    const arc = add(s, 1, 'other');
    s.story.arcs.push({ id: 'a1', title: 'A thing', stakes: 'It matters', npcIds: [arc.id], openedSeason: 5, status: 'open' });
    const owed = add(s, 2, 'media');
    s.story.ripples.push({ id: 'r1', text: 'You owe a favor.', npcId: owed.id, openedSeason: 5, dueSeason: 8, status: 'pending' });
    for (let i = 3; i < 40; i++) add(s, i, 'other', { metSeason: 1 });
    const before = Object.values(s.npcs).filter((n) => n.active).length;
    const left = trimCast(s);
    expect(left.length).toBeGreaterThan(0);
    expect(Object.values(s.npcs).filter((n) => n.active).length).toBe(MAX_ACTIVE_CAST);
    expect(before - left.length).toBe(MAX_ACTIVE_CAST);
    for (const kept of [close, arc, owed]) expect(s.npcs[kept.id].active).toBe(true);
    for (const n of Object.values(s.npcs)) if (n.role === 'coach' || n.role === 'family') expect(n.active).toBe(true);
    // those who left are marked as past acquaintances, not deleted
    expect(left.every((n) => !n.active && /used to know/.test(n.title))).toBe(true);
    expect(Object.values(s.npcs).length).toBe(before + 0);
  });

  it('puts the most relevant people first for the prompt', () => {
    const s = base();
    const close = add(s, 0, 'friend', { relationship: { affinity: 90, respect: 70, trust: 80, rivalry: 0, romance: 0 }, keyMemories: ['A defining memory.'] });
    const stranger = add(s, 1, 'other');
    const order = byRelevance(s, [stranger, close]).map((n) => n.id);
    expect(order[0]).toBe(close.id);
    expect(relevance(s, close)).toBeGreaterThan(relevance(s, stranger));
  });

  it('caps how many minor characters one prompt lists, and says how many were left out', () => {
    const s = base();
    for (let i = 0; i < 20; i++) add(s, i, 'other');
    const text = fullContext(s, []);
    const listed = text.split('\n').filter((l) => l.startsWith('- id=')).length;
    expect(listed).toBeLessThanOrEqual(MAX_LISTED_OTHERS + 1);
    expect(text).toMatch(/more minor acquaintances are not listed/);
  });
});
