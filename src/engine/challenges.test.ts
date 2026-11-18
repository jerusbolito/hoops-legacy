import { describe, expect, it } from 'vitest';
import { LegendSchema } from '../state/schemas';
import { createCareer } from './career';
import { allChallenges, challengeInput, challengeOf, challengeScore, isoWeek, personalBests, weeklyChallenge } from './challenges';
import { difficultyOf } from './difficulty';
import { legendOf } from './legacyScore';

const name = { firstName: 'Ch', lastName: 'Allenge' };

describe('challenges', () => {
  it('ISO weeks follow the calendar, including the year boundary', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toBe('2026-01');
    expect(isoWeek(new Date(2026, 11, 31))).toBe('2026-53');
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-53');
    expect(isoWeek(new Date(2026, 10, 18))).toBe('2026-47');
  });

  it('the weekly challenge is the same all week and changes the next', () => {
    const mon = weeklyChallenge(new Date(2026, 10, 16));
    const sun = weeklyChallenge(new Date(2026, 10, 22));
    const next = weeklyChallenge(new Date(2026, 10, 23));
    expect(sun).toEqual(mon);
    expect(next.id).not.toBe(mon.id);
    expect(next.seed).not.toBe(mon.seed);
  });

  it('many weeks stay within what the game can create', () => {
    for (let w = 0; w < 120; w++) {
      const c = weeklyChallenge(new Date(2026, 0, 1 + w * 7));
      expect(c.heightIn).toBeGreaterThanOrEqual(70);
      expect(c.heightIn).toBeLessThanOrEqual(83);
      expect(c.blurb).not.toMatch(/undefined|NaN/);
      const s = createCareer(challengeInput(c, name));
      expect(challengeOf(s)).toBe(c.id);
    }
  });

  it('two players taking the same challenge face the same league and the same start', () => {
    const c = weeklyChallenge(new Date(2026, 10, 18));
    const a = createCareer(challengeInput(c, name));
    const b = createCareer(challengeInput(c, name));
    const strip = (s: object) => JSON.stringify({ ...s, id: 0, createdAt: 0, updatedAt: 0 }).replace(/(ath|team|save|npc)_[a-z0-9]+/g, '$1_');
    expect(strip(b)).toBe(strip(a));
    expect(difficultyOf(a).id).toBe(c.difficulty);
  });

  it('different challenges are different careers', () => {
    const [w, c1, c2] = allChallenges(new Date(2026, 10, 18));
    const ids = [w, c1, c2].map((c) => createCareer(challengeInput(c, name)).athletes);
    expect(new Set(ids.map((a) => JSON.stringify(Object.values(a).map((x) => x.firstName).sort()))).size).toBe(3);
  });

  it('the finished career carries the challenge, but an heir does not', () => {
    const s = createCareer(challengeInput(allChallenges()[1], name));
    expect(legendOf(s).challenge).toBe('classic-underdog');
    s.legacy.generation = 2;
    expect(legendOf(s).challenge).toBe('');
  });

  it('keeps your best run per challenge', () => {
    const L = (id: string, score: number) => LegendSchema.parse({ id: `${id}${score}`, saveId: 's', name: 'A', firstName: 'A', lastName: 'B', challenge: id, score });
    const best = personalBests([L('x', 40), L('x', 90), L('y', 10), LegendSchema.parse({ id: 'z', saveId: 's', name: 'A', firstName: 'A', lastName: 'B', score: 500 })]);
    expect(best.x.score).toBe(90);
    expect(best.y.score).toBe(10);
    expect(Object.keys(best)).toEqual(['x', 'y']);
    expect(challengeScore(L('x', 12.34))).toBe(12.3);
  });
});
