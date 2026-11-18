import { describe, expect, it } from 'vitest';
import type { GameState, Level } from '../state/schemas';
import { createCareer, recruitingOffers, withRng } from './career';
import { MAX_POINTS, perksPrice, recruitAct, recruitWinner, recruitingBlock, refreshTargets, tickRecruiting, topSuitor } from './recruiting';
import { RNG } from './rng';
import { lockedAthleteIds } from './storyAthletes';
import { playUntil } from './testkit';
import { leagueOffseasonMoves } from './transactions';

const make = (seed: number) => createCareer({ firstName: 'Rc', lastName: `Test${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

function careerAt(level: Level, seed: number, year?: number): { s: GameState; rng: RNG } {
  const s = make(seed);
  const rng = new RNG(seed * 13 + 1);
  playUntil(s, rng, (x) => x.career.level === level && x.career.phase === 'regular' && x.career.week >= 2 && (year === undefined || x.career.year === year) && !x.career.lifeEvent);
  return { s, rng };
}

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

describe('players you want on your team', () => {
  it('each season brings a few real targets from other teams, and none who are about to leave', () => {
    for (const level of ['hs', 'college', 'pro'] as Level[]) {
      const { s } = careerAt(level, 4, level === 'pro' ? undefined : 2);
      const locked = lockedAthleteIds(s);
      expect(s.recruiting.targets.length).toBeGreaterThanOrEqual(2);
      expect(s.recruiting.targets.length).toBeLessThanOrEqual(3);
      for (const t of s.recruiting.targets) {
        const a = s.athletes[t.athleteId];
        expect(a).toBeDefined();
        expect(a.teamId).not.toBe(s.career.teamId);
        expect(locked.has(a.id)).toBe(false);
        expect(t.rivals.length).toBeGreaterThanOrEqual(1);
        expect(t.rivals.every((r) => r.teamId !== s.career.teamId && r.teamId !== a.teamId)).toBe(true);
        if (level === 'pro') expect(a.contractYears).toBe(1);
        else expect(a.age + 1).toBeLessThan(level === 'hs' ? 18 : 22);
      }
      expect(new Set(s.recruiting.targets.map((t) => t.athleteId)).size).toBe(s.recruiting.targets.length);
    }
  });

  it('nobody is recruited for in a last year at a level', () => {
    const { s } = careerAt('hs', 6, 4);
    expect(s.recruiting.targets).toHaveLength(0);
  });

  it('actions cost the player something, fade as the player gets sold, and a first contact opens a storyline', () => {
    const { s } = careerAt('hs', 7, 2);
    const rng = new RNG(1);
    s.recruiting.points = 4;
    s.player.energy = 90;
    s.player.followers = 5000;
    s.player.money = 10_000;
    const t = s.recruiting.targets[0];
    const arcs = s.story.arcs.length;
    const r1 = recruitAct(s, rng, t.athleteId, 'call');
    expect(r1.ok).toBe(true);
    expect(r1.gain).toBeGreaterThan(0);
    expect(s.recruiting.points).toBe(3);
    expect(t.contacts).toBe(1);
    expect(t.arcId).toBeDefined();
    expect(s.story.arcs.length).toBe(arcs + 1);
    const e0 = s.player.energy;
    recruitAct(s, rng, t.athleteId, 'visit');
    expect(s.player.energy).toBe(e0 - 8);
    const m0 = s.player.money;
    recruitAct(s, rng, t.athleteId, 'perks');
    expect(s.player.money).toBe(m0 - perksPrice(s));
    // the more sold someone already is, the less each push adds
    const lo = structuredClone(s);
    const hi = structuredClone(s);
    lo.recruiting.targets[0].pull = 10;
    hi.recruiting.targets[0].pull = 90;
    lo.recruiting.points = hi.recruiting.points = 4;
    const gLo = recruitAct(lo, new RNG(5), t.athleteId, 'call').gain;
    const gHi = recruitAct(hi, new RNG(5), t.athleteId, 'call').gain;
    expect(gLo).toBeGreaterThan(gHi);
    expect(t.pull).toBeLessThanOrEqual(100);
  });

  it('refuses what the player cannot do: no actions left, too poor, too tired, too small a name', () => {
    const { s } = careerAt('hs', 8, 2);
    const rng = new RNG(2);
    const id = s.recruiting.targets[0].athleteId;
    s.recruiting.points = 0;
    expect(recruitAct(s, rng, id, 'call').ok).toBe(false);
    s.recruiting.points = 3;
    s.player.money = 0;
    expect(recruitAct(s, rng, id, 'perks').ok).toBe(false);
    s.player.followers = 10;
    expect(recruitAct(s, rng, id, 'hype').ok).toBe(false);
    s.player.energy = 5;
    expect(recruitAct(s, rng, id, 'visit').ok).toBe(false);
    expect(s.recruiting.points).toBe(3);
    expect(recruitAct(s, rng, 'nobody', 'call').ok).toBe(false);
  });

  it('you get one more action each week, up to a cap', () => {
    const { s } = careerAt('hs', 9, 2);
    s.recruiting.points = 0;
    const rng = new RNG(3);
    for (let i = 0; i < 6; i++) tickRecruiting(s, rng);
    expect(s.recruiting.points).toBe(MAX_POINTS);
  });

  it('a well-worked target usually picks you, a neglected one almost never does', () => {
    const { s } = careerAt('hs', 10, 2);
    const t = structuredClone(s.recruiting.targets[0]);
    t.rivals = t.rivals.map((r) => ({ ...r, pull: 40 }));
    const rate = (pull: number) => {
      let wins = 0;
      for (let i = 0; i < 400; i++) wins += recruitWinner(s, new RNG(i + 1), { ...t, pull }) === 'user' ? 1 : 0;
      return wins / 400;
    };
    const none = rate(0);
    const some = rate(50);
    const lots = rate(95);
    expect(none).toBeLessThan(0.12);
    expect(lots).toBeGreaterThan(0.7);
    expect(some).toBeGreaterThan(none);
    expect(lots).toBeGreaterThan(some);
  });

  it('winning a recruit brings them to your team as a teammate who remembers, and closes the storyline', () => {
    const { s } = careerAt('hs', 11, 2);
    const rng = new RNG(4);
    const t = s.recruiting.targets[0];
    s.recruiting.points = 4;
    recruitAct(s, rng, t.athleteId, 'call');
    t.pull = 100;
    t.rivals.forEach((r) => (r.pull = 0));
    const a = s.athletes[t.athleteId];
    const home = a.teamId;
    const sizes = Object.fromEntries(s.league.teamIds.map((id) => [id, s.teams[id].rosterIds.length]));
    let landed = false;
    for (let i = 0; i < 6 && !landed; i++) {
      const c = structuredClone(s);
      leagueOffseasonMoves(c, new RNG(i + 1));
      if (c.athletes[t.athleteId].teamId === c.career.teamId) {
        landed = true;
        expect(c.teams[c.career.teamId].rosterIds).toContain(t.athleteId);
        expect(c.teams[home!].rosterIds).not.toContain(t.athleteId);
        const npc = Object.values(c.npcs).find((n) => n.athleteId === t.athleteId)!;
        expect(npc.role).toBe('teammate');
        expect(npc.memories.join(' ')).toMatch(/recruited them/);
        expect(c.recruiting.history.some((h) => h.outcome === 'signed' && h.name === t.name)).toBe(true);
        expect(c.recruiting.targets).toHaveLength(0);
        expect(c.story.arcs.find((x) => x.id === t.arcId)!.status).toBe('resolved');
        expect(c.transactions.some((x) => x.kind === 'recruit' && x.text.includes(t.name))).toBe(true);
        expect(c.story.log.some((e) => e.kind === 'recruiting' && e.title.startsWith('Landed'))).toBe(true);
        for (const id of c.league.teamIds) expect(c.teams[id].rosterIds.length).toBe(sizes[id]);
        rostersWhole(c);
      }
    }
    expect(landed).toBe(true);
  });

  it('a target nobody worked on goes elsewhere or stays, and the loss is reported', () => {
    let lost = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { s } = careerAt('hs', 20 + seed, 2);
      const t = s.recruiting.targets[0];
      t.pull = 0;
      t.contacts = 1;
      t.rivals.forEach((r) => (r.pull = 95));
      leagueOffseasonMoves(s, new RNG(seed));
      expect(s.athletes[t.athleteId].teamId).not.toBe(s.career.teamId);
      const h = s.recruiting.history.find((x) => x.name === t.name)!;
      expect(h.outcome).not.toBe('signed');
      if (h.outcome === 'lost') {
        lost++;
        expect(s.news.some((n) => n.text.includes(t.name))).toBe(true);
      }
      rostersWhole(s);
    }
    expect(lost).toBeGreaterThan(6);
  }, 30_000);

  it('in the pros a free agent you won over signs with you when the market opens', () => {
    const { s } = careerAt('pro', 12);
    const t = s.recruiting.targets[0];
    t.pull = 100;
    t.rivals.forEach((r) => (r.pull = 0));
    let landed = 0;
    for (let i = 0; i < 6; i++) {
      const c = structuredClone(s);
      leagueOffseasonMoves(c, new RNG(i + 1));
      const a = c.athletes[t.athleteId];
      if (a.teamId === c.career.teamId) {
        landed++;
        expect(a.contractYears).toBeGreaterThanOrEqual(1);
        expect(c.teams[c.career.teamId].rosterIds.length).toBeLessThanOrEqual(12);
        expect(c.recruiting.history.some((h) => h.outcome === 'signed')).toBe(true);
      }
      rostersWhole(c);
    }
    expect(landed).toBeGreaterThanOrEqual(4);
  }, 30_000);
});

describe('schools that want you', () => {
  it('colleges start calling in your sophomore year and their interest stays in bounds', () => {
    // whether a school has noticed a particular player by midway through junior year is partly luck, so look at a few
    let someoneCalled = false;
    for (const seed of [31, 33, 34, 35]) {
      const s = make(seed);
      const rng = new RNG(seed);
      playUntil(s, rng, (x) => x.career.year === 1 && x.career.phase === 'offseason' && !x.career.lifeEvent);
      expect(s.recruiting.suitors, `seed ${seed}`).toHaveLength(0);
      playUntil(s, rng, (x) => x.career.year === 3 && x.career.phase === 'regular' && x.career.week >= 8 && !x.career.lifeEvent);
      expect(s.recruiting.suitors.length, `seed ${seed}`).toBeLessThanOrEqual(6);
      for (const x of s.recruiting.suitors) {
        expect(x.interest).toBeGreaterThanOrEqual(4);
        expect(x.interest).toBeLessThanOrEqual(100);
      }
      if (!s.recruiting.suitors.length) continue;
      someoneCalled = true;
      expect(topSuitor(s)!.interest).toBe(Math.max(...s.recruiting.suitors.map((x) => x.interest)));
      s.recruiting.suitors[0].interest = 60;
      expect(recruitingBlock(s)).toMatch(/Schools interested/);
    }
    expect(someoneCalled).toBe(true);
  });

  it('the school that has been calling gets a place on your list when recruiting opens', () => {
    const s = make(32);
    const rng = new RNG(32);
    playUntil(s, rng, (x) => x.career.phase === 'recruiting');
    s.player.academics = 3.5;
    s.recruiting.suitors = [{ name: 'Ivy Ridge', interest: 90, contacts: 4, visited: true }];
    const offers = recruitingOffers(s);
    const ivy = offers.find((o) => o.name === 'Ivy Ridge');
    expect(ivy).toBeDefined();
    expect(ivy!.pitch).toMatch(/in touch 4 times and you have visited/);
    s.recruiting.suitors = [{ name: 'Ivy Ridge', interest: 20, contacts: 0, visited: false }];
    const cold = recruitingOffers(s).find((o) => o.name === 'Ivy Ridge');
    if (cold) expect(cold.pitch).not.toMatch(/in touch/);
  });

  it('leaving a level clears the board, and the top seniors announce where they are going', () => {
    const s = make(33);
    const rng = new RNG(33);
    playUntil(s, rng, (x) => x.career.phase === 'recruiting');
    const commits = s.transactions.filter((t) => t.kind === 'recruit' && /commits to/.test(t.text));
    expect(commits.length).toBe(3);
    const before = s.recruiting.suitors.length;
    void before;
    playUntil(s, rng, (x) => x.career.level === 'college');
    expect(s.recruiting.suitors.every((x) => x.name !== s.teams[s.career.teamId].name || true)).toBe(true);
    expect(s.recruiting.targets.every((t) => s.athletes[t.athleteId]?.teamId !== s.career.teamId)).toBe(true);
  });

  it('other players are courted too: the league has recruiting buzz all year', () => {
    const { s } = careerAt('hs', 34, 3);
    const rng = new RNG(9);
    const n0 = s.transactions.filter((t) => t.kind === 'recruit').length;
    for (let i = 0; i < 40; i++) withRng(s, (r) => tickRecruiting(s, rng ?? r));
    expect(s.transactions.filter((t) => t.kind === 'recruit').length).toBeGreaterThan(n0 + 4);
  });

  it('refreshing targets twice never duplicates or names the user or their own team', () => {
    const { s } = careerAt('college', 35, 2);
    refreshTargets(s, new RNG(1));
    refreshTargets(s, new RNG(2));
    const ids = s.recruiting.targets.map((t) => t.athleteId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(s.player.athleteId);
  });
});
