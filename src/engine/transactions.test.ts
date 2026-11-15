import { describe, expect, it } from 'vitest';
import { createCareer } from './career';
import { RNG } from './rng';
import { leagueInSeasonTrades, leagueOffseasonMoves, marketPreview, tradeWeek } from './transactions';
import { overall } from './ratings';
import { playUntil, tick } from './testkit';
import type { GameState } from '../state/schemas';

const make = (seed: number) => createCareer({ firstName: 'Lg', lastName: `Test${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

const rostersWhole = (s: GameState) => {
  for (const id of s.league.teamIds) {
    const t = s.teams[id];
    expect(new Set(t.rosterIds).size).toBe(t.rosterIds.length);
    for (const a of t.rosterIds) {
      expect(s.athletes[a]).toBeDefined();
      expect(s.athletes[a].teamId).toBe(t.id);
    }
  }
};

describe('a league that moves', () => {
  it('high school and college players transfer every offseason, and every roster stays whole', () => {
    const s = make(5);
    const rng = new RNG(5);
    for (const year of [2, 3]) {
      playUntil(s, rng, (x) => x.career.phase === 'preseason' && x.career.year === year && !x.career.lifeEvent);
      rostersWhole(s);
    }
    const moves = s.transactions.filter((t) => t.kind === 'transfer');
    expect(moves.length).toBeGreaterThanOrEqual(4);
    expect(moves[0].text).toMatch(/transfers from .+ to .+/);
    expect(s.news.some((n) => /transfers from/.test(n.text))).toBe(true);
  });

  it('never moves you, your teammates, or the people in your story by the generic rules', () => {
    const s = make(8);
    const rng = new RNG(8);
    const mate = () => Object.values(s.npcs).find((n) => n.role === 'teammate' && n.athleteId);
    const before = mate()!;
    const team = s.athletes[before.athleteId!].teamId;
    for (let i = 0; i < 25; i++) leagueOffseasonMoves(s, rng);
    expect(s.athletes[s.player.athleteId].teamId).toBe(s.career.teamId);
    expect(s.athletes[before.athleteId!].teamId).toBe(team);
    rostersWhole(s);
  });

  it('rivals and friends can leave too, and their titles and memories follow', () => {
    let rivalMoved = 0;
    let friendMoved = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = make(seed);
      const rng = new RNG(seed);
      const rival = Object.values(s.npcs).find((n) => n.role === 'rival')!;
      const friend = Object.values(s.npcs).find((n) => n.role === 'friend')!;
      // a friend stuck on the bench is the likeliest to go
      const fa = s.athletes[friend.athleteId!];
      for (const k of Object.keys(fa.ratings) as (keyof typeof fa.ratings)[]) fa.ratings[k] = 10;
      const r0 = s.athletes[rival.athleteId!].teamId;
      const f0 = fa.teamId;
      for (let i = 0; i < 3; i++) leagueOffseasonMoves(s, rng);
      if (s.athletes[rival.athleteId!].teamId !== r0) {
        rivalMoved++;
        expect(rival.memories.some((m) => /^Left /.test(m))).toBe(true);
        expect(rival.title).toContain(s.teams[s.athletes[rival.athleteId!].teamId!].name);
      }
      if (fa.teamId !== f0) {
        friendMoved++;
        expect(friend.memories.some((m) => /Left /.test(m))).toBe(true);
      }
      rostersWhole(s);
    }
    expect(rivalMoved).toBeGreaterThan(0);
    expect(friendMoved).toBeGreaterThan(0);
  });

  it('pro teams trade each other, and a signing or two happens every offseason', () => {
    const s = make(12);
    const rng = new RNG(12);
    playUntil(s, rng, (x) => x.career.level === 'pro' && x.career.phase === 'regular' && x.career.week === 1 && !x.career.lifeEvent);
    const log0 = s.transactions.length;
    // run the league's trade week and the next offseason's signings
    playUntil(s, rng, (x) => x.career.level === 'pro' && x.career.phase === 'regular' && x.career.week === tradeWeek(x) + 1 && !x.career.lifeEvent);
    const trades = s.transactions.slice(log0).filter((t) => t.kind === 'trade' && /trade .+ to .+ for/.test(t.text));
    expect(trades.length).toBeGreaterThanOrEqual(1);
    rostersWhole(s);
    playUntil(s, rng, (x) => x.career.level === 'pro' && x.career.phase === 'preseason' && x.career.season > s.career.season && !x.career.lifeEvent);
    expect(s.transactions.some((t) => t.kind === 'signing')).toBe(true);
    rostersWhole(s);
  });

  it('pro contracts run out: players hit a market, teams with open spots sign them, and the best get the headlines', () => {
    const s = make(21);
    const rng = new RNG(21);
    playUntil(s, rng, (x) => x.career.level === 'pro' && x.career.phase === 'offseason' && !x.career.lifeEvent);
    const ids = s.league.teamIds.flatMap((t) => s.teams[t].rosterIds).filter((id) => id !== s.player.athleteId);
    const before = new Map(ids.map((id) => [id, s.athletes[id].teamId]));
    // every deal gets a length once the league's contracts first roll over
    leagueOffseasonMoves(s, new RNG(1));
    const withYears = ids.filter((id) => s.athletes[id] && s.athletes[id].contractYears !== undefined);
    expect(withYears.length).toBeGreaterThan(ids.length * 0.8);
    const signed = s.transactions.filter((t) => t.kind === 'signing');
    expect(signed.length).toBeGreaterThanOrEqual(1);
    expect(signed.some((t) => /signs a \d-year deal with|re-signs with/.test(t.text))).toBe(true);
    // some players ended up somewhere new, and nobody is on two teams or on none while listed on a roster
    const moved = ids.filter((id) => s.athletes[id] && s.athletes[id].teamId !== before.get(id));
    expect(moved.length).toBeGreaterThan(0);
    rostersWhole(s);
    // the user is never swept up in it
    expect(s.athletes[s.player.athleteId].teamId).toBe(s.career.teamId);
    expect(s.athletes[s.player.athleteId].contractYears).toBeUndefined();
  });

  it('shows the best players whose deals are up, so a free agent can see the competition', () => {
    const s = make(22);
    const rng = new RNG(22);
    playUntil(s, rng, (x) => x.career.level === 'pro' && x.career.phase === 'offseason' && !x.career.lifeEvent);
    for (const id of s.league.teamIds) for (const a of s.teams[id].rosterIds) s.athletes[a].contractYears = 1;
    const m = marketPreview(s, 6);
    expect(m).toHaveLength(6);
    for (let i = 1; i < m.length; i++) expect(m[i - 1].ovr).toBeGreaterThanOrEqual(m[i].ovr);
    expect(m.every((p) => p.asking >= 1_000_000 && p.id !== s.player.athleteId)).toBe(true);
    expect(m[0].ovr).toBe(Math.max(...s.league.teamIds.flatMap((t) => s.teams[t].rosterIds).filter((id) => id !== s.player.athleteId).map((id) => overall(s.athletes[id].ratings))));
  });

  it('a rival or friend whose deal is up always lands on a team', () => {
    for (let seed = 30; seed < 40; seed++) {
      const s = make(seed);
      const rng = new RNG(seed);
      playUntil(s, rng, (x) => x.career.level === 'pro' && x.career.phase === 'offseason' && !x.career.lifeEvent);
      const story = Object.values(s.npcs).filter((n) => n.active && n.athleteId && s.athletes[n.athleteId] && (n.role === 'rival' || n.role === 'friend'));
      for (const n of story) s.athletes[n.athleteId!].contractYears = 1;
      leagueOffseasonMoves(s, new RNG(seed));
      for (const n of story) {
        const a = s.athletes[n.athleteId!];
        expect(a, n.name).toBeDefined();
        expect(a.teamId).not.toBeNull();
        expect(s.teams[a.teamId!].rosterIds).toContain(a.id);
      }
      rostersWhole(s);
    }
  }, 30_000);

  it('trades only happen in the trade week', () => {
    const s = make(3);
    const rng = new RNG(3);
    playUntil(s, rng, (x) => x.career.level === 'pro' && x.career.phase === 'regular' && x.career.week === 1 && !x.career.lifeEvent);
    s.career.week = tradeWeek(s) + 2;
    const n = s.transactions.length;
    leagueInSeasonTrades(s, rng);
    expect(s.transactions.length).toBe(n);
    s.career.week = tradeWeek(s);
    leagueInSeasonTrades(s, rng);
    expect(s.transactions.length).toBeGreaterThan(n);
  });

  it('through a whole career the log stays bounded and every roster is whole', () => {
    const s = make(99);
    const rng = new RNG(99);
    let n = 0;
    while (s.career.phase !== 'retired' && n++ < 20000) {
      tick(s, rng, { moves: true });
      if (n % 40 === 0 && ['regular', 'playoffs', 'offseason', 'preseason'].includes(s.career.phase)) rostersWhole(s);
    }
    expect(s.transactions.length).toBeLessThanOrEqual(80);
    expect(s.transactions.length).toBeGreaterThan(20);
  });
});
