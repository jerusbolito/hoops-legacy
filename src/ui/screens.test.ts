import 'fake-indexeddb/auto';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createCareer, withRng } from '../engine/career';
import { lifeEventView, lifeRefs, resolveLifeEvent } from '../engine/lifeEvents';
import { startMove } from '../engine/moves';
import { RNG } from '../engine/rng';
import { playUntil } from '../engine/testkit';
import type { GameState } from '../state/schemas';
import { useStore } from '../state/store';
import { LifeEventModal } from './components/LifeEventModal';
import { WeekDonePanel } from './panels/WeekDonePanel';
import { AthleteCardModal } from './components/AthleteCardModal';
import { ChemistryCard } from './components/ChemistryCard';
import { LeadersPanel } from './components/LeadersPanel';
import { PersonText } from './components/PlayerLink';
import { NewspaperView } from './views/NewspaperView';
import { DraftPanel, FreeAgencyPanel } from './panels/CareerPanels';
import { PreGamePanel } from './panels/GamePanel';
import { LeagueView } from './views/LeagueView';
import { MoneyView } from './views/MoneyView';
import { RecruitingView } from './views/RecruitingView';
import { RelationshipsView } from './views/RelationshipsView';

// Server rendering reads a store's initial snapshot, so the screens get a hook that reads the live state instead.
vi.mock('../state/store', async (orig) => {
  const actual = await orig<typeof import('../state/store')>();
  const hook = Object.assign(<T,>(selector: (s: ReturnType<typeof actual.useStore.getState>) => T) => selector(actual.useStore.getState()), actual.useStore);
  return { ...actual, useStore: hook };
});

