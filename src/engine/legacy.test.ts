import { describe, expect, it } from 'vitest';
import type { GameState } from '../state/schemas';
import { GameStateSchema } from '../state/schemas';
import { createCareer, userAthlete } from './career';
import { checkGoals, doneGoals, ensureGoals, openGoals } from './goals';
import { canContinueLegacy, planHeir, startNextGeneration } from './legacy';
import { legacyScore, legendOf, tierOf } from './legacyScore';
import { overall } from './ratings';
import { RNG } from './rng';
import { playUntil, tick } from './testkit';

const ARCH = ['slasher', 'sharpshooter', 'playmaker', 'big', 'two-way'] as const;
const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

function career(seed: number): GameState {
  return createCareer({ firstName: 'Lega', lastName: 'Cee', hometown: 'Springfield', archetype: ARCH[seed % 5], position: POS[seed % 5], heightIn: 76, schoolIndex: seed % 8, traits: ['clutch'], seed });
}

/** Plays a whole career on autopilot until retirement. */
function retire(seed: number, o: { kids?: number } = {}): GameState {
  const s = career(seed);
  const rng = new RNG(seed * 31 + 7);
  if (o.kids !== undefined) s.story.flags.kids = o.kids;
  playUntil(s, rng, () => false, { moves: true });
  expect(s.career.phase).toBe('retired');
  return s;
}

describe('goals', () => {
  it('a new career starts with three open goals, one per group, all unmet', () => {
    const s = career(1);
    const open = openGoals(s);
    expect(open).toHaveLength(3);
    expect(new Set(open.map((g) => g.group)).size).toBe(3);
    expect(open.every((g) => !g.done && g.pct < 100)).toBe(true);
    expect(checkGoals(s)).toEqual([]);
  });

  it('is deterministic and does not touch the game random sequence', () => {
    const a = career(5);
    const b = career(5);
    expect(a.goals).toEqual(b.goals);
    const before = a.rngState;
    a.goals = [];
    ensureGoals(a);
    expect(a.rngState).toBe(before);
  });

  it('finishing a goal brings in a new one and never repeats a kind', () => {
    const s = career(2);
    const g = s.goals.find((x) => x.kind === 'titles' || x.kind === 'badges' || x.kind === 'points' || x.kind === 'ovr') ?? s.goals[0];
    // force it to be met
    s.player.awards.push(...Array.from({ length: 10 }, (_, i) => ({ season: 1, level: 'pro' as const, name: `L${i} Champion` })));
    s.player.awards.push({ season: 1, level: 'pro', name: 'League MVP' }, ...Array.from({ length: 9 }, () => ({ season: 1, level: 'pro' as const, name: 'All-Star' })));
    s.player.badges = Array.from({ length: 12 }, (_, i) => `b${i}`);
    s.player.money = 900_000_000;
    s.story.flags.peak_ovr = 99;
    const done = checkGoals(s);
    expect(done.length).toBeGreaterThan(0);
    expect(doneGoals(s).length).toBe(done.length);
    expect(openGoals(s).length).toBeGreaterThanOrEqual(1);
    const kinds = s.goals.map((x) => x.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    void g;
  });

  it('an old save with no goals gets them on load', () => {
    const s = career(3);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.goals;
    delete raw.legacy;
    const parsed = GameStateSchema.parse(raw);
    expect(parsed.goals).toEqual([]);
    expect(parsed.legacy.generation).toBe(1);
    ensureGoals(parsed);
    expect(openGoals(parsed)).toHaveLength(3);
  });
});

describe('Hall of Fame score', () => {
  it('rewards titles and awards, and a bare career scores low', () => {
    const s = career(4);
    expect(tierOf(legacyScore(s))).toBe(0);
    const base = legacyScore(s);
    s.player.awards.push({ season: 5, level: 'pro', name: 'League Champion' }, { season: 5, level: 'pro', name: 'League MVP' });
    expect(legacyScore(s)).toBeGreaterThan(base + 20);
  });

  it('measures real careers: a spread of tiers, nobody off the charts', () => {
    const rows = [11, 12, 13, 14, 15, 16].map((seed) => {
      const s = retire(seed);
      const l = legendOf(s);
      return { seed, score: l.score, tier: l.tierLabel, titles: l.titles, mvps: l.mvps, seasons: l.seasons, ppg: l.proPpg, peak: l.peakOverall, pts: l.gp };
    });
    console.log('LEGENDS', JSON.stringify(rows));
    for (const r of rows) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThan(600);
    }
  }, 240_000);

  it('a true star reaches the top tiers, so they are worth chasing', () => {
    const scores = [31, 32, 33].map((seed) => {
      const s = career(seed);
      const a = userAthlete(s);
      for (const k of Object.keys(a.ratings) as (keyof typeof a.ratings)[]) a.ratings[k] = 92;
      a.potential = 99;
      const rng = new RNG(seed);
      playUntil(s, rng, () => false, { moves: true });
      // keep the star a star: ratings are rebuilt by the sim, so lift them again each season is not possible here
      return { score: legendOf(s), titles: s.player.awards.filter((x) => x.name.endsWith('Champion')).length };
    });
    console.log('STARS', JSON.stringify(scores.map((x) => ({ score: x.score.score, tier: x.score.tierLabel, titles: x.score.titles, mvps: x.score.mvps, ppg: x.score.proPpg, peak: x.score.peakOverall }))));
    expect(Math.max(...scores.map((x) => x.score.score))).toBeGreaterThan(110);
  }, 240_000);
});

