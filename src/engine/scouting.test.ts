import { describe, expect, it } from 'vitest';
import { createCareer } from './career';
import { gradeFor, scoutingReport, yearsToDevelop } from './scouting';
import { overall } from './ratings';
import { RNG } from './rng';
import { playUntil } from './testkit';
import type { GameState, Level } from '../state/schemas';

const make = (seed: number) => createCareer({ firstName: 'Sc', lastName: `Out${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

describe('scouting reports', () => {
  it('grades against the level: an average starter is a B-, a star an A', () => {
    expect(gradeFor(47, 'hs')).toBe('B-');
    expect(gradeFor(62, 'college')).toBe('B-');
    expect(gradeFor(74 + 10, 'pro')).toBe('A');
    expect(gradeFor(74 - 30, 'pro')).toBe('F');
    // the same rating means more at a lower level
    const order = ['F', 'D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
    expect(order.indexOf(gradeFor(62, 'hs'))).toBeGreaterThan(order.indexOf(gradeFor(62, 'pro')));
  });

  it('younger players have more years of growth, and it never goes negative', () => {
    expect(yearsToDevelop(17)).toBe(8);
    expect(yearsToDevelop(25)).toBe(0);
    expect(yearsToDevelop(34)).toBe(0);
  });

  it('is null for nobody, and makes sense for everyone in a real league at every level', () => {
    const s = make(3);
    expect(scoutingReport(s, 'nobody')).toBeNull();
    const rng = new RNG(4);
    for (const level of ['hs', 'college', 'pro'] as Level[]) {
      playUntil(s, rng, (x: GameState) => x.career.level === level && x.career.phase === 'regular' && x.career.week >= 2 && !x.career.lifeEvent);
      for (const tid of s.league.teamIds) {
        for (const aid of s.teams[tid].rosterIds) {
          const a = s.athletes[aid];
          const r = scoutingReport(s, aid)!;
          expect(r.now).toBe(overall(a.ratings));
          expect(r.likelyPeak).toBeGreaterThanOrEqual(r.now);
          expect(r.ceiling).toBeGreaterThanOrEqual(r.likelyPeak);
          expect(r.ceiling).toBeLessThanOrEqual(99);
          expect(r.strengths.length).toBeLessThanOrEqual(3);
          // a strength is never also a concern
          for (const x of r.strengths) expect(r.concerns.some((c) => c.key === x.key)).toBe(false);
          expect(r.headline).not.toMatch(/undefined|NaN/);
          expect(['ready', 'soon', 'project', 'n/a']).toContain(r.readiness);
          expect(r.readiness === 'n/a').toBe(level === 'pro');
          expect(r.nextLevel === null).toBe(level === 'pro');
        }
      }
    }
  }, 120_000);

  it('a ready prospect reads as ready and a far-off one as a project', () => {
    const s = make(5);
    const me = s.athletes[s.player.athleteId];
    me.ratings = { shooting: 80, finishing: 80, handles: 80, passing: 80, defense: 80, rebounding: 80, athleticism: 80, iq: 80, stamina: 80 };
    me.potential = 90;
    expect(scoutingReport(s, me.id)!.readiness).toBe('ready');
    for (const k of Object.keys(me.ratings) as (keyof typeof me.ratings)[]) me.ratings[k] = 40;
    me.potential = 44;
    const r = scoutingReport(s, me.id)!;
    expect(r.readiness).toBe('project');
    expect(r.grade).not.toBe('A');
  });

  it('flags a lopsided player and an old one as riskier than a balanced young one', () => {
    const s = make(6);
    const me = s.athletes[s.player.athleteId];
    me.age = 20;
    me.ratings = { shooting: 60, finishing: 60, handles: 60, passing: 60, defense: 60, rebounding: 60, athleticism: 60, iq: 60, stamina: 60 };
    me.potential = 62;
    expect(scoutingReport(s, me.id)!.risk).toBe('low');
    me.ratings.shooting = 95;
    me.ratings.defense = 40;
    expect(scoutingReport(s, me.id)!.risk).toBe('medium');
    me.age = 33;
    expect(scoutingReport(s, me.id)!.risk).toBe('high');
  });
});
