import { describe, expect, it } from 'vitest';
import { LegendSchema, type Legend } from '../state/schemas';
import { ACHIEVEMENTS, achievementStatus } from './achievements';

const legend = (o: Record<string, unknown> = {}): Legend => LegendSchema.parse({ id: `s:${Math.random()}`, saveId: 's', name: 'A B', firstName: 'A', lastName: 'B', ...o });
const done = (l: Legend[]) => new Set(achievementStatus(l).filter((a) => a.done).map((a) => a.id));

describe('achievements', () => {
  it('ids are unique and every blurb is filled in', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.blurb.length).toBeGreaterThan(10);
  });

  it('nothing is unlocked before a career is filed, and progress is never out of range', () => {
    expect(done([]).size).toBe(0);
    for (const a of achievementStatus([legend({ titles: 99, mvps: 99, earnings: 9e12 })])) {
      expect(a.have).toBeLessThanOrEqual(a.need);
      expect(a.have).toBeGreaterThanOrEqual(0);
    }
  });

  it('a modest career unlocks only the modest ones', () => {
    const d = done([legend({ titles: 1, tier: 1 })]);
    expect(d.has('first_legend')).toBe(true);
    expect(d.has('ring')).toBe(false);
    expect(d.has('hof')).toBe(false);
  });

  it('a great career unlocks the big ones', () => {
    const d = done([legend({ titles: 7, mvps: 3, allStars: 12, tier: 5, ppg: 26.2, draftPick: 1, earnings: 6e8, seasons: 19, teams: ['a', 'b', 'c', 'd', 'e', 'f'], married: true, kids: 3, goalsDone: 3, goalsTotal: 3, badges: 8 })]);
    for (const id of ['dynasty', 'mvp3', 'all_star', 'immortal', 'hof', 'scorer', 'first_pick', 'rich', 'iron', 'journeyman', 'family', 'goals', 'badges']) expect(d.has(id), id).toBe(true);
  });

  it('counts across careers, not just within one', () => {
    const d = done([legend({ tier: 0 }), legend({ tier: 2, generation: 2 }), legend({ tier: 4, generation: 3 })]);
    expect(d.has('range')).toBe(true);
    expect(d.has('heir')).toBe(true);
    expect(d.has('line')).toBe(true);
    const ten = Array.from({ length: 10 }, () => legend());
    expect(done(ten).has('collector')).toBe(true);
  });

  it('undrafted needs a missing pick, not a first-round one', () => {
    expect(done([legend({ draftPick: 12, tier: 4 })]).has('undrafted')).toBe(false);
    expect(done([legend({ draftPick: null, tier: 3 })]).has('undrafted')).toBe(true);
  });

  it('family needs a marriage', () => {
    expect(done([legend({ married: false, kids: 4 })]).has('family')).toBe(false);
  });
});