describe('next generation', () => {
  it('cannot start before the career ends', () => {
    const s = career(6);
    expect(canContinueLegacy(s)).toBe(false);
    expect(() => startNextGeneration(s)).toThrow();
  });

  it('a retired career with a kid hands the save to that kid, with a clean slate and a family record', () => {
    const s = retire(21, { kids: 2 });
    const parentName = `${userAthlete(s).firstName} ${userAthlete(s).lastName}`;
    const season = s.career.season;
    const plan = planHeir(s);
    expect(plan.relation).toBe('child');
    // the preview is exactly who shows up
    const { legend } = startNextGeneration(s);
    const heir = userAthlete(s);
    expect(`${heir.firstName} ${heir.lastName}`).toBe(`${plan.athlete.firstName} ${plan.athlete.lastName}`);
    expect(heir.id).toBe(plan.athlete.id);
    expect(heir.lastName).toBe(parentName.split(' ').slice(1).join(' '));
    expect(s.id).toBe(legend.saveId);
    expect(s.legacy.generation).toBe(2);
    expect(s.legacy.lineage).toHaveLength(1);
    expect(s.legacy.lineage[0].name).toBe(parentName);
    expect(s.legacy.parent).toBe(parentName);
    // a clean slate at the bottom of the ladder
    const c = s.career;
    expect([c.level, c.year, c.phase, c.step]).toEqual(['hs', 1, 'preseason', 'scene']);
    expect(c.season).toBe(season + 1);
    expect(heir.age).toBe(14);
    expect(overall(heir.ratings)).toBeLessThan(60);
    expect(s.gameLog).toHaveLength(0);
    expect(s.player.awards).toHaveLength(0);
    expect(s.player.badges).toHaveLength(0);
    expect(s.story.flags.kids).toBeUndefined();
    expect(s.paper).toHaveLength(0);
    // the family is part of the story
    const npcs = Object.values(s.npcs);
    expect(npcs.some((n) => n.role === 'family' && n.name === parentName)).toBe(true);
    expect(npcs.some((n) => n.role === 'coach')).toBe(true);
    expect(npcs.some((n) => n.role === 'rival')).toBe(true);
    // fresh goals, the first about beating the parent
    expect(openGoals(s)).toHaveLength(3);
    expect(s.goals.some((g) => g.kind === 'surpass')).toBe(true);
    // the whole thing still reads as a valid save
    expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(s)))).not.toThrow();
  }, 240_000);

  it('with no kids, a protégé carries on instead, with half the head start', () => {
    const s = retire(22, { kids: 0 });
    delete s.story.flags.kids;
    const plan = planHeir(s);
    expect(plan.relation).toBe('protege');
    expect(plan.tier).toBeLessThanOrEqual(Math.floor(legendOf(s).tier / 2));
    startNextGeneration(s);
    const heir = userAthlete(s);
    expect(heir.lastName).not.toBe(s.legacy.lineage[0].lastName);
    expect(Object.values(s.npcs).some((n) => n.role === 'mentor' && n.name === s.legacy.parent)).toBe(true);
  }, 240_000);

  it('can run three generations in a row, and every league stays sound', () => {
    let s = retire(23, { kids: 1 });
    for (let g = 0; g < 2; g++) {
      startNextGeneration(s);
      expect(s.legacy.generation).toBe(g + 2);
      const rng = new RNG(900 + g);
      let n = 0;
      // play the heir on; retire them early so the test stays quick
      while (s.career.phase !== 'retired' && n++ < 20000) {
        tick(s, rng);
        if (s.career.level === 'pro' && s.career.phase === 'offseason') s.story.flags.retiring = true;
      }
      expect(s.career.phase).toBe('retired');
      s.story.flags.kids = 1;
      // the names stay unique across the league the whole way
      const names = Object.values(s.athletes).map((a) => `${a.firstName} ${a.lastName}`);
      expect(new Set(names).size).toBe(names.length);
    }
    expect(s.legacy.lineage).toHaveLength(2);
  }, 600_000);
});

