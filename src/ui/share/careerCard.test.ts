import { describe, expect, it } from 'vitest';
import { LegendSchema } from '../../state/schemas';
import { cardModel } from './careerCard';

const legend = (o: Record<string, unknown> = {}) =>
  LegendSchema.parse({ id: 'a:1', saveId: 'a', name: 'Jay Walker', firstName: 'Jay', lastName: 'Walker', position: 'SG', hometown: 'Akron, OH', firstSeason: 1, lastSeason: 16, seasons: 16, peakOverall: 88, score: 212.4, tier: 4, tierLabel: 'Hall of Famer', titles: 3, mvps: 1, allStars: 7, ppg: 24.31, rpg: 5.2, apg: 6.04, earnings: 182_400_000, summary: 'A scorer.', ...o });

describe('career share card', () => {
  it('says who they were, how good, and what they won', () => {
    const m = cardModel(legend());
    expect(m.name).toBe('Jay Walker');
    expect(m.tierLabel).toBe('Hall of Famer');
    expect(m.score).toBe(212);
    expect(m.subtitle).toBe('SG · Akron, OH · Seasons 1-16');
    expect(m.line).toBe('3 titles · 1 MVP · 7 All-Stars');
    expect(m.stats.map((s) => s.value)).toEqual(['24.3', '5.2', '6.0', '88', '16', '$182.4M']);
  });

  it('copes with a career that won nothing and a missing tier label', () => {
    const m = cardModel(legend({ titles: 0, mvps: 0, allStars: 0, tierLabel: '', tier: 1, firstSeason: 2, lastSeason: 2, hometown: '', earnings: 900 }));
    expect(m.line).toMatch(/starts somewhere/);
    expect(m.tierLabel).toBe('Solid Pro');
    expect(m.subtitle).toBe('SG · Season 2');
    expect(m.stats[5].value).toBe('$900');
  });

  it('an out-of-range tier cannot break the colour lookup', () => {
    expect(cardModel(legend({ tier: 99 })).tier).toBe(5);
    expect(cardModel(legend({ tier: -3 })).tier).toBe(0);
  });

  it('marks later generations', () => {
    expect(cardModel(legend({ generation: 2 })).footer).toMatch(/Generation 2/);
  });
});
