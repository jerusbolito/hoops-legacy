import { describe, expect, it } from 'vitest';
import type { Background, GameState, Motive, Origin } from '../state/schemas';
import { GameStateSchema } from '../state/schemas';
import { fullContext } from '../narrative/context';
import { pickScene } from '../narrative/scenes';
import { createCareer, doTraining, userAthlete, withRng } from './career';
import { weeklyPay } from './finance';
import { openGoals } from './goals';
import { lifeEventDefs, lifeEventView, lifeRefs, resolveLifeEvent } from './lifeEvents';
import { NEUTRAL, PARTS, modsOf, originWeight } from './origin';
import { planHeir, startNextGeneration } from './legacy';
import { overall } from './ratings';
import { RNG } from './rng';
import { playUntil } from './testkit';

const base = { firstName: 'Orin', lastName: 'Gin', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [] as string[], seed: 7 } as const;

function make(o: Partial<Origin> = {}, seed = 7): GameState {
  return createCareer({ ...base, archetype: 'slasher', seed, origin: { background: 'working', motive: 'love', temperament: 'steady', ...o } });
}
const bg = (b: Background, seed = 7) => make({ background: b }, seed);

describe('who you are: a start with a price', () => {
  it('a save that never chose an origin plays exactly as before', () => {
    const s = createCareer({ ...base, seed: 7 });
    expect(s.player.origin.chosen).toBe(false);
    expect(modsOf(s)).toBe(NEUTRAL);
    expect(originWeight(s, 'family_money')).toBe(1);
    // and an old save with no origin at all still loads
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.player.origin;
    expect(GameStateSchema.parse(raw).player.origin.chosen).toBe(false);
  });

  it('family background changes money, grades, standing and the first people in your story', () => {
    const rows = Object.fromEntries((['struggling', 'working', 'comfortable', 'athletic', 'wealthy'] as Background[]).map((b) => [b, bg(b)]));
    const coachTrust = (s: GameState) => Object.values(s.npcs).find((n) => n.role === 'coach')!.relationship.trust;
    // money in the bank and in the allowance
    expect(rows.wealthy.player.money).toBeGreaterThan(rows.comfortable.player.money);
    expect(rows.comfortable.player.money).toBeGreaterThan(rows.struggling.player.money);
    expect(weeklyPay(rows.wealthy).allowance).toBeGreaterThan(weeklyPay(rows.comfortable).allowance * 2);
    expect(weeklyPay(rows.struggling).allowance).toBeLessThan(weeklyPay(rows.working).allowance / 2);
    // grades
    expect(rows.comfortable.player.academics).toBeGreaterThan(rows.working.player.academics);
    // a head start
    expect(overall(userAthlete(rows.athletic).ratings)).toBeGreaterThan(overall(userAthlete(rows.working).ratings));
    expect(rows.athletic.player.reputation).toBeGreaterThan(rows.working.player.reputation);
    // a coach who trusts you, or doubts you
    expect(coachTrust(rows.athletic)).toBeGreaterThan(coachTrust(rows.working));
    expect(coachTrust(rows.wealthy)).toBeLessThan(coachTrust(rows.working));
    // and the parent in the story is not a stranger who shares your surname
    const parent = (s: GameState) => Object.values(s.npcs).find((n) => n.role === 'family')!;
    expect(parent(rows.struggling).title).toMatch(/doubles/);
    expect(parent(rows.athletic).title).toMatch(/former player/);
    expect(parent(rows.struggling).relationship.affinity).toBeGreaterThan(parent(rows.wealthy).relationship.affinity);
  });

  it('every choice has a price: nothing is a free upgrade', () => {
    // each option judged on its own numbers, so one choice cannot hide another's cost
    const hasCost = (p: Record<string, unknown>) => {
      const n = (k: string) => (p[k] as number | undefined) ?? (k.endsWith('Mul') || k === 'allowance' || k === 'gpaDrift' ? 1 : 0);
      return n('trainingMul') < 1 || n('moraleLossMul') > 1 || n('moraleGainMul') < 1 || n('allowance') < 1 || n('coachTrust') < 0 || n('coachRespect') < 0 || n('repGain') < 1 || n('chem') < 0 || n('jobEnergy') > 0 || n('followerMul') < 1 || n('relGain') < 1 || n('endorseMul') < 1 || n('leaveMorale') < 0;
    };
    for (const [kind, table] of Object.entries(PARTS)) {
      for (const [id, part] of Object.entries(table)) {
        // the plain working family is the baseline: it has no price because it has no head start
        if (id === 'working') continue;
        expect(hasCost(part as Record<string, unknown>), `${kind}/${id}`).toBe(true);
      }
    }
  });

  it('build moves ratings around without handing out free points', () => {
    const rating = (b: 'lean' | 'balanced' | 'strong') => userAthlete(make({ look: { skin: 3, hair: 0, style: 'short', build: b, number: 5 } })).ratings;
    const bal = rating('balanced');
    const lean = rating('lean');
    const strong = rating('strong');
    expect(lean.athleticism).toBeGreaterThan(bal.athleticism);
    expect(lean.rebounding).toBeLessThan(bal.rebounding);
    expect(strong.rebounding).toBeGreaterThan(bal.rebounding);
    expect(strong.athleticism).toBeLessThan(bal.athleticism);
    const sum = (r: typeof bal) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum(lean) - sum(bal))).toBeLessThanOrEqual(1);
    expect(Math.abs(sum(strong) - sum(bal))).toBeLessThanOrEqual(1);
  });

  it('training really works better for the hungry and worse for those with no hunger', () => {
    const gain = (b: Background) => {
      const s = bg(b);
      const before = Object.values(userAthlete(s).ratings).reduce((a, c) => a + c, 0) + Object.values(s.player.progress).reduce((a, c) => a + c, 0);
      for (let i = 0; i < 12; i++) {
        s.player.energy = 100;
        doTraining(s, 'shooting');
      }
      return Object.values(userAthlete(s).ratings).reduce((a, c) => a + c, 0) + Object.values(s.player.progress).reduce((a, c) => a + c, 0) - before;
    };
    expect(gain('struggling')).toBeGreaterThan(gain('wealthy'));
  });

  it('who you are changes how a loss lands', () => {
    const lose = (o: Partial<Origin>) => {
      const s = make(o);
      s.player.morale = 80;
      const m = modsOf(s);
      return Math.round(-4 * m.moraleLossMul);
    };
    expect(lose({ temperament: 'steady' })).toBeGreaterThan(lose({ temperament: 'fiery' }));
    expect(lose({ background: 'athletic' })).toBeLessThan(lose({ background: 'working' }));
  });
});