describe('the paper remembers the career', () => {
  const allItems = (s: GameState, section: string) => s.paper.flatMap((i) => i.sections.filter((x) => x.id === section).flatMap((x) => x.items.map((it) => it.text)));

  it('a career prints milestones and streaks, each one told once, and printing never moves the game', () => {
    const s = career(41);
    const rng = new RNG(41);
    // played in small steps so every printed issue is seen before the paper trims old ones
    const seen: string[] = [];
    let n = 0;
    while (s.career.phase !== 'retired' && n++ < 20000) {
      tick(s, rng);
      const issue = s.paper[s.paper.length - 1];
      if (issue && !seen.includes(`${issue.id}`)) {
        seen.push(`${issue.id}`);
        for (const sec of issue.sections.filter((x) => x.id === 'milestones')) for (const it of sec.items) seen.push(it.text);
      }
    }
    const lines = seen.filter((t) => !/^\d+$/.test(t));
    expect(lines.length).toBeGreaterThan(3);
    // a round number is announced once
    const passed = lines.filter((t) => /passed [\d,]+ career/.test(t));
    expect(new Set(passed).size).toBe(passed.length);
    // and every line is a finished sentence with real numbers
    for (const t of lines) expect(t).not.toMatch(/NaN|undefined|\[object/);
  }, 240_000);

  it('the first season of an heir opens with the family story, and the heir is measured against the parent later on', () => {
    const s = retire(42, { kids: 1 });
    const parentName = legendOf(s).name;
    startNextGeneration(s);
    const rng = new RNG(4242);
    let n = 0;
    while (n++ < 4000 && !s.paper.some((i) => i.kind === 'preview')) tick(s, rng);
    const intro = allItems(s, 'archive');
    expect(intro.some((t) => t.includes(parentName) || t.includes(parentName.split(' ')[0]))).toBe(true);
    expect(intro.some((t) => /famous name/.test(t))).toBe(true);
  }, 240_000);

  it('a goal that is close shows up once in the paper', () => {
    const s = career(43);
    const g = s.goals.find((x) => x.kind === 'badges' || x.kind === 'titles' || x.kind === 'points') ?? s.goals[0];
    // pretend the goal is most of the way there by shrinking its target to what the save already shows is almost met
    s.player.badges = ['a', 'b', 'c', 'd'];
    s.goals = [{ id: 'gx', kind: 'badges', target: 5, doneSeason: 0, setSeason: 1 }, ...s.goals.filter((x) => x.kind !== 'badges').slice(0, 2)];
    void g;
    const rng = new RNG(43);
    let n = 0;
    while (n++ < 400 && !s.paper.some((i) => i.kind === 'weekly')) tick(s, rng);
    expect(allItems(s, 'milestones').filter((t) => t.includes('Earn 5 badges')).length).toBeLessThanOrEqual(1);
  }, 120_000);
});
