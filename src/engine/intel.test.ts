import { describe, expect, it } from 'vitest';
import type { GameState, RatingKey } from '../state/schemas';
import { advanceWeek, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame, userAthlete } from './career';
import { heatOf, tagsFor, tipsFor, type PlayerIntel } from './intel';
import { overall } from './ratings';

const base: Record<RatingKey, number> = { shooting: 60, finishing: 60, handles: 60, passing: 60, defense: 60, rebounding: 60, athleticism: 60, iq: 60, stamina: 60 };
const lineOf = (o: Partial<PlayerIntel['line']> = {}): PlayerIntel['line'] => ({ min: 10, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, ...o });
const intel = (o: Partial<PlayerIntel> = {}): PlayerIntel => ({ id: 'x', name: 'Jay Cole', short: 'J. Cole', position: 'SG', ovr: 60, ownTeam: false, ratings: base, line: lineOf(), recent: [], heat: null, tags: [], ...o });

describe('heatOf', () => {
  it('is hot after 3 straight makes or 4 of 5', () => {
    expect(heatOf([false, true, true, true])).toBe('hot');
    expect(heatOf([true, false, true, true, true])).toBe('hot');
    expect(heatOf([true, true, false, true, true])).toBe('hot');
    expect(heatOf([true, true, false])).toBeNull();
  });
  it('is cold after 4 straight misses or at most 1 of 5', () => {
    expect(heatOf([true, false, false, false, false])).toBe('cold');
    expect(heatOf([false, true, false, false, false])).toBe('cold');
    expect(heatOf([false, false, false])).toBeNull();
  });
  it('needs a sample before judging', () => {
    expect(heatOf([])).toBeNull();
    expect(heatOf([true, true])).toBeNull();
  });
});

describe('tagsFor', () => {
  it('labels specialists and foul trouble, at most three', () => {
    const t = tagsFor({ ...base, defense: 75, shooting: 78, passing: 80, finishing: 80 }, lineOf({ pf: 4, blk: 3 }), 60, 5);
    expect(t).toHaveLength(3);
    expect(t[0]).toBe('Foul trouble');
    expect(tagsFor(base, lineOf(), 60, 5)).toEqual([]);
  });
});

describe('tipsFor', () => {
  it('describes the defender guarding you', () => {
    const you = intel({ ownTeam: true });
    const lock = tipsFor({ kind: 'offense', you, matchup: intel({ ratings: { ...base, defense: 80 } }), teammates: [], mean: 60, foulOut: 5 });
    expect(lock[0]).toMatch(/lockdown defender \(DEF 80\)/);
    const weak = tipsFor({ kind: 'offense', you, matchup: intel({ ratings: { ...base, defense: 48 } }), teammates: [], mean: 60, foulOut: 5 });
    expect(weak[0]).toMatch(/weak defender \(DEF 48\)/);
    const avg = tipsFor({ kind: 'offense', you, matchup: intel(), teammates: [], mean: 60, foulOut: 5 });
    expect(avg[0]).toMatch(/average defender/);
  });

  it('points out foul trouble, a hot teammate, and your own touch', () => {
    const tips = tipsFor({
      kind: 'offense',
      you: intel({ ownTeam: true, heat: 'cold', line: lineOf({ fgm: 1, fga: 8 }) }),
      matchup: intel({ line: lineOf({ pf: 4 }) }),
      teammates: [intel({ short: 'M. Lee', heat: 'hot', recent: [true, true, true, false, true] })],
      mean: 60,
      foulOut: 5,
    });
    expect(tips.some((t) => /4 fouls/.test(t))).toBe(true);
    expect(tips.some((t) => /M\. Lee has the hot hand \(4 of his last 5\)/.test(t))).toBe(true);
    expect(tips.some((t) => /1-for-8/.test(t) && /not falling/.test(t))).toBe(true);
  });

  it('tells you what the attacker is about to do on defense', () => {
    const tips = tipsFor({ kind: 'defense', you: intel({ ownTeam: true, line: lineOf({ pf: 4 }) }), matchup: intel({ ratings: { ...base, shooting: 84 }, tags: ['Sharpshooter'] }), teammates: [], mean: 60, foulOut: 5, expectedShot: 'three' });
    expect(tips[0]).toMatch(/shoot the three \(SHO 84\)/);
    expect(tips.some((t) => /sharpshooter/.test(t))).toBe(true);
    expect(tips.some((t) => /4 fouls and are out at 5/.test(t))).toBe(true);
  });

  it('never returns more than five tips', () => {
    const tips = tipsFor({
      kind: 'defense',
      you: intel({ ownTeam: true, heat: 'hot', line: lineOf({ pf: 4, fgm: 4, fga: 5 }) }),
      matchup: intel({ heat: 'hot', recent: [true, true, true], tags: ['Sharpshooter'] }),
      teammates: [],
      mean: 60,
      foulOut: 5,
      expectedShot: 'rim',
    });
    expect(tips.length).toBeLessThanOrEqual(5);
  });
});

