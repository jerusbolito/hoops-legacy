import 'fake-indexeddb/auto';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createCareer } from '../engine/career';
import { RNG } from '../engine/rng';
import { playUntil } from '../engine/testkit';
import { useStore } from '../state/store';
import { CareerHighs } from './components/CareerHighs';
import { RecordsView } from './views/RecordsView';

vi.mock('../state/store', async (orig) => {
  const actual = await orig<typeof import('../state/store')>();
  const hook = Object.assign(<T,>(selector: (s: ReturnType<typeof actual.useStore.getState>) => T) => selector(actual.useStore.getState()), actual.useStore);
  return { ...actual, useStore: hook };
});

const make = () => createCareer({ firstName: 'Rec', lastName: 'Ord', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 11 });

describe('records screens', () => {
  it('a new career shows empty books and no highs without breaking', () => {
    useStore.setState({ game: make(), screen: 'game', tab: 'stats' });
    const html = renderToString(h(RecordsView));
    expect(html).toContain('Record books');
    expect(html).toContain('Nothing on the books yet');
    expect(renderToString(h(CareerHighs))).toContain('Play a game');
  });

  it('after some games, the books list names and the player tab lists career highs', () => {
    const s = make();
    playUntil(s, new RNG(3), (g) => g.career.season >= 3, { moves: true });
    useStore.setState({ game: s, screen: 'game', tab: 'stats' });
    const html = renderToString(h(RecordsView));
    expect(html).toContain('Single game');
    expect(html).toContain('High school');
    expect(html).not.toContain('Nothing on the books yet');
    const highs = renderToString(h(CareerHighs));
    expect(highs).toContain('Points');
    expect(highs).toContain('In a season');
  });
});
