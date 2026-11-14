import { describe, expect, it } from 'vitest';
import type { GameState, Npc } from '../state/schemas';
import { reactionsFrom } from '../ui/components/reactions';
import { careerTimeline, seasonStory, shotZones, zoneOf, ZONES } from './analytics';
import { advanceWeek, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame } from './career';
import type { PlayEvent } from './gameSim';
import { calloutFor, lineScore, userStreak } from './liveStats';

const ev = (o: Partial<PlayEvent>): PlayEvent => ({ quarter: 1, clock: 300, side: 'home', text: '', home: 0, away: 0, ...o });

describe('zoneOf', () => {
  it('maps simulator coordinates to the right zone', () => {
    expect(zoneOf(0.5, 0.05)).toBe('rim');
    expect(zoneOf(0.5, 0.3)).toBe('midC');
    expect(zoneOf(0.5, 0.54)).toBe('top');
    // straight out to the sides along the baseline = corner threes
    expect(zoneOf(0.5 - 0.54 * 0.95, 0.001)).toBe('cornerL');
    expect(zoneOf(0.5 + 0.54 * 0.95, 0.001)).toBe('cornerR');
    const a = (deg: number, r: number) => zoneOf(0.5 + Math.sin((deg * Math.PI) / 180) * r * 0.95, Math.cos((deg * Math.PI) / 180) * r);
    expect(a(-40, 0.54)).toBe('wingL');
    expect(a(40, 0.54)).toBe('wingR');
    expect(a(-60, 0.3)).toBe('midL');
    expect(a(60, 0.3)).toBe('midR');
  });

  it('covers every point the simulator can produce', () => {
    const ids = new Set(ZONES.map((z) => z.id));
    for (let ang = -90; ang <= 90; ang += 3) {
      for (const r of [0.02, 0.12, 0.22, 0.42, 0.5, 0.58]) {
        const x = 0.5 + Math.sin((ang * Math.PI) / 180) * r * 0.95;
        const y = Math.cos((ang * Math.PI) / 180) * r;
        expect(ids.has(zoneOf(x, y))).toBe(true);
      }
    }
  });
});

describe('live game helpers', () => {
  it('calls out only plays the user was part of', () => {
    expect(calloutFor(ev({ user: true, text: 'Smith jumps the passing lane — steal!' }))?.text).toBe('STEAL!');
    expect(calloutFor(ev({ user: true, text: 'Smith SENDS IT BACK on Jones!' }))?.text).toBe('REJECTED!');
    expect(calloutFor(ev({ user: true, text: 'Smith drills a three', shot: { x: 0.5, y: 0.5, made: true, user: true } }))?.text).toBe('FROM DEEP!');
    expect(calloutFor(ev({ user: true, text: 'Smith throws it down — and one!', shot: { x: 0.5, y: 0.05, made: true, user: true } }))?.text).toBe('AND ONE!');
    // someone else's dunk, an assist, and a plain layup get nothing
    expect(calloutFor(ev({ user: false, text: 'Jones throws it down', shot: { x: 0.5, y: 0.05, made: true, user: false } }))).toBeNull();
    expect(calloutFor(ev({ user: true, text: 'Lee lays it in (Smith ast)', shot: { x: 0.5, y: 0.05, made: true, user: false } }))).toBeNull();
    expect(calloutFor(ev({ user: true, text: 'Smith lays it in', shot: { x: 0.5, y: 0.05, made: true, user: true } }))).toBeNull();
  });

  it('builds a line score that sums to the running score', () => {
    const feed = [ev({ quarter: 1, home: 2, away: 0 }), ev({ quarter: 1, home: 2, away: 3 }), ev({ quarter: 2, home: 5, away: 3 }), ev({ quarter: 2, home: 5, away: 5 })];
    const ls = lineScore(feed);
    expect(ls.quarters).toEqual([1, 2]);
    expect(ls.home).toEqual([2, 3]);
    expect(ls.away).toEqual([3, 2]);
    expect(lineScore([]).quarters).toEqual([]);
  });

  it('detects hot and cold streaks from the user’s own shots only', () => {
    const shot = (made: boolean, user = true) => ev({ shot: { x: 0.5, y: 0.3, made, user } });
    expect(userStreak([shot(true), shot(true), shot(true)])).toBe('hot');
    expect(userStreak([shot(true), shot(true), shot(false)])).toBeNull();
    expect(userStreak([shot(false), shot(false), shot(false), shot(false)])).toBe('cold');
    expect(userStreak([shot(true, false), shot(true, false), shot(true, false)])).toBeNull();
  });
});

