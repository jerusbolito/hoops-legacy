import { describe, expect, it } from 'vitest';
import { MODEL_LIMIT, plainCheck, plainProblem } from './plain';

describe('plain-language check', () => {
  it('flags the writing that reads well and says nothing', () => {
    const bad = [
      'A heavy silence settled over the gym as Coach looked at you. Something shifted in his face, like a door closing.',
      'The weight of the moment hung in the air, and it felt like the whole season was a storm of doubt.',
      'She smiled as if nothing had happened, and a flicker of something passed between you.',
    ];
    for (const t of bad) expect(plainCheck(t).score, t).toBeGreaterThanOrEqual(MODEL_LIMIT);
  });

  it('lets plain statements through, including ordinary uses of "like"', () => {
    const good = [
      'Coach says you are not starting tonight. Nobody in the gym says anything.',
      'You like the new play. It gives you the ball at the elbow, and Jordan hates it because he loses touches.',
      'They tell you the offer is real and that they need an answer by Friday.',
      'Your mom asks if you ate. You did not. She makes you a sandwich and sits down across from you.',
      'You do not know what to say, so you say you will think about it.',
    ];
    for (const t of good) expect(plainCheck(t).score, t).toBeLessThan(MODEL_LIMIT);
  });

  it('counts each phrase, and says what to say instead', () => {
    const r = plainCheck('The air was thick with tension. Something changed in her eyes.');
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.hits.length).toBeGreaterThanOrEqual(2);
    expect(r.fixes.length).toBeGreaterThanOrEqual(1);
  });

  it('asks the model for a rewrite, quoting what was wrong, only when it is a pile', () => {
    expect(plainProblem('Coach says you are benched. Nobody talks.')).toBeNull();
    expect(plainProblem('One stray image, like a wave, and then plain words.')).toBeNull();
    const msg = plainProblem('Silence settled over the room. Something shifted between you, as if time itself had slowed.')!;
    expect(msg).toMatch(/too figurative/);
    expect(msg).toMatch(/Silence settled/);
    expect(msg).toMatch(/plain, literal language/);
    expect(plainProblem(undefined, '')).toBeNull();
  });
});
