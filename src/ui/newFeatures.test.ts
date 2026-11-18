import 'fake-indexeddb/auto';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LegendSchema } from '../state/schemas';
import { Achievements, LegendCard } from './components/Legacy';
import { Challenges } from './components/Challenges';
import { CreateScreen } from './screens/CreateScreen';

// Server rendering reads a store's initial snapshot, so the screens get a hook that reads the live state instead.
vi.mock('../state/store', async (orig) => {
  const actual = await orig<typeof import('../state/store')>();
  const hook = Object.assign(<T,>(selector: (s: ReturnType<typeof actual.useStore.getState>) => T) => selector(actual.useStore.getState()), actual.useStore);
  return { ...actual, useStore: hook };
});

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

import { createCareer } from '../engine/career';
import { nextSeason, playSeason, startCoaching, takeJob } from '../engine/coaching';
import { RNG } from '../engine/rng';
import { playUntil } from '../engine/testkit';
import { GameStateSchema } from '../state/schemas';
import { useStore } from '../state/store';
import { CoachCard, CoachingPanel } from './panels/CoachingPanel';

describe('coaching screens', () => {
  it('walk through every stage without a missing piece', () => {
    const s = createCareer({ firstName: 'Co', lastName: 'Ach', hometown: 'Akron, OH', archetype: 'playmaker', position: 'PG', heightIn: 74, schoolIndex: 0, traits: [], seed: 4 });
    playUntil(s, new RNG(5), (x) => x.career.phase === 'retired');
    useStore.setState({ game: s });
    expect(renderToString(h(CoachCard))).toContain('Become a coach');

    startCoaching(s);
    useStore.setState({ game: s });
    expect(renderToString(h(CoachingPanel))).toContain('Job offers');
    expect(renderToString(h(CoachCard))).toBe('');

    takeJob(s, s.coaching.offers[0]);
    useStore.setState({ game: s });
    let html = renderToString(h(CoachingPanel));
    expect(html).toContain('Philosophy');
    expect(html).toContain('Your roster');
    expect(html).toContain('Play the season');

    playSeason(s);
    useStore.setState({ game: s });
    html = renderToString(h(CoachingPanel));
    expect(html).toContain('Season in review');
    expect(html).toContain('Coaching record');
    expect(html).not.toMatch(/undefined|NaN/);

    nextSeason(s);
    useStore.setState({ game: s });
    expect(renderToString(h(CoachingPanel))).toMatch(/Philosophy|Job offers/);
  }, 120_000);

  it('a save from before coaching existed loads as not coaching', () => {
    const s = createCareer({ firstName: 'Old', lastName: 'Save', hometown: 'X', archetype: 'big', position: 'C', heightIn: 80, schoolIndex: 0, traits: [], seed: 3 });
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.coaching;
    const loaded = GameStateSchema.parse(raw);
    expect(loaded.coaching.active).toBe(false);
    expect(loaded.coaching.history).toEqual([]);
  });
});

import { AthleteCardModal } from './components/AthleteCardModal';

describe('scouting on the player card', () => {
  it('shows a scouting report for someone else, and not for you', async () => {
    const s = createCareer({ firstName: 'Sc', lastName: 'Out', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 3 });
    const other = s.teams[s.career.teamId].rosterIds.find((id) => id !== s.player.athleteId)!;
    // the card sits inside an AnimatePresence, so render it through the same path the app uses
    useStore.setState({ game: s, cardId: other });
    const html = renderToString(h(AthleteCardModal)).replace(/<!-- -->/g, '');
    expect(html).toContain('Scouting report');
    expect(html).toMatch(/Likely peak/);
    expect(html).not.toMatch(/undefined|NaN/);
    useStore.setState({ cardId: s.player.athleteId });
    expect(renderToString(h(AthleteCardModal))).not.toContain('Scouting report');
    useStore.setState({ cardId: null });
  });
});
