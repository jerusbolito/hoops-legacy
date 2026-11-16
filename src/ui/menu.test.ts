import 'fake-indexeddb/auto';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createCareer } from '../engine/career';
import { RNG } from '../engine/rng';
import { playUntil } from '../engine/testkit';
import { useStore } from '../state/store';
import { WelcomeCard } from './components/WelcomeCard';
import { GameShell } from './screens/GameShell';
import { GROUPS, PRIMARY_TABS, TABS, groupOf } from './screens/tabs';
import { HelpView } from './views/HelpView';
import { StatsView } from './views/StatsView';

vi.mock('../state/store', async (orig) => {
  const actual = await orig<typeof import('../state/store')>();
  const hook = Object.assign(<T,>(selector: (s: ReturnType<typeof actual.useStore.getState>) => T) => selector(actual.useStore.getState()), actual.useStore);
  return { ...actual, useStore: hook };
});

const make = () => createCareer({ firstName: 'Men', lastName: 'Ū', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 21 });

describe('the menu', () => {
  it('every page is in exactly one group, and every group page exists', () => {
    const grouped = GROUPS.flatMap((g) => g.tabs);
    expect([...grouped].sort()).toEqual(TABS.map((t) => t.id).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const t of TABS) expect(groupOf(t.id).tabs).toContain(t.id);
  });

  it('keeps no more than a handful of groups, and the phone bar tabs exist', () => {
    expect(GROUPS.length).toBeLessThanOrEqual(5);
    for (const id of PRIMARY_TABS) expect(TABS.some((t) => t.id === id)).toBe(true);
  });

  it('every page renders inside the shell without breaking', () => {
    const s = make();
    playUntil(s, new RNG(2), (g) => g.career.season >= 2, { moves: true });
    for (const t of TABS) {
      useStore.setState({ game: s, screen: 'game', tab: t.id, live: null });
      expect(() => renderToString(h(GameShell)), t.id).not.toThrow();
    }
  });

  it('the desktop menu shows the groups, and the open group shows its pages', () => {
    useStore.setState({ game: make(), screen: 'game', tab: 'stats', live: null });
    const html = renderToString(h(GameShell));
    for (const g of GROUPS) expect(html).toContain(g.label);
    expect(html).toContain('Stats');
    expect(html).toContain('League'); // its sibling in the open group
  });
});

describe('stats tab', () => {
  it('opens on all players, with records alongside, and old analytics still reachable', () => {
    const s = make();
    playUntil(s, new RNG(4), (g) => g.career.season >= 2 && g.career.week >= 4, { moves: true });
    useStore.setState({ game: s, screen: 'game', tab: 'stats' });
    const html = renderToString(h(StatsView));
    for (const label of ['Players', 'My game', 'Teams', 'Records']) expect(html).toContain(label);
    expect(html).toContain('Every player');
    expect(html).toContain('FG%');
    expect(html).toContain('Basic');
    expect(html).toContain('Advanced');
  });
});

describe('guide', () => {
  it('has the main sections and explains the stats terms', () => {
    useStore.setState({ game: make(), screen: 'game', tab: 'help' });
    const html = renderToString(h(HelpView));
    for (const t of ['Getting started', 'A week, step by step', 'Playing a game', 'What every tab is for', 'Stats, records and terms', 'Questions']) expect(html).toContain(t);
  });

  it('a brand-new career is welcomed, a later one is not', () => {
    const s = make();
    useStore.setState({ game: s, screen: 'game', tab: 'hub' });
    expect(renderToString(h(WelcomeCard))).toContain('Open the guide');
    s.career.season = 3;
    expect(renderToString(h(WelcomeCard))).toBe('');
  });
});
