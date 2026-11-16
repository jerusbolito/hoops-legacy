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

  it('a brand-new career is offered the tour once; choosing either way remembers it for that save', () => {
    const s = make();
    useStore.setState({ game: s, screen: 'game', tab: 'hub', tour: null });
    expect(renderToString(h(WelcomeCard))).toContain('Take the tour');
    s.story.flags.tour_offered = true;
    expect(renderToString(h(WelcomeCard))).toBe('');
    const later = make();
    later.career.season = 3;
    useStore.setState({ game: later });
    expect(renderToString(h(WelcomeCard))).toBe('');
  });
});

describe('ratings explained', () => {
  it('every rating has a plain name and a description, and the summer panel shows them', async () => {
    const { RATING_INFO } = await import('../engine/ratings');
    const { RATING_KEYS } = await import('../state/schemas');
    const { SummerPanel } = await import('./panels/TrainingPanel');
    for (const k of RATING_KEYS) {
      expect(RATING_INFO[k].name.length).toBeGreaterThan(2);
      expect(RATING_INFO[k].what.length).toBeGreaterThan(20);
    }
    useStore.setState({ game: make(), screen: 'game', tab: 'hub' });
    const html = renderToString(h(SummerPanel));
    for (const k of RATING_KEYS) expect(html).toContain(RATING_INFO[k].name);
    expect(html).toContain('Also lifts');
    expect(html).toContain('/2 chosen');
  });
});

describe('tour', () => {
  it('every step opens a real page and says something', async () => {
    const { TOUR_STEPS } = await import('./components/Tour');
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
    for (const st of TOUR_STEPS) {
      expect(TABS.some((t) => t.id === st.tab)).toBe(true);
      expect(st.title.length).toBeGreaterThan(3);
      expect(st.text.length).toBeGreaterThan(40);
    }
  });

  it('starting it opens step one on the hub and remembers the offer in the save; ending it clears it', () => {
    const s = make();
    useStore.setState({ game: s, screen: 'game', tab: 'help', tour: null });
    useStore.getState().startTour();
    const st = useStore.getState();
    expect(st.tour).toBe(0);
    expect(st.tab).toBe('hub');
    expect(st.game!.story.flags.tour_offered).toBe(true);
    useStore.getState().tourStep(null);
    expect(useStore.getState().tour).toBeNull();
  });

  it('declining remembers it too, without starting anything', () => {
    useStore.setState({ game: make(), screen: 'game', tab: 'hub', tour: null });
    useStore.getState().declineTour();
    expect(useStore.getState().tour).toBeNull();
    expect(useStore.getState().game!.story.flags.tour_offered).toBe(true);
  });

  it('the card shows the step and its place in the tour, and hides during a live game', async () => {
    const { Tour, TOUR_STEPS } = await import('./components/Tour');
    useStore.setState({ game: make(), screen: 'game', tab: 'hub', tour: 2, live: null });
    const html = renderToString(h(Tour));
    expect(html).toContain(TOUR_STEPS[2].title);
    expect(html.replace(/<!-- -->/g, '')).toContain('3 of ' + TOUR_STEPS.length);
    expect(html).toContain('Skip');
    useStore.setState({ live: {} as never });
    expect(renderToString(h(Tour))).toBe('');
    useStore.setState({ live: null, tour: null });
    expect(renderToString(h(Tour))).toBe('');
  });

  it('the guide offers the tour', () => {
    useStore.setState({ game: make(), screen: 'game', tab: 'help' });
    expect(renderToString(h(HelpView))).toContain('Take the tour');
  });
});

describe('honors page', () => {
  it('lists the seasons with each award, and says so when it is empty', async () => {
    const { HonorsView } = await import('./views/HonorsView');
    useStore.setState({ game: make(), screen: 'game', tab: 'honors' });
    expect(renderToString(h(HonorsView))).toContain('Nothing yet');
    const s = make();
    playUntil(s, new RNG(5), (g) => g.career.season >= 3, { moves: true });
    useStore.setState({ game: s });
    const html = renderToString(h(HonorsView));
    for (const t of ['All leagues', 'High school', 'Conference MVP', 'All-Conference First Team', 'All-Stars', 'Most decorated', 'Season 1']) expect(html).toContain(t);
  });

  it('is part of the League group', () => {
    expect(groupOf('honors').id).toBe('league');
  });
});
