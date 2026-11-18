import { describe, expect, it } from 'vitest';
import { GameStateSchema, type GameState } from '../state/schemas';
import { createCareer } from './career';
import { scoredPlayers } from './awards';
import { backfillHonors, honorRoll, kindLabel, mostDecorated } from './honors';
import { startNextGeneration } from './legacy';
import { RNG } from './rng';
import { playUntil } from './testkit';

const career = (seed: number): GameState => createCareer({ firstName: 'Hon', lastName: 'Or', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });
const played = (seed: number, until: (s: GameState) => boolean = (s) => s.career.phase === 'retired') => {
  const s = career(seed);
  playUntil(s, new RNG(seed * 7 + 1), until, { moves: true });
  return s;
};

describe('honor roll', () => {
  it('a finished season records the champion, MVP, both All-League teams, a defensive player and the All-Stars', () => {
    const s = played(3, (g) => g.career.season >= 2);
    const first = honorRoll(s, 'all').find((b) => b.season === 1)!;
    expect(first).toBeTruthy();
    expect(first.level).toBe('hs');
    expect(first.byKind.champion).toHaveLength(1);
    expect(first.byKind.mvp).toHaveLength(1);
    expect(first.byKind.first).toHaveLength(5);
    expect(first.byKind.second).toHaveLength(5);
    expect(first.byKind.dpoy).toHaveLength(1);
    expect(first.byKind.allstar!.length).toBeGreaterThanOrEqual(8);
    expect(first.byKind.allstar!.length).toBeLessThanOrEqual(10);
  });

  it('names are real people, nobody is on both All-League teams, and nothing repeats', () => {
    const s = played(4, (g) => g.career.season >= 3);
    for (const b of honorRoll(s, 'all')) {
      const first = new Set(b.byKind.first?.map((h) => h.athleteId));
      for (const h of b.byKind.second ?? []) expect(first.has(h.athleteId)).toBe(false);
      for (const list of Object.values(b.byKind)) {
        const keys = list!.map((h) => `${h.kind}:${h.athleteId}:${h.name}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(list!.every((h) => h.name.length > 2)).toBe(true);
      }
    }
  });

  it('your own honors are marked, and match the awards on your player', () => {
    const s = played(5, (g) => g.career.season >= 4);
    const mine = s.honors.filter((h) => h.user && h.kind !== 'champion');
    for (const h of mine) expect(h.athleteId).toBe(s.player.athleteId);
    const mvps = s.player.awards.filter((a) => /MVP$/.test(a.name)).length;
    expect(s.honors.filter((h) => h.user && h.kind === 'mvp').length).toBe(mvps);
  });

  it('keeps every league you pass through, and carries on into the next generation', () => {
    const s = played(6);
    const levels = new Set(s.honors.map((h) => h.level));
    expect(levels.size).toBeGreaterThanOrEqual(2);
    const before = s.honors.length;
    expect(before).toBeGreaterThan(0);
    startNextGeneration(s);
    expect(s.honors.length).toBe(before);
    expect(honorRoll(s, 'pro').every((b) => b.level === 'pro')).toBe(true);
  });

  it('labels follow the league: conference in school, league as a pro', () => {
    expect(kindLabel('mvp', 'hs')).toBe('Conference MVP');
    expect(kindLabel('first', 'pro')).toBe('All-League First Team');
  });

  it('the most decorated list is sorted and counts honors', () => {
    const s = played(7, (g) => g.career.season >= 4);
    const top = mostDecorated(s, 5);
    expect(top.length).toBeGreaterThan(0);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].score).toBeGreaterThanOrEqual(top[i].score);
    expect(top[0].total).toBe(s.honors.filter((h) => h.athleteId === top[0].athleteId).length);
  });

  it('an older save with no honor roll gets your awards and the current All-Stars put on it', () => {
    const s = played(8, (g) => g.career.season >= 3);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.honors;
    const old = GameStateSchema.parse(raw);
    expect(old.honors).toEqual([]);
    backfillHonors(old);
    const awards = old.player.awards.filter((a) => /MVP$|First Team$|Second Team$|Defensive Player of the Year$|Champion$|^All-Star$/.test(a.name));
    expect(old.honors.filter((h) => h.user).length).toBeGreaterThanOrEqual(awards.length);
    backfillHonors(old); // does nothing the second time
    const n = old.honors.length;
    backfillHonors(old);
    expect(old.honors.length).toBe(n);
  });

  it('backfilled championships name your team, not the league', () => {
    for (const seed of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      const s = played(seed, (g) => g.career.season >= 5);
      if (!s.player.awards.some((a) => /Champion$/.test(a.name))) continue;
      const raw = JSON.parse(JSON.stringify(s));
      delete raw.honors;
      const old = GameStateSchema.parse(raw);
      backfillHonors(old, []);
      const champs = old.honors.filter((h) => h.kind === 'champion' && h.user);
      expect(champs.length).toBeGreaterThan(0);
      const teamNames = new Set(Object.values(old.teams).map((t) => t.name));
      for (const h of champs) expect(teamNames.has(h.name)).toBe(true);
      return;
    }
    throw new Error('no seed produced a title to check');
  });

  it('a save loaded right after a season ends gets that whole season, not just your awards', () => {
    const s = played(3, (g) => g.career.phase === 'offseason');
    expect(s.league.champion).toBeTruthy();
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.honors;
    const old = GameStateSchema.parse(raw);
    backfillHonors(old, scoredPlayers(old));
    const b = honorRoll(old, 'all').find((x) => x.season === old.career.season)!;
    expect(b.byKind.champion).toHaveLength(1);
    expect(b.byKind.mvp).toHaveLength(1);
    expect(b.byKind.first).toHaveLength(5);
    expect(b.byKind.second).toHaveLength(5);
    // identical to what a save that had been running all along would have recorded
    const norm = (hs: typeof s.honors) => hs.map((h) => `${h.season}:${h.kind}:${h.athleteId}:${h.name}`).sort();
    expect(norm(old.honors.filter((h) => h.kind !== 'allstar'))).toEqual(norm(s.honors.filter((h) => h.kind !== 'allstar')));
  });
});
