import { describe, expect, it } from 'vitest';
import { advanceWeek, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame } from './career';
import { GameSim, type PlayEvent } from './gameSim';
import { currentRun, pickHighlight } from './highlights';
import { generateLeagueTeams } from './generate';
import { ratingTier } from './ratings';
import { RNG } from './rng';
import { buildSeasonReview } from './seasonReview';

const ev = (o: Partial<PlayEvent> & { text: string; home: number; away: number }): PlayEvent => ({ quarter: 1, clock: 400, side: 'home', ...o });

describe('ratingTier', () => {
  it('names bands and orders them', () => {
    expect(ratingTier(39).name).toBe('Raw');
    expect(ratingTier(40).name).toBe('Developing');
    expect(ratingTier(74).name).toBe('Good');
    expect(ratingTier(75).name).toBe('Great');
    expect(ratingTier(99).name).toBe('Legend');
    expect(ratingTier(75).index).toBeGreaterThan(ratingTier(74).index);
  });
});

describe('pickHighlight', () => {
  it('prefers a late, close three over an early layup, and tags it clutch', () => {
    const feed = [
      ev({ text: 'M. Hale lays it in', home: 2, away: 0, user: true, scoring: true, shot: { x: 0.5, y: 0.1, made: true, user: true } }),
      ev({ text: 'J. Reed drills a three', home: 2, away: 3, side: 'away', scoring: true, shot: { x: 0.5, y: 0.5, made: true, user: false } }),
      ev({ quarter: 4, clock: 40, text: 'M. Hale drills a three (T. Ray ast)', home: 5, away: 3, user: true, scoring: true, shot: { x: 0.4, y: 0.5, made: true, user: true } }),
    ];
    const h = pickHighlight(feed, 'M. Hale', 'home')!;
    expect(h.tag).toBe('CLUTCH');
    expect(h.pts).toBe(3);
    expect(h.text).toContain('three');
  });

  it('tags an early three "from downtown" and picks it over a layup', () => {
    const feed = [
      ev({ quarter: 2, text: 'M. Hale lays it in', home: 2, away: 0, user: true, scoring: true, shot: { x: 0.5, y: 0.1, made: true, user: true } }),
      ev({ quarter: 2, text: 'M. Hale drills a three', home: 5, away: 0, user: true, scoring: true, shot: { x: 0.2, y: 0.5, made: true, user: true } }),
      ev({ quarter: 2, text: 'M. Hale lays it in', home: 7, away: 0, user: true, scoring: true, shot: { x: 0.5, y: 0.1, made: true, user: true } }),
    ];
    const h = pickHighlight(feed, 'M. Hale', 'home')!;
    expect(h.tag).toBe('FROM DOWNTOWN');
    expect(h.home).toBe(5);
  });

  it('calls out clutch plays, defense, and returns null when the user did nothing', () => {
    const clutch = [ev({ quarter: 4, clock: 30, text: 'M. Hale hits the pull-up', home: 52, away: 50, user: true, scoring: true, shot: { x: 0.5, y: 0.3, made: true, user: true } })];
    expect(pickHighlight(clutch, 'M. Hale', 'home')!.tag).toBe('CLUTCH');
    const d = [ev({ text: 'M. Hale swats J. Reed!', home: 0, away: 0, user: true })];
    expect(pickHighlight(d, 'M. Hale', 'home')!.tag).toBe('LOCKDOWN');
    expect(pickHighlight([ev({ text: 'J. Reed lays it in', home: 2, away: 0, scoring: true })], 'M. Hale', 'home')).toBeNull();
  });

  it('finds something in a real simulated game', () => {
    const rng = new RNG(11);
    const { teams, athletes } = generateLeagueTeams(rng, 'hs');
    const side = (i: number) => ({ teamId: teams[i].id, abbrev: teams[i].abbrev, roster: athletes.filter((a) => a.teamId === teams[i].id) });
    const home = side(0);
    const u = home.roster[0];
    const sim = new GameSim(rng, home, side(1), { quarterMinutes: 8, levelMean: 47, foulOut: 5, keyMoments: false, userAthleteId: u.id });
    sim.runToEnd();
    const h = pickHighlight(sim.feed, `${u.firstName[0]}. ${u.lastName}`, 'home');
    expect(h).not.toBeNull();
  });
});

describe('currentRun', () => {
  it('tracks unanswered points and momentum', () => {
    const feed = [
      ev({ text: 'a', home: 2, away: 0, scoring: true, side: 'home' }),
      ev({ text: 'b', home: 2, away: 2, scoring: true, side: 'away' }),
      ev({ text: 'c', home: 5, away: 2, scoring: true, side: 'home' }),
      ev({ text: 'd', home: 7, away: 2, scoring: true, side: 'home' }),
    ];
    const r = currentRun(feed);
    expect(r.side).toBe('home');
    expect(r.pts).toBe(5);
    expect(r.momentum).toBeGreaterThan(0);
    expect(currentRun([]).side).toBeNull();
  });
});

describe('buildSeasonReview', () => {
  it('summarizes a finished season', () => {
    const s = createCareer({ firstName: 'T', lastName: 'P', hometown: 'x', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 31 });
    let guard = 0;
    while (s.career.phase !== 'offseason' && guard++ < 3000) {
      const c = s.career;
      if (c.step === 'training') doTraining(s, 'shooting');
      else if (c.step === 'scene') completeScene(s);
      else if (c.step === 'game') {
        const g = createUserGameSim(s)!;
        g.sim.runToEnd();
        finishUserGame(s, g.sim, g.game);
      } else advanceWeek(s);
    }
    const r = buildSeasonReview(s, 1);
    expect(r.w + r.l).toBeGreaterThan(0);
    expect(r.rank).toBeGreaterThanOrEqual(1);
    expect(r.rank).toBeLessThanOrEqual(r.teams);
    expect(r.gp).toBeGreaterThan(0);
    expect(r.playoff.length).toBeGreaterThan(3);
    expect(r.best).not.toBeNull();
    expect(r.champion).toBe(s.league.champion === s.career.teamId);
    void doSummerTraining;
  });
});
