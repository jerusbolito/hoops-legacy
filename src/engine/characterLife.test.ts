import { describe, expect, it } from 'vitest';
import { GameStateSchema, type GameState, type Npc } from '../state/schemas';
import { createCareer } from './career';
import { CHECK_IN, IDLE, REACT, ROLE_CHECK_IN, STYLE, lineFor, moodOf, npcPulse, unit } from './characterLife';
import { PROFILES } from './characters';
import { RNG } from './rng';
import { playUntil } from './testkit';

const make = (seed: number) => createCareer({ firstName: 'Li', lastName: `Ve${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

function setWeek(s: GameState, week: number, season = 1) {
  s.career.phase = 'regular';
  s.career.week = week;
  s.career.season = season;
}
const dms = (s: GameState) => s.feed.filter((p) => p.kind === 'dm');
const befriend = (s: GameState, affinity = 80, trust = 80) => {
  for (const n of Object.values(s.npcs)) {
    n.relationship.affinity = affinity;
    n.relationship.trust = trust;
  }
};
/** Plays out many weeks of one save, across seasons so the same week number is not reused. */
const weeks = (s: GameState, count: number) => {
  for (let w = 1; w <= count; w++) {
    setWeek(s, 1 + (w % 30), 1 + Math.floor(w / 30));
    npcPulse(s);
  }
};

describe('people reaching out', () => {
  it('every profile has a way of talking, and the style tables are complete', () => {
    for (const p of PROFILES) expect(STYLE[p.id], p.id).toBeDefined();
    for (const [style, moods] of Object.entries(REACT)) {
      for (const m of ['injured', 'big', 'rough', 'win', 'loss', 'champ'] as const) expect(moods[m]?.length, `${style}/${m}`).toBeGreaterThanOrEqual(2);
    }
    for (const p of PROFILES) expect(IDLE[p.id]?.length, p.id).toBeGreaterThanOrEqual(1);
  });

  it('a hash gives the same answer every time and spreads evenly', () => {
    expect(unit('a|1|2')).toBe(unit('a|1|2'));
    expect(unit('a|1|2')).not.toBe(unit('a|1|3'));
    let low = 0;
    for (let i = 0; i < 2000; i++) if (unit(`x${i}`) < 0.1) low++;
    expect(low).toBeGreaterThan(140);
    expect(low).toBeLessThan(260);
  });

  it('sends no more than one message a week, never touches the random sequence, and says who it is from', () => {
    const s = make(4);
    befriend(s);
    const rng = s.rngState;
    let sent = 0;
    for (let w = 1; w <= 40; w++) {
      setWeek(s, w);
      const before = dms(s).length;
      const m = npcPulse(s);
      expect(dms(s).length - before).toBe(m ? 1 : 0);
      if (m) {
        sent++;
        expect(Object.values(s.npcs).some((n) => n.name === m.from)).toBe(true);
        expect(m.text.length).toBeGreaterThan(10);
      }
    }
    expect(s.rngState).toBe(rng);
    expect(sent).toBeGreaterThan(3);
    expect(sent).toBeLessThan(30);
  });

  it('is the same every time for the same save', () => {
    const run = () => {
      const s = make(4);
      befriend(s, 70, 70);
      weeks(s, 40);
      return dms(s).map((p) => `${p.week}:${p.author}:${p.text}`);
    };
    expect(run()).toEqual(run());
    expect(run().length).toBeGreaterThan(0);
  });

  it('reacts to what is happening: an injury gets a caring message', () => {
    const s = make(4);
    befriend(s, 90, 90);
    s.player.injury = { weeks: 3, desc: 'sprained ankle' };
    expect(moodOf(s)).toBe('injured');
    const caring = new Set(Object.values(REACT).flatMap((st) => st.injured ?? []));
    weeks(s, 90);
    expect(dms(s).length).toBeGreaterThan(5);
    for (const p of dms(s)) expect(caring.has(p.text), p.text).toBe(true);
  });

  it('reads the last game: a big night, a rough one, a win and a loss', () => {
    const t = make(4);
    t.gameLog.push({ gameId: 'g', season: 1, level: 'hs', year: 1, week: 3, teamId: t.career.teamId, oppId: 'x', teamScore: 70, oppScore: 60, playoff: false, shots: [], line: { sec: 1500, pts: 31, fgm: 12, fga: 20, tpm: 3, ftm: 4, fta: 5, orb: 1, drb: 4, ast: 3, stl: 1, blk: 0, tov: 2, pf: 2 } as never });
    t.career.season = 1;
    t.career.week = 4;
    expect(moodOf(t)).toBe('big');
    t.gameLog[0].line = { ...t.gameLog[0].line, pts: 6, fgm: 2, fga: 12 };
    expect(moodOf(t)).toBe('rough');
    t.gameLog[0].line = { ...t.gameLog[0].line, pts: 14, fgm: 6, fga: 12 };
    expect(moodOf(t)).toBe('win');
    t.gameLog[0].teamScore = 50;
    expect(moodOf(t)).toBe('loss');
    t.career.week = 9;
    expect(moodOf(t)).toBe('idle');
  });

  it('close people message more than distant ones, and people who dislike you stay quiet', () => {
    const count = (aff: number, trust: number) => {
      const s = make(4);
      befriend(s, aff, trust);
      weeks(s, 150);
      return dms(s).length;
    };
    expect(count(90, 90)).toBeGreaterThan(count(0, 0));
    expect(count(-80, 0)).toBeLessThan(count(60, 60));
    const s = make(4);
    for (const n of Object.values(s.npcs)) n.estranged = true;
    weeks(s, 100);
    expect(dms(s)).toHaveLength(0);
  });

  it('leaves people from before profiles existed, and anyone when the career is over, alone', () => {
    const s = make(4);
    befriend(s, 90, 90);
    for (const n of Object.values(s.npcs)) n.profile = '';
    weeks(s, 100);
    expect(dms(s)).toHaveLength(0);
    const t = make(4);
    befriend(t, 90, 90);
    for (let w = 1; w <= 100; w++) {
      t.career.phase = 'retired';
      t.career.week = w;
      npcPulse(t);
    }
    expect(dms(t)).toHaveLength(0);
  });

  it('does not say the same thing twice in a row', () => {
    const s = make(4);
    befriend(s, 95, 95);
    weeks(s, 240);
    const list = dms(s);
    expect(list.length).toBeGreaterThan(20);
    for (let i = 1; i < list.length; i++) expect(list[i].text).not.toBe(list[i - 1].text);
  });

  it('only the right kind of person, at the right level', () => {
    const s = make(4); // high school
    const agent: Npc = { ...Object.values(s.npcs)[0], id: 'a1', name: 'Ann Agent', role: 'agent', profile: 'shark', relationship: { affinity: 90, trust: 90, respect: 50, rivalry: 0, romance: 0 }, active: true, estranged: false };
    s.npcs.a1 = agent;
    for (const n of Object.values(s.npcs)) if (n.id !== 'a1') n.active = false;
    weeks(s, 200);
    expect(dms(s)).toHaveLength(0); // an agent does not text a high school freshman
    s.career.level = 'pro';
    weeks(s, 200);
    expect(dms(s).length).toBeGreaterThan(0);
  });

  it('works through a whole career and the save still loads', () => {
    const s = make(11);
    playUntil(s, new RNG(11), (x) => x.career.phase === 'retired');
    const m = dms(s);
    expect(m.length).toBeGreaterThan(3);
    for (const p of m) expect(p.likes).toBe(0);
    expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(s)))).not.toThrow();
  }, 120_000);

  it('lineFor stays within what each person can say', () => {
    const s = make(4);
    const n = Object.values(s.npcs).find((x) => x.role === 'coach')!;
    n.profile = 'disciplinarian';
    expect(REACT.formal.injured).toContain(lineFor(n, 'injured', 's1')!);
    expect([...IDLE.disciplinarian, ...ROLE_CHECK_IN.coach!]).toContain(lineFor(n, 'idle', 's1')!);
    // a friend uses the general check-ins for their way of talking
    const f = Object.values(s.npcs).find((x) => x.role === 'friend')!;
    f.profile = 'ride_or_die';
    expect([...IDLE.ride_or_die, ...CHECK_IN.loud]).toContain(lineFor(f, 'idle', 's2')!);
    n.profile = '';
    expect(lineFor(n, 'idle', 's1')).toBeNull();
  });
});