describe('reactions', () => {
  const npc = (id: string, name: string) => ({ id, name }) as Npc;
  it('turns applied effects into moods and badges', () => {
    const cast = [npc('a', 'Maya Reyes'), npc('b', 'Coach Dre')];
    const r = reactionsFrom(['Maya Reyes: affinity +6', 'Maya Reyes: trust +3', 'Coach Dre: rivalry +5', 'Coach Dre: affinity -4', 'Reputation +2'], cast);
    expect(r.a.mood).toBe('happy');
    expect(r.a.chips.every((c) => c.good)).toBe(true);
    expect(r.b.mood).toBe('angry');
    expect(r.b.chips.every((c) => !c.good)).toBe(true);
  });
  it('ignores lines it does not understand and unknown names', () => {
    expect(reactionsFrom(['Nobody: affinity +9', 'Met Someone', 'morale +3'], [npc('a', 'Maya Reyes')])).toEqual({});
  });
  it('keeps the usual mood for small changes', () => {
    const r = reactionsFrom(['Maya Reyes: affinity +1'], [npc('a', 'Maya Reyes')]);
    expect(r.a.mood).toBeUndefined();
    expect(r.a.chips).toHaveLength(1);
  });
});

describe('shots in real games', () => {
  function playSeason(): GameState {
    const s = createCareer({ firstName: 'Test', lastName: 'Player', hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: ['clutch'], seed: 7 });
    let ticks = 0;
    while (s.career.season === 1 && s.career.phase !== 'offseason' && ticks < 3000) {
      const c = s.career;
      if (c.step === 'training') (c.phase === 'offseason' ? doSummerTraining(s, ['shooting']) : doTraining(s, s.player.energy < 40 ? 'rest' : 'shooting'));
      else if (c.step === 'scene') completeScene(s);
      else if (c.step === 'game') {
        const g = createUserGameSim(s)!;
        g.sim.runToEnd();
        finishUserGame(s, g.sim, g.game);
      } else advanceWeek(s);
      ticks++;
    }
    return s;
  }

  it('records the user’s shots, matching the box score, and feeds the zone chart, season story and timeline', () => {
    const s = playSeason();
    const played = s.gameLog.filter((e) => e.line.sec > 0);
    expect(played.length).toBeGreaterThan(5);
    for (const e of played) {
      expect(e.shots.filter((x) => x.m).length).toBe(e.line.fgm);
      expect(e.shots.length).toBe(e.line.fga);
    }
    const z = shotZones(played);
    expect(z.total).toBe(played.reduce((a, e) => a + e.line.fga, 0));
    expect(z.zones.reduce((a, x) => a + x.att, 0)).toBe(z.total);
    expect(z.zones.reduce((a, x) => a + x.made, 0)).toBe(played.reduce((a, e) => a + e.line.fgm, 0));

    const story = seasonStory(s, 1);
    expect(story.form.length).toBe(played.length);
    expect(story.longestWinStreak).toBeGreaterThanOrEqual(0);

    const tl = careerTimeline(s);
    expect(tl.length).toBeGreaterThanOrEqual(1);
    expect(tl[0].season).toBe(1);
    expect(tl[tl.length - 1].isCurrent).toBe(true);
  });

  it('shows a departed senior on the timeline once the next season starts', () => {
    const s = playSeason();
    const senior = Object.values(s.npcs).find((n) => n.role === 'teammate')!;
    senior.active = false;
    senior.title = 'Former teammate (graduated after season 1)';
    const tl = careerTimeline(s);
    expect(tl.find((t) => t.season === 1)!.departures).toContain(senior.name);
  });
});
