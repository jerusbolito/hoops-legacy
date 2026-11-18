import 'fake-indexeddb/auto';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LegendSchema } from '../state/schemas';
import { Achievements, LegendCard } from './components/Legacy';
import { Challenges } from './components/Challenges';
import { CreateScreen } from './screens/CreateScreen';

const legend = LegendSchema.parse({ id: 'a:1', saveId: 'a', name: 'Jay Walker', firstName: 'Jay', lastName: 'Walker', titles: 4, tier: 4, tierLabel: 'Hall of Famer', score: 200 });

describe('new screens render', () => {
  it('Challenges lists this week and the classics with a start and leaderboard button', () => {
    const html = renderToString(h(Challenges));
    expect(html).toContain('This week');
    expect(html).toContain('The Underdog');
    expect(html).toContain('Silver Spoon');
    expect(html).toContain('Leaderboard');
    expect(html).not.toMatch(/undefined|NaN/);
  });

  it('Achievements shows locked and unlocked ones with a count', () => {
    const html = renderToString(h(Achievements, { legends: [legend] })).replace(/<!-- -->/g, '');
    expect(html).toContain('Achievements');
    expect(html).toContain('First Chapter');
    expect(html).toContain('Hall of Famer');
    expect(html).toMatch(/\d+ of \d+/);
    expect(html).toContain('aria-label="unlocked"');
  });

  it('a Hall of Fame card is shareable once opened', () => {
    expect(renderToString(h(LegendCard, { l: legend, open: true }))).toContain('Share this career');
  });

  it('character creation offers the three difficulties', () => {
    const html = renderToString(h(CreateScreen));
    for (const t of ['Relaxed', 'Standard', 'Grind']) expect(html).toContain(t);
  });
});