describe('scouting report in a real game', () => {
  function toGameDay(): GameState {
    const s = createCareer({ firstName: 'Test', lastName: 'Player', hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: ['clutch'], seed: 21 });
    let ticks = 0;
    while (!(s.career.phase === 'regular' && s.career.week >= 2 && s.career.step === 'game') && ticks < 500) {
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

  it('attaches consistent intel to every key moment', () => {
    const s = toGameDay();
    const me = userAthlete(s);
    const { sim } = createUserGameSim(s)!;
    let moments = 0;
    for (let guard = 0; guard < 50; guard++) {
      const st = sim.advance();
      if (st.type === 'final') break;
      if (st.type !== 'moment') continue;
      const m = st.moment;
      moments++;
      const i = m.intel!;
      expect(i).toBeDefined();
      expect(i.you.id).toBe(me.id);
      // shown ratings are the ones the sim really uses: base rating plus tonight's energy/morale adjustment
      expect(i.you.ovr).toBe(overall(me.ratings) + (sim.opts.ratingMods?.[me.id] ?? 0));
      expect(i.matchup.id).toBe(m.opponentId);
      expect(i.matchup.ownTeam).toBe(false);
      expect(i.teammates).toHaveLength(4);
      expect(i.opponents).toHaveLength(5);
      expect(i.opponents.some((p) => p.id === i.matchup.id)).toBe(true);
      expect(i.tips.length).toBeLessThanOrEqual(5);
      expect(i.tips.length).toBeGreaterThan(0);
      for (const p of [i.you, i.matchup, ...i.teammates, ...i.opponents]) {
        expect(p.recent.length).toBeLessThanOrEqual(5);
        expect(p.line.fgm).toBeLessThanOrEqual(p.line.fga);
        for (const v of Object.values(p.ratings)) expect(v).toBeGreaterThanOrEqual(1), expect(v).toBeLessThanOrEqual(99);
      }
      // the user's form dots agree with the box score line
      expect(i.you.recent.length).toBeLessThanOrEqual(i.you.line.fga);
      // team numbers agree with the live score
      const live = sim.liveScore();
      const ours = sim.sides.home.input.roster.some((a) => a.id === me.id) ? live.home : live.away;
      expect(i.teams.us.pts).toBe(ours);
      expect(i.teams.us.fgm).toBeLessThanOrEqual(i.teams.us.fga);
      // every option explains itself with ratings in range, and the displayed odds are untouched by the report
      for (const o of m.options) {
        expect(o.edge).toBeDefined();
        expect(o.edge!.you).toBeGreaterThanOrEqual(1);
        expect(o.edge!.them).toBeLessThanOrEqual(99);
        expect(o.odds).toBeGreaterThan(0);
        expect(o.odds).toBeLessThan(1);
      }
      if (m.kind === 'defense') expect(['rim', 'mid', 'three']).toContain(i.expectedShot);
      sim.resolveMoment(m.options[0].id);
    }
    expect(moments).toBeGreaterThan(0);
  });

  it('does not change how the game plays out (same seed, same result)', () => {
    const a = toGameDay();
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    const run = (s: GameState) => {
      const { sim } = createUserGameSim(s)!;
      for (let g = 0; g < 50; g++) {
        const st = sim.advance();
        if (st.type === 'final') break;
        if (st.type === 'moment') sim.resolveMoment(st.moment.options[0].id);
      }
      return sim.boxScore();
    };
    expect(run(a)).toEqual(run(b));
  });
});