const make = (seed: number) => createCareer({ firstName: 'Ui', lastName: `Test${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });
const plain = (html: string) => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '');
const show = (g: GameState, el: ReactElement) => {
  useStore.setState({ game: g, screen: 'game', reveals: [], live: null, lifeOutcome: null, lastMove: null });
  return plain(renderToString(el));
};

describe('the new screens draw without breaking', () => {
  it('Money page, at every level', () => {
    for (const level of ['hs', 'college', 'pro'] as const) {
      const s = make(3);
      playUntil(s, new RNG(5), (x) => x.career.level === level && x.career.phase === 'regular' && x.career.week >= 3 && !x.career.lifeEvent);
      const html = show(s, h(MoneyView));
      expect(html).toContain('In the bank');
      expect(html).toContain('Spend it on your game');
      expect(html).toContain('Private trainer');
      expect(html).not.toMatch(/NaN|undefined|\[object/);
      if (level === 'pro') expect(html).toContain('Taxes and agent fees');
      if (level === 'pro') expect(html).toContain('Request a trade');
      else expect(html).toContain('Transfers open once the season is over');
      expect(html.includes('Tutor')).toBe(level !== 'pro');
    }
  });

  it('shows the schools that want you, and lets you stay', () => {
    const s = make(8);
    const rng = new RNG(8);
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && x.career.year === 2 && !x.career.lifeEvent);
    const before = show(s, h(MoneyView));
    expect(before).toContain('Transfer schools');
    withRng(s, (r) => startMove(s, r));
    const html = show(s, h(MoneyView));
    for (const o of s.career.pendingMove!.offers) expect(html).toContain(o.name);
    expect(html).toContain(`Stay with ${s.teams[s.career.teamId].name}`);
    expect(html).not.toMatch(/NaN|undefined|\[object/);
    // and the wrap-up page points the way
    const s2 = make(8);
    playUntil(s2, new RNG(8), (x) => x.career.phase === 'offseason' && x.career.year === 2 && x.career.step === 'done' && !x.career.lifeEvent);
    expect(show(s2, h(WeekDonePanel))).toContain('Thinking about a fresh start?');
  });

  it('a random moment shows its text and choices, then what happened', () => {
    const s = make(11);
    playUntil(s, new RNG(11), (x) => x.career.phase === 'regular' && x.career.week >= 3 && !x.career.lifeEvent);
    s.career.lifeEvent = { id: 'family_money', seed: 4, refs: lifeRefs(s) };
    s.player.money = 50;
    const view = lifeEventView(s)!;
    const html = show(s, h(LifeEventModal));
    expect(html).toContain(view.title);
    for (const o of view.options) expect(html).toContain(o.label);
    expect(html).toContain('Cannot afford');
    // once answered, the result card appears
    const out = withRng(s, (r) => resolveLifeEvent(s, r, 'listen'))!;
    useStore.setState({ game: s, lifeOutcome: out });
    const after = plain(renderToString(h(LifeEventModal)));
    expect(after).toContain(out.text.slice(0, 20));
    expect(after).toContain('Continue');
    // it waits for a full-screen reveal to finish
    useStore.setState({ reveals: [{ id: 1, kind: 'season', review: {} as never, summary: '' }] as never });
    expect(renderToString(h(LifeEventModal))).not.toContain('Continue');
    useStore.setState({ reveals: [], lifeOutcome: null });
  });

  it('the Recruiting tab shows who you are chasing, who is chasing you, and what the league is saying', () => {
    for (const level of ['hs', 'college', 'pro'] as const) {
      const s = make(14);
      playUntil(s, new RNG(14), (x) => x.career.level === level && x.career.phase === 'regular' && x.career.week >= 3 && (level === 'pro' || x.career.year === 2) && !x.career.lifeEvent);
      s.recruiting.suitors = [{ name: 'Ivy Ridge', interest: 55, contacts: 2, visited: true }];
      const html = show(s, h(RecruitingView));
      expect(html).toContain(level === 'pro' ? 'Free agents you want' : 'Players you want');
      for (const t of s.recruiting.targets) {
        expect(html).toContain(t.name);
        expect(html).toContain('Sold on you');
      }
      expect(html).toContain('Host a visit');
      expect(html).toContain('Who is recruiting you');
      expect(html).toContain('Around the league');
      if (level === 'hs') expect(html).toContain('Ivy Ridge');
      if (level === 'pro') expect(html).toContain('Professional teams do not recruit you now');
      expect(html).not.toMatch(/NaN|undefined|\[object/);
    }
  });

  it('the Money tab for a pro shows contract talks, payroll and the cap', () => {
    const s = make(15);
    playUntil(s, new RNG(15), (x) => x.career.level === 'pro' && x.career.phase === 'regular' && x.career.week >= 3 && !x.career.lifeEvent);
    s.player.contract!.yearsLeft = 1;
    s.story.flags.ext_season = 0;
    let html = show(s, h(MoneyView));
    expect(html).toContain('Contract talks');
    expect(html).toContain('Team payroll');
    expect(html).toContain('Ask for a fair deal');
    expect(html).toContain('Ask for the moon');
    expect(html).not.toMatch(/NaN|undefined|\[object/);
    // after a turn-down you can hold out; while holding out you can go back to work
    s.story.flags.ext_season = s.career.season;
    expect(show(s, h(MoneyView))).toContain('Hold out');
    s.story.flags.holdout = true;
    html = show(s, h(MoneyView));
    expect(html).toContain('Holding out: week');
    expect(html).toContain('Go back to work');
  });

  it('draft night shows the big board with you on it, and the league tab shows the MVP race', () => {
    const s = make(16);
    playUntil(s, new RNG(16), (x) => x.career.phase === 'draft' && !x.career.lifeEvent);
    const html = show(s, h(DraftPanel));
    expect(html).toContain('The big board');
    expect(html).toContain('you');
    expect(html).not.toMatch(/NaN|undefined|\[object/);
    const t = make(17);
    playUntil(t, new RNG(17), (x) => x.career.phase === 'regular' && x.career.week >= 5 && !x.career.lifeEvent);
    const lg = show(t, h(LeagueView));
    expect(lg).toContain('MVP race');
    expect(lg).toContain('Around the league');
    expect(lg).not.toMatch(/NaN|undefined|\[object/);
  });

  it('the chemistry card says what the room is worth, and the free-agent list shows cap room', () => {
    const s = make(18);
    playUntil(s, new RNG(18), (x) => x.career.phase === 'regular' && x.career.week >= 3 && !x.career.lifeEvent);
    s.career.chemistry = 90;
    expect(show(s, h(ChemistryCard))).toContain('2 points above their rating');
    s.career.chemistry = 20;
    expect(show(s, h(ChemistryCard))).toContain('below their rating');
    s.story.flags.captain_season = s.career.season;
    expect(show(s, h(ChemistryCard))).toContain('Captain');
    const f = make(19);
    playUntil(f, new RNG(19), (x) => x.career.phase === 'free_agency');
    useStore.setState({ offers: { fa: [{ teamName: 'Denver', mascot: 'Peaks', prestige: 66, colors: ['#0ea5e9', '#fbbf24'], salary: 9_000_000, years: 3, current: false, capSpace: 12_000_000 }] } });
    const fa = show(f, h(FreeAgencyPanel));
    expect(fa).toContain('Cap room');
    expect(fa).toContain('Also on the market');
    useStore.setState({ offers: {} });
  });

  it('the pre-game panel marks a rivalry game with the series record', () => {
    const s = make(20);
    const rival = Object.values(s.npcs).find((n) => n.role === 'rival')!;
    const rivalTeam = s.athletes[rival.athleteId!].teamId!;
    rival.h2h = { w: 2, l: 1 };
    const facing = (x: GameState) => {
      const g = x.league.schedule.find((m) => m.week === x.career.week && !m.played && (m.homeId === x.career.teamId || m.awayId === x.career.teamId));
      return g ? (g.homeId === x.career.teamId ? g.awayId : g.homeId) : null;
    };
    playUntil(s, new RNG(20), (x) => x.career.step === 'game' && facing(x) === rivalTeam && !x.career.lifeEvent);
    const html = show(s, h(PreGamePanel));
    expect(html).toContain('Rivalry game');
    expect(html).toContain('you lead the series 2-1');
  });

  it('the newspaper reads like one: masthead, headline, scoreboard, players of the week, standings, leaders and back issues', () => {
    const s = make(21);
    playUntil(s, new RNG(21), (x) => x.career.phase === 'regular' && x.career.week >= 4 && x.career.step === 'training' && !x.career.lifeEvent);
    const issue = s.paper[s.paper.length - 1];
    const html = show(s, h(NewspaperView));
    expect(html).toContain('Report');
    expect(html).toContain(issue.dateline.split(' · ')[0]);
    expect(html).toContain('Scoreboard');
    expect(html).toContain('Players of the Week');
    expect(html).toContain('Standings');
    expect(html).toContain('League Leaders');
    expect(html).toContain('Back issues');
    expect(html).not.toMatch(/NaN|undefined|\[object/);
    // before the first edition there is a placeholder, not a crash
    const fresh = make(22);
    expect(show(fresh, h(NewspaperView))).toContain('first edition');
  });

  it('the leaders panel lists the top ten with names you can click', () => {
    const s = make(23);
    playUntil(s, new RNG(23), (x) => x.career.phase === 'regular' && x.career.week >= 4 && x.career.step === 'training' && !x.career.lifeEvent);
    const html = show(s, h(LeadersPanel));
    expect(html).toContain('League leaders');
    for (const short of ['PPG', 'RPG', 'APG', 'SPG', 'BPG', 'FG%', '3P%', 'FT%']) expect(html).toContain(short);
    expect(html.match(/<button type="button"/g)!.length).toBeGreaterThanOrEqual(5);
    expect(html).not.toMatch(/NaN|undefined|\[object/);
  });

  it('a name in the paper becomes a link to that player\'s card, and the card shows the season line', () => {
    const s = make(24);
    playUntil(s, new RNG(24), (x) => x.career.phase === 'regular' && x.career.week >= 4 && x.career.step === 'training' && !x.career.lifeEvent);
    const me = s.athletes[s.player.athleteId];
    const name = `${me.firstName} ${me.lastName}`;
    const text = plain(renderToString(h(PersonText, { item: { text: `Big night for ${name} against the rival.`, people: [{ id: me.id, name }] } })));
    expect(text).toContain('<button type="button"');
    expect(text).toContain(name);
    expect(text).toContain('against the rival.');
    // with a card open, the modal shows who they are and how they are doing
    useStore.setState({ game: s, cardId: me.id });
    const card = plain(renderToString(h(AthleteCardModal)));
    expect(card).toContain(name);
    expect(card).toContain('This season');
    expect(card).toContain('PPG');
    expect(card).toContain('FG%');
    expect(card).toContain('Your career');
    expect(card).not.toMatch(/NaN|undefined|\[object/);
    // someone else's card compares their ratings with yours
    const rival = Object.values(s.npcs).find((n) => n.role === 'rival')!;
    useStore.setState({ cardId: rival.athleteId! });
    const other = plain(renderToString(h(AthleteCardModal)));
    expect(other).toContain(rival.name);
    expect(other).toContain('compared with yours');
    expect(other).toContain('Rival');
    useStore.setState({ cardId: null });
    expect(renderToString(h(AthleteCardModal))).toBe('');
  });

  it('the People page shows where a rival or friend is in their career', () => {
    const s = make(12);
    playUntil(s, new RNG(12), (x) => x.career.phase === 'preseason' && x.career.year === 4 && !x.career.lifeEvent);
    const rival = Object.values(s.npcs).find((n) => n.role === 'rival')!;
    const html = show(s, h(RelationshipsView));
    expect(html).toContain(rival.name);
    expect(html).toContain('Senior');
    expect(html).not.toContain('Freshman phenom');
  });
});