describe('who you are: it shows in the story', () => {
  it('the events that fit your life come around more, and the ones that do not, less', () => {
    expect(originWeight(bg('struggling'), 'family_money')).toBeGreaterThan(3);
    expect(originWeight(bg('wealthy'), 'family_money')).toBeLessThan(0.2);
    expect(originWeight(make({ motive: 'prove' }), 'doubter')).toBeGreaterThan(3);
    expect(originWeight(make({ temperament: 'fiery' }), 'temper_flare')).toBeGreaterThan(3);
  });

  it('the new moments exist, read well, and every choice resolves', () => {
    const ids = ['rent_notice', 'second_job', 'rich_kid_label', 'private_gym_offer', 'parent_film_session', 'family_comparison', 'college_fund_talk', 'doubter', 'provide_ask', 'family_set', 'old_court', 'fame_dm', 'temper_flare', 'loyal_call', 'charm_offensive', 'lone_wolf_night'];
    const defs = lifeEventDefs();
    for (const id of ids) expect(defs.some((d) => d.id === id), id).toBe(true);
    const s = make({ background: 'struggling', motive: 'provide', temperament: 'loyal' });
    playUntil(s, new RNG(3), (x) => x.career.phase === 'regular' && x.career.week >= 3 && !x.career.lifeEvent);
    const refs = lifeRefs(s);
    for (const id of ids) {
      const d = defs.find((x) => x.id === id)!;
      if (!d.levels.includes(s.career.level) || (d.need ?? []).some((r) => !refs[r])) continue;
      const st = structuredClone(s);
      st.player.money = 5_000_000;
      st.career.lifeEvent = { id, seed: 5, refs };
      const view = lifeEventView(st)!;
      expect(view.text, id).not.toMatch(/undefined|NaN|\[object/);
      for (const o of view.options) {
        const t = structuredClone(st);
        const out = withRng(t, (rng) => resolveLifeEvent(t, rng, o.id));
        expect(out, `${id}/${o.id}`).not.toBeNull();
        expect(out!.text + out!.lines.join(' ')).not.toMatch(/undefined|NaN|\[object/);
      }
    }
  }, 60_000);

  it('the narrator is told who the player is, and old saves are left alone', () => {
    const s = make({ background: 'struggling', motive: 'prove', temperament: 'fiery', look: { skin: 5, hair: 1, style: 'braids', build: 'lean', number: 23 } });
    const ctx = fullContext(s, []);
    expect(ctx).toContain('WHO THE PLAYER IS');
    expect(ctx).toMatch(/double shifts/);
    expect(ctx).toMatch(/doubters/);
    expect(ctx).toMatch(/fiery/);
    expect(ctx).toMatch(/number 23/);
    expect(fullContext(createCareer({ ...base, seed: 7 }), [])).not.toContain('WHO THE PLAYER IS');
  });

  it('the opening scene is told with who the player is in mind', () => {
    const s = make({ background: 'wealthy' });
    const plan = withRng(s, (r) => pickScene(s, r));
    expect(plan.kind).toBe('season_opener');
    expect(plan.brief).toMatch(/WHO THE PLAYER IS/);
    expect(plan.brief).toMatch(/Opening scene/);
  });

  it('why you play sets your first goal', () => {
    const first = (m: Motive) => openGoals(make({ motive: m })).map((g) => g.kind);
    expect(first('prove')).toContain('rival');
    expect(first('provide')).toContain('money');
    expect(first('fame')).toContain('followers');
    expect(first('love')).toContain('ovr');
  });
});

describe('who you are: it carries on to the next generation', () => {
  it('an heir has a derived origin, a matching start, and an opening scene that is theirs', () => {
    const s = make({ background: 'athletic', motive: 'fame', temperament: 'charming' }, 12);
    s.story.flags.kids = 1;
    playUntil(s, new RNG(12), () => false, { moves: true });
    expect(s.career.phase).toBe('retired');
    const plan = planHeir(s);
    expect(plan.origin.chosen).toBe(true);
    expect(plan.origin.motive).toBe('legacy');
    startNextGeneration(s);
    expect(s.player.origin.motive).toBe('legacy');
    // the preview is the real start
    expect(overall(userAthlete(s).ratings)).toBe(overall(plan.athlete.ratings));
    expect(openGoals(s).some((g) => g.kind === 'surpass')).toBe(true);
    const scene = withRng(s, (r) => pickScene(s, r));
    expect(scene.brief).toMatch(/new generation/);
    expect(scene.brief).not.toMatch(/the pros/);
    expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(s)))).not.toThrow();
  }, 240_000);
});

describe('who you are: every combination plays a whole career', () => {
  it('no mix of choices breaks a career, and none runs away with it', () => {
    const combos: Partial<Origin>[] = [
      { background: 'struggling', motive: 'provide', temperament: 'loyal' },
      { background: 'wealthy', motive: 'fame', temperament: 'charming' },
      { background: 'athletic', motive: 'prove', temperament: 'fiery' },
      { background: 'comfortable', motive: 'love', temperament: 'loner' },
    ];
    const peaks = combos.map((o, i) => {
      const s = make(o, 30 + i);
      playUntil(s, new RNG(30 + i), () => false, { moves: true });
      expect(s.career.phase, JSON.stringify(o)).toBe('retired');
      expect(Number.isFinite(s.player.money) && s.player.money >= 0).toBe(true);
      expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(s)))).not.toThrow();
      return overall(userAthlete(s).ratings);
    });
    // nobody ends up wildly better or worse because of the start alone
    expect(Math.max(...peaks) - Math.min(...peaks)).toBeLessThan(30);
  }, 300_000);
});
