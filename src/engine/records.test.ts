import { describe, expect, it } from 'vitest';
import { GameStateSchema, type GameState } from '../state/schemas';
import { createCareer } from './career';
import { startNextGeneration } from './legacy';
import { SIZE, backfillRecords, careerHighs, recordList, statsFor } from './records';
import { RNG } from './rng';
import { playUntil } from './testkit';

const career = (seed: number): GameState => createCareer({ firstName: 'Rec', lastName: 'Ord', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

function played(seed: number, until: (s: GameState) => boolean = (s) => s.career.phase === 'retired'): GameState {
  const s = career(seed);
  playUntil(s, new RNG(seed * 13 + 5), until, { moves: true });
  return s;
}

describe('record books', () => {
  it('fills up as games are played, best first, never past ten', () => {
    const s = played(3, (g) => g.career.season >= 2);
    const list = recordList(s, 'game', 'hs', 'pts');
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(SIZE);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].value).toBeGreaterThanOrEqual(list[i].value);
    expect(list.every((e) => e.name && e.team && e.opp)).toBe(true);
  });

  it('counts the whole league, not only you, and marks your own entries', () => {
    const s = played(4, (g) => g.career.season >= 3);
    const rows = statsFor('game').flatMap((d) => recordList(s, 'game', 'hs', d.key));
    expect(rows.some((r) => !r.user)).toBe(true);
    const me = `${s.athletes[s.player.athleteId].firstName} ${s.athletes[s.player.athleteId].lastName}`;
    expect(rows.filter((r) => r.user).every((r) => r.name === me)).toBe(true);
  });

  it('files a season when it ends, once, with per-game averages only for players with enough games', () => {
    const s = played(5, (g) => g.career.season >= 3);
    const tot = recordList(s, 'season', 'hs', 'pts');
    expect(tot.length).toBeGreaterThan(0);
    const keys = tot.map((e) => `${e.athleteId}:${e.season}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(recordList(s, 'season', 'hs', 'ppg').every((e) => e.gp >= 8)).toBe(true);
  });

  it('keeps the marks after a player retires, and across to the heir', () => {
    const s = played(6);
    const before = recordList(s, 'game', 'all', 'pts').map((e) => e.value);
    expect(before.length).toBeGreaterThan(0);
    startNextGeneration(s);
    expect(recordList(s, 'game', 'all', 'pts').map((e) => e.value).slice(0, before.length)).toEqual(expect.arrayContaining(before.slice(0, 1)));
    expect(recordList(s, 'game', 'all', 'pts')[0].value).toBeGreaterThanOrEqual(before[0]);
  });

  it('the "all leagues" list is the best ten across the three', () => {
    const s = played(7);
    const all = recordList(s, 'game', 'all', 'pts');
    expect(all.length).toBeLessThanOrEqual(SIZE);
    const best = Math.max(...(['hs', 'college', 'pro'] as const).flatMap((l) => recordList(s, 'game', l, 'pts').map((e) => e.value)));
    expect(all[0].value).toBe(best);
  });

  it('career highs match the game log, and a high that made the books says where', () => {
    const s = played(8, (g) => g.career.season >= 3);
    const { games, seasons } = careerHighs(s);
    const top = Math.max(...s.gameLog.map((g) => g.line.pts));
    expect(games.find((b) => b.label === 'Points')!.value).toBe(String(top));
    expect(seasons.length).toBeGreaterThan(0);
    for (const b of [...games, ...seasons]) if (b.rank !== null) expect(b.rank).toBeGreaterThanOrEqual(1);
  });

  it('an older save with no record books gets your own marks rebuilt from the game log', () => {
    const s = played(9, (g) => g.career.season >= 3);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.records;
    const old = GameStateSchema.parse(raw);
    expect(old.records).toEqual({});
    backfillRecords(old);
    const mine = recordList(old, 'game', 'all', 'pts');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.user)).toBe(true);
    expect(mine[0].value).toBe(Math.max(...s.gameLog.map((g) => g.line.pts)));
  });
});
