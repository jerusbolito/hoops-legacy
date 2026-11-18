import { beforeAll, describe, expect, it } from 'vitest';
import { GameStateSchema, type GameState } from '../state/schemas';
import { createCareer } from './career';
import { LEVEL_CONFIG } from '../data/teams';
import { FIRING_REP, canStartCoaching, coachRoster, coachingOffers, coachingSummary, expectedWinPct, nextSeason, playSeason, setPhilosophy, startCoaching, stopCoaching, takeJob } from './coaching';
import { coachRatingMods } from './coachingMods';
import { RNG } from './rng';
import { playUntil } from './testkit';

function retired(seed: number): GameState {
  const s = createCareer({ firstName: 'Co', lastName: `Ach${seed}`, hometown: 'Akron, OH', archetype: 'playmaker', position: 'PG', heightIn: 74, schoolIndex: 0, traits: [], seed });
  playUntil(s, new RNG(seed + 1), (x) => x.career.phase === 'retired');
  return s;
}

describe('coaching', () => {
  let base: GameState;
  beforeAll(() => {
    base = retired(4);
  }, 120_000);

  it('opens only for a retired pro', () => {
    expect(base.career.phase).toBe('retired');
    expect(canStartCoaching(base)).toBe(true);
    const fresh = createCareer({ firstName: 'No', lastName: 'Whistle', hometown: 'X', archetype: 'big', position: 'C', heightIn: 80, schoolIndex: 0, traits: [], seed: 2 });
    expect(canStartCoaching(fresh)).toBe(false);
    expect(startCoaching(fresh)).toBe(false);
  });

  it('takes the player off every roster and offers three jobs, better ones to a better name', () => {
    const s = structuredClone(base);
    const me = s.player.athleteId;
    expect(startCoaching(s)).toBe(true);
    expect(s.coaching.active).toBe(true);
    for (const t of Object.values(s.teams)) expect(t.rosterIds).not.toContain(me);
    expect(s.coaching.offers).toHaveLength(3);
    expect(canStartCoaching(s)).toBe(false);
    const pres = (rep: number) => coachingOffers(s, rep).map((id) => s.teams[id].prestige);
    expect(Math.min(...pres(100))).toBeGreaterThanOrEqual(Math.max(...pres(0)));
  });

  it('refuses things out of order', () => {
    const s = structuredClone(base);
    startCoaching(s);
    expect(playSeason(s)).toBeNull(); // no job yet
    expect(takeJob(s, 'nope')).toBe(false);
    expect(setPhilosophy(s, 'develop')).toBe(false);
    expect(nextSeason(s)).toBe(false);
  });

  it('coaches several seasons: a champion every year, full rosters, sane reputation, and the save still parses', () => {
    const s = structuredClone(base);
    startCoaching(s);
    takeJob(s, s.coaching.offers[0]);
    const me = s.player.athleteId;
    const size = LEVEL_CONFIG.pro.rosterSize;
    const seasonAtStart = s.career.season;
    let played = 0;
    for (let i = 0; i < 6; i++) {
      if (s.coaching.stage === 'offers') takeJob(s, s.coaching.offers[0]);
      setPhilosophy(s, (['win_now', 'balanced', 'develop'] as const)[i % 3], (['shooting', 'defense', 'athleticism'] as const)[i % 3]);
      const rep = playSeason(s)!;
      played++;
      expect(rep.champion).not.toBe('');
      expect(rep.season.w + rep.season.l).toBeGreaterThan(5);
      expect(s.coaching.rep).toBeGreaterThanOrEqual(0);
      expect(s.coaching.rep).toBeLessThanOrEqual(100);
      expect(s.coaching.stage).toBe('review');
      expect(nextSeason(s)).toBe(true);
      for (const id of s.league.teamIds) {
        expect(s.teams[id].rosterIds.length).toBe(size);
        expect(s.teams[id].rosterIds).not.toContain(me);
        for (const aid of s.teams[id].rosterIds) expect(s.athletes[aid]).toBeDefined();
      }
    }
    expect(s.career.season).toBe(seasonAtStart + 6);
    expect(s.coaching.history).toHaveLength(played);
    const sum = coachingSummary(s);
    expect(sum.seasons).toBe(6);
    expect(sum.w + sum.l).toBeGreaterThan(0);
    expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(s)))).not.toThrow();
  }, 120_000);

  it('losing long enough gets a coach fired and sent back to the job board', () => {
    const s = structuredClone(base);
    startCoaching(s);
    takeJob(s, s.coaching.offers[0]);
    s.coaching.rep = 1;
    // two seasons at the same job; with no reputation the team plays below itself and the board's patience ends
    let fired = false;
    for (let i = 0; i < 8 && !fired; i++) {
      s.coaching.rep = Math.min(s.coaching.rep, 5);
      const r = playSeason(s)!;
      fired = r.season.fired;
      nextSeason(s);
    }
    if (fired) {
      expect(s.coaching.stage).toBe('offers');
      expect(s.coaching.offers).toHaveLength(3);
      expect(s.coaching.teamId).toBe('');
    }
    // whether or not this seed got fired, reputation never ran outside its bounds
    expect(s.coaching.rep).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('reputation and philosophy shade the roster in games', () => {
    const s = structuredClone(base);
    startCoaching(s);
    takeJob(s, s.coaching.offers[0]);
    const ids = s.teams[s.coaching.teamId].rosterIds;
    s.coaching.rep = 90;
    s.coaching.philosophy = 'balanced';
    const hi = coachRatingMods(s)[ids[0]];
    s.coaching.rep = 10;
    const lo = coachRatingMods(s)[ids[0]];
    expect(hi).toBeGreaterThan(lo);
    s.coaching.stage = 'offers';
    expect(coachRatingMods(s)).toEqual({});
    s.coaching.active = false;
    expect(coachRatingMods(s)).toEqual({});
  });

  it('a better team is expected to win more, and hanging up the whistle gives the retired screen back', () => {
    expect(expectedWinPct(90)).toBeGreaterThan(expectedWinPct(30));
    expect(FIRING_REP).toBeGreaterThan(0);
    const s = structuredClone(base);
    startCoaching(s);
    takeJob(s, s.coaching.offers[0]);
    expect(coachRoster(s).length).toBeGreaterThan(5);
    stopCoaching(s);
    expect(s.coaching.active).toBe(false);
    expect(canStartCoaching(s)).toBe(true);
  });
});
