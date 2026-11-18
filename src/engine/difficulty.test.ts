import { describe, expect, it } from 'vitest';
import { createCareer, doTraining, userAthlete } from './career';
import { DIFFICULTIES, difficultyOf, setDifficulty } from './difficulty';
import { weeklyPay } from './finance';
import { overall } from './ratings';

const make = (difficulty?: 'easy' | 'normal' | 'hard') => createCareer({ firstName: 'Di', lastName: 'Ff', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 11, difficulty });

describe('difficulty', () => {
  it('older saves and new careers with no choice are Standard, and Standard changes nothing', () => {
    const s = make();
    expect(difficultyOf(s).id).toBe('normal');
    expect(s.story.flags.difficulty).toBeUndefined();
    const same = make('normal');
    const strip = (x: object) => JSON.stringify({ ...x, createdAt: 0, updatedAt: 0 });
    expect(strip(same)).toBe(strip(s));
  });

  it('is remembered on the save', () => {
    expect(difficultyOf(make('hard')).id).toBe('hard');
    const s = make('easy');
    setDifficulty(s, 'normal');
    expect(difficultyOf(s).id).toBe('normal');
  });

  it('training pays off faster on Relaxed and slower on Grind, with the same dice', () => {
    const gain = (d: 'easy' | 'normal' | 'hard') => {
      const s = make(d);
      const before = overall(userAthlete(s).ratings);
      for (let i = 0; i < 60; i++) {
        s.player.energy = 100;
        s.career.step = 'training';
        doTraining(s, i % 2 ? 'shooting' : 'finishing');
      }
      return overall(userAthlete(s).ratings) - before;
    };
    const [e, n, h] = [gain('easy'), gain('normal'), gain('hard')];
    expect(e).toBeGreaterThan(n);
    expect(n).toBeGreaterThan(h);
  });

  it('money goes further on Relaxed for an amateur', () => {
    const w = (d: 'easy' | 'normal' | 'hard') => weeklyPay(make(d)).allowance;
    expect(w('easy')).toBeGreaterThan(w('normal'));
    expect(w('normal')).toBeGreaterThan(w('hard'));
  });

  it('every level has a label and a blurb', () => {
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(['easy', 'normal', 'hard']);
    for (const d of DIFFICULTIES) expect(d.blurb.length).toBeGreaterThan(10);
  });
});
