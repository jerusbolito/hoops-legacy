import { describe, expect, it } from 'vitest';
import { GameStateSchema, type GameState } from '../state/schemas';
import { createCareer } from './career';
import { RNG } from './rng';
import { tick } from './testkit';

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
  expect(Number.isFinite(p.money)).toBe(true);
  expect(p.finance.taxes).toBeGreaterThanOrEqual(0);
  expect(new Set(p.services.map((x) => x.id)).size).toBe(p.services.length);
  // every roster is made of real players who know which team they are on
  for (const t of Object.values(s.teams)) {
    if (!s.league.teamIds.includes(t.id)) continue;
    for (const id of t.rosterIds) {
      expect(s.athletes[id], `${t.name} lists a missing athlete`).toBeDefined();
      expect(s.athletes[id].teamId).toBe(t.id);
    }
  }
  expect(s.athletes[p.athleteId].teamId).toBe(s.career.teamId);
  expect(s.teams[s.career.teamId].rosterIds).toContain(p.athleteId);
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
        tick(s, rng, { moves: true });
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
    for (const k of ['badges', 'deals', 'injuryHistory', 'clutchWins', 'draftBoost', 'eventsDone', 'services', 'finance']) delete raw.player[k];
    for (const k of ['plan', 'playHurt', 'press', 'gamesSincePress', 'lifeEvent', 'recentLife', 'weeksSinceLife', 'moveSeason', 'pendingMove']) delete raw.career[k];
    for (const k of ['careerSummary', 'defining', 'threads', 'ripples']) delete raw.story[k];
    delete raw.feed;
    delete raw.recruiting;
    delete raw.transactions;
    delete raw.weekLog;
    delete raw.paper;
    for (const st of Object.values(raw.leagueStats) as Record<string, unknown>[]) for (const k of ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'tov', 'pf']) delete st[k];
    delete raw.offers;
    for (const n of Object.values(raw.npcs) as Record<string, unknown>[]) {
      delete n.keyMemories;
      delete n.estranged;
      delete n.h2h;
    }
    for (const e of raw.gameLog) delete e.shots;
    const loaded = GameStateSchema.parse(raw);
    expect(loaded.player.badges).toEqual([]);
    expect(loaded.career.plan).toBeNull();
    expect(loaded.career.playHurt).toBe(false);
    expect(loaded.story.ripples).toEqual([]);
    expect(loaded.feed).toEqual([]);
    expect(loaded.player.services).toEqual([]);
    expect(loaded.recruiting.targets).toEqual([]);
    expect(loaded.transactions).toEqual([]);
    expect(loaded.paper).toEqual([]);
    expect(loaded.weekLog.lines).toEqual([]);
    for (const st of Object.values(loaded.leagueStats)) expect(st.fga).toBe(0);
    expect(loaded.player.finance.earned).toBe(0);
    expect(loaded.career.lifeEvent).toBeNull();
    expect(loaded.career.pendingMove).toBeNull();
    expect(Object.values(loaded.npcs).every((n) => n.estranged === false)).toBe(true);
    // and it still plays
    const rng = new RNG(5);
    for (let i = 0; i < 60; i++) tick(loaded, rng);
    expect(loaded.gameLog.length).toBeGreaterThan(0);
  });
});
