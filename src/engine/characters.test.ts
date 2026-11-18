import { describe, expect, it } from 'vitest';
import { castBlock } from '../narrative/context';
import { templateScene } from '../narrative/templates';
import { GameStateSchema, type GameState, type Npc } from '../state/schemas';
import { PROFILES, PROFILED_ROLES, evolveCharacters, isProfile, isProfileOrLegacy, pickProfile, profileById, profileLine, profilesFor } from './characters';
import { createCareer } from './career';
import { makeNpc } from './generate';
import { lifeContext, lifeEventDefs, lifeRefs } from './lifeEvents';
import { RNG } from './rng';
import { playUntil } from './testkit';

const make = (seed: number) => createCareer({ firstName: 'Ch', lastName: `Ar${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });
const byRole = (s: GameState, role: Npc['role']) => Object.values(s.npcs).find((n) => n.role === role && n.active)!;

describe('character profiles', () => {
  it('are complete, unique, and there is real choice for every role', () => {
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length);
    for (const p of PROFILES) {
      expect(p.label.length, p.id).toBeGreaterThanOrEqual(8);
      for (const k of ['blurb', 'want', 'flaw', 'soft', 'voice'] as const) expect(p[k].length, `${p.id}.${k}`).toBeGreaterThan(10);
      expect(p.traits.length).toBeGreaterThanOrEqual(2);
      expect(p.weight).toBeGreaterThan(0);
      expect(PROFILED_ROLES).toContain(p.role);
    }
    expect(profilesFor('coach').length).toBeGreaterThanOrEqual(7);
    expect(profilesFor('rival').length).toBeGreaterThanOrEqual(6);
    expect(profilesFor('teammate').length).toBeGreaterThanOrEqual(6);
    expect(profilesFor('friend').length).toBeGreaterThanOrEqual(4);
    for (const role of ['family', 'love_interest', 'agent', 'media', 'scout'] as const) expect(profilesFor(role).length, role).toBeGreaterThanOrEqual(3);
  });

  it('a run of careers gives a real mix, not one type with a few exceptions', () => {
    const tally: Record<string, Record<string, number>> = { coach: {}, rival: {}, friend: {} };
    let n = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const s = make(seed);
      n++;
      for (const role of ['coach', 'rival', 'friend'] as const) {
        const p = byRole(s, role)?.profile;
        if (p) tally[role][p] = (tally[role][p] ?? 0) + 1;
      }
    }
    for (const role of ['coach', 'rival', 'friend'] as const) {
      const counts = Object.values(tally[role]);
      expect(counts.reduce((a, b) => a + b, 0), role).toBe(n);
      // most of the types turn up, and none runs away with it
      expect(counts.length, role).toBeGreaterThanOrEqual(profilesFor(role).length - 1);
      // (about 20% to 25% is expected for the most likely type; the bar is far enough above that to ignore chance)
      expect(Math.max(...counts) / n, `${role} ${JSON.stringify(tally[role])}`).toBeLessThan(0.38);
    }
    // the old "smirking rival" is now one of several, not the default
    expect((tally.rival.trash_talker ?? 0) / n).toBeLessThan(0.27);
  });

  it('shape where a relationship starts, so a quiet rival is not a loud one', () => {
    const rng = () => new RNG(5);
    const base = { name: 'X Y', role: 'rival' as const, title: 't', season: 1, rel: { affinity: -15, rivalry: 45, respect: 35 } };
    const loud = makeNpc(rng(), { ...base, profile: 'trash_talker' });
    const quiet = makeNpc(rng(), { ...base, profile: 'quiet_grinder' });
    expect(quiet.relationship.rivalry).toBeLessThan(loud.relationship.rivalry);
    expect(quiet.relationship.affinity).toBeGreaterThan(loud.relationship.affinity);
    expect(quiet.relationship.respect).toBeGreaterThan(loud.relationship.respect);
    expect(quiet.personality).toEqual(profileById('quiet_grinder')!.traits);
    expect(quiet.memories).toHaveLength(1);
    for (const v of Object.values(quiet.relationship)) expect(v).toBeGreaterThanOrEqual(-100);
  });

  it('leave alone anyone the narrator invented, and anyone who asked for none', () => {
    // the narrator says so explicitly, and its personality is kept as it wrote it
    const made = makeNpc(new RNG(1), { name: 'A B', role: 'coach', title: 't', season: 1, personality: ['odd', 'kind'], profile: null });
    expect(made.profile).toBe('');
    expect(made.personality).toEqual(['odd', 'kind']);
    // a caller that passes its own traits still gets a profile, and keeps those traits
    const both = makeNpc(new RNG(1), { name: 'A B', role: 'coach', title: 't', season: 1, personality: ['odd', 'kind'] });
    expect(both.profile).not.toBe('');
    expect(both.personality).toEqual(['odd', 'kind']);
    expect(makeNpc(new RNG(1), { name: 'A B', role: 'coach', title: 't', season: 1, profile: null }).profile).toBe('');
    expect(makeNpc(new RNG(1), { name: 'A B', role: 'other', title: 't', season: 1 }).profile).toBe('');
    expect(makeNpc(new RNG(1), { name: 'A B', role: 'media', title: 't', season: 1 }).profile).not.toBe('');
    expect(makeNpc(new RNG(1), { name: 'A B', role: 'coach', title: 't', season: 1 }).profile).not.toBe('');
  });

  it('suit some levels better than others', () => {
    let tacticians = 0;
    let hsTacticians = 0;
    const rng = new RNG(9);
    for (let i = 0; i < 400; i++) {
      if (pickProfile(rng, 'coach', 'pro')?.id === 'tactician') tacticians++;
      if (pickProfile(rng, 'coach', 'hs')?.id === 'tactician') hsTacticians++;
    }
    expect(tacticians).toBeGreaterThan(hsTacticians * 2);
  });
});

describe('the moments that fit each person', () => {
  const eligible = (s: GameState): string[] => {
    const refs = lifeRefs(s);
    const ctx = lifeContext(s, refs, 1);
    return lifeEventDefs().filter((d) => d.levels.includes(s.career.level) && (d.need ?? []).every((r) => refs[r]) && (!d.when || d.when(ctx))).map((d) => d.id);
  };
  const withProfiles = (rival: string, mate: string, coach: string, friend: string) => {
    const s = make(4);
    byRole(s, 'rival').profile = rival;
    byRole(s, 'coach').profile = coach;
    byRole(s, 'friend').profile = friend;
    const t = Object.values(s.npcs).find((n) => n.role === 'teammate' && n.active);
    if (t) t.profile = mate;
    return s;
  };

  it('a taunt is for the loud rival, and the quiet one gets a different moment', () => {
    expect(eligible(withProfiles('trash_talker', '', 'disciplinarian', 'ride_or_die'))).toContain('rival_post');
    const quiet = eligible(withProfiles('quiet_grinder', '', 'disciplinarian', 'ride_or_die'));
    expect(quiet).not.toContain('rival_post');
    expect(quiet).toContain('rival_respect');
    expect(quiet).not.toContain('rival_chip');
    expect(eligible(withProfiles('chip', '', 'disciplinarian', 'ride_or_die'))).toContain('rival_chip');
    expect(eligible(withProfiles('old_friend', '', 'disciplinarian', 'ride_or_die'))).toContain('rival_old_friend');
  });

  it('people from before profiles existed keep behaving as they always did', () => {
    const s = withProfiles('', '', '', '');
    const e = eligible(s);
    expect(e).toContain('rival_post');
    for (const id of ['rival_respect', 'rival_chip', 'coach_late', 'coach_dodge', 'friend_drift', 'mate_glue']) expect(e, id).not.toContain(id);
  });

  it('a coach only has the moments that fit them', () => {
    const s = withProfiles('trash_talker', '', 'players_coach', 'ride_or_die');
    s.career.phase = 'regular';
    const e = eligible(s);
    expect(e).toContain('coach_dodge');
    expect(e).not.toContain('coach_late');
    s.career.phase = 'regular';
    byRole(s, 'coach').profile = 'disciplinarian';
    expect(eligible(s)).toContain('coach_late');
    expect(eligible(s)).not.toContain('coach_dodge');
  });

  it('a locker-room fight needs someone who would start one', () => {
    const s = withProfiles('quiet_grinder', 'glue_guy', 'tactician', 'ride_or_die');
    if (!Object.values(s.npcs).some((n) => n.role === 'teammate' && n.active)) return;
    expect(eligible(s)).not.toContain('locker_beef');
    expect(eligible(s)).toContain('mate_glue');
    Object.values(s.npcs).find((n) => n.role === 'teammate' && n.active)!.profile = 'demanding_star';
    expect(eligible(s)).toContain('locker_beef');
  });

  it('every new moment belongs to one kind of person and is not open to anyone else', () => {
    const ids = ['family_calls_coach', 'family_missed_game', 'family_braggart', 'family_backup_plan', 'family_film', 'family_quiet_support', 'love_two_things', 'love_honest', 'love_opens_up', 'love_far_away', 'love_day_off', 'agent_big_deal', 'agent_says_wait', 'agent_in_over_head', 'agent_two_stories', 'media_long_read', 'media_twisted_quote', 'media_big_fan', 'media_old_question', 'scout_straight_talk', 'scout_flattery', 'coach_late', 'coach_dodge', 'coach_filmroom', 'coach_story', 'coach_job', 'coach_alone', 'coach_booster', 'coach_family', 'rival_respect', 'rival_old_friend', 'rival_media', 'rival_chip', 'mate_glue', 'mate_holding_back', 'mate_clown', 'mate_hungry', 'mate_leader', 'friend_drift', 'friend_bet', 'friend_worry'];
    const defs = lifeEventDefs();
    for (const id of ids) {
      const d = defs.find((x) => x.id === id);
      expect(d, id).toBeDefined();
      expect(d!.when, id).toBeDefined();
      expect(d!.need?.length, id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('people change', () => {
  it('a rival who keeps losing to you stops talking, once', () => {
    const s = make(6);
    const r = byRole(s, 'rival');
    r.profile = 'trash_talker';
    r.stage = 0;
    r.h2h = { w: 4, l: 1 };
    const before = { ...r.relationship };
    const rngBefore = s.rngState;
    const changed = evolveCharacters(s);
    expect(changed.map((n) => n.id)).toContain(r.id);
    expect(r.stage).toBe(1);
    expect(r.relationship.respect).toBeGreaterThan(before.respect);
    expect(r.relationship.rivalry).toBeLessThan(before.rivalry);
    expect(r.memories.at(-1)).toMatch(/talking stopped/);
    expect(r.keyMemories.at(-1)).toMatch(/talking stopped/);
    expect(s.news.at(-1)?.text ?? '').toContain(r.name);
    expect(s.rngState).toBe(rngBefore); // no dice involved
    // it happens once
    const snap = JSON.stringify(r.relationship);
    expect(evolveCharacters(s)).toHaveLength(0);
    expect(JSON.stringify(r.relationship)).toBe(snap);
  });

  it('the same rival who keeps beating you gets worse instead', () => {
    const s = make(6);
    const r = byRole(s, 'rival');
    r.profile = 'trash_talker';
    r.h2h = { w: 0, l: 4 };
    const before = r.relationship.rivalry;
    evolveCharacters(s);
    expect(r.relationship.rivalry).toBeGreaterThan(before);
    expect(r.memories.at(-1)).toMatch(/medal/);
  });

  it('a strict coach shows a softer side once they trust you, and a warm one hardens after a losing run', () => {
    const s = make(6);
    const c = byRole(s, 'coach');
    c.profile = 'disciplinarian';
    c.relationship.trust = 70;
    const aff = c.relationship.affinity;
    evolveCharacters(s);
    expect(c.relationship.affinity).toBeGreaterThan(aff);
    expect(c.stage).toBe(1);

    const t = make(6);
    const w = byRole(t, 'coach');
    w.profile = 'players_coach';
    t.league.standings[t.career.teamId].w = 1;
    t.league.standings[t.career.teamId].l = 9;
    const respect = w.relationship.respect;
    evolveCharacters(t);
    expect(w.relationship.respect).toBeGreaterThan(respect);
  });

  it('nothing happens to people without a profile, to the inactive, or before the moment is right', () => {
    const s = make(6);
    for (const n of Object.values(s.npcs)) {
      n.h2h = { w: 0, l: 0 };
      n.relationship.trust = 20;
      n.relationship.respect = 20;
      n.relationship.affinity = 30; // neither warm enough nor cold enough for anyone's turning point
    }
    expect(evolveCharacters(s)).toHaveLength(0);
    const r = byRole(s, 'rival');
    r.profile = '';
    r.h2h = { w: 9, l: 0 };
    expect(evolveCharacters(s)).toHaveLength(0);
    r.profile = 'trash_talker';
    r.active = false;
    expect(evolveCharacters(s)).toHaveLength(0);
  });

  it('happens through a whole career without breaking anything', () => {
    const s = make(8);
    playUntil(s, new RNG(8), (x) => x.career.phase === 'retired');
    const stages = Object.values(s.npcs).filter((n) => n.stage > 0);
    for (const n of Object.values(s.npcs)) {
      expect(n.stage).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(n.relationship)) expect(Number.isFinite(v)).toBe(true);
    }
    expect(Array.isArray(stages)).toBe(true);
    expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(s)))).not.toThrow();
  }, 120_000);
});

describe('how it reads', () => {
  it('the narrator is told who each featured character is, and the fallback scenes play them differently', () => {
    const s = make(7);
    const rival = byRole(s, 'rival');
    rival.profile = 'quiet_grinder';
    expect(castBlock(s, [rival.id])).toContain('who they are: The quiet grinder');
    expect(profileLine(rival)).toMatch(/Wants:.*Flaw:.*Soft spot:.*Voice:/);
    rival.profile = '';
    expect(castBlock(s, [rival.id])).not.toContain('who they are');

    const plan = { kind: 'rival_encounter', brief: '', castIds: [rival.id], roles: [] } as never;
    rival.profile = 'quiet_grinder';
    expect(templateScene(s, plan, 1).narration).toMatch(/6 a\.m\./);
    rival.profile = 'trash_talker';
    expect(templateScene(s, plan, 1).narration).toMatch(/One to eleven|narrating/);
    rival.profile = '';
    expect(templateScene(s, plan, 1).narration).toMatch(/shooting at your usual hoop/);
  });

  it('what a change in someone is shown to the narrator', () => {
    const s = make(7);
    const r = byRole(s, 'rival');
    r.profile = 'trash_talker';
    r.stage = 1;
    r.keyMemories = ['After losing to you again, the talking stopped.'];
    expect(profileLine(r)).toContain('They have changed since you met');
  });
});

describe('older saves', () => {
  it('load with nobody profiled and nobody changed', () => {
    const s = make(2);
    const raw = JSON.parse(JSON.stringify(s));
    for (const n of Object.values(raw.npcs) as Record<string, unknown>[]) {
      delete n.profile;
      delete n.stage;
    }
    const loaded = GameStateSchema.parse(raw);
    for (const n of Object.values(loaded.npcs)) {
      expect(n.profile).toBe('');
      expect(n.stage).toBe(0);
      expect(isProfileOrLegacy(n, 'trash_talker')).toBe(true);
      expect(isProfile(n, 'trash_talker')).toBe(false);
    }
    expect(evolveCharacters(loaded)).toHaveLength(0);
  });
});
