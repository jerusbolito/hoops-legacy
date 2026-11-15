import { describe, expect, it } from 'vitest';
import { FAMOUS_NAMES, FEMALE_FIRST, FIRST_NAMES, LAST_NAMES } from '../data/names';
import type { GameState, Level } from '../state/schemas';
import { advanceWeek, commitToCollege, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame, freeAgencyOffers, recruitingOffers, runDraft, signFreeAgent } from './career';
import { generateLeagueTeams } from './generate';
import { NameBook } from './nameBook';
import { RNG } from './rng';

const lc = (s: string) => s.toLowerCase();

/** Every uniqueness rule, checked against a whole game state. Returns a list of problems (empty = good). */
function nameProblems(s: GameState): string[] {
  const out: string[] = [];
  const full = new Map<string, number>();
  const lastCount = new Map<string, number>();
  for (const a of Object.values(s.athletes)) {
    const k = lc(`${a.firstName} ${a.lastName}`);
    full.set(k, (full.get(k) ?? 0) + 1);
    lastCount.set(lc(a.lastName), (lastCount.get(lc(a.lastName)) ?? 0) + 1);
    if (FAMOUS_NAMES.has(k)) out.push(`famous name ${k}`);
  }
  for (const [k, n] of full) if (n > 1) out.push(`duplicate player name ${k}`);

  // within each team: no repeated first or last names
  for (const t of Object.values(s.teams)) {
    const firsts = new Set<string>();
    const lasts = new Set<string>();
    for (const id of t.rosterIds) {
      const a = s.athletes[id];
      if (!a) continue;
      if (lasts.has(lc(a.lastName))) out.push(`${t.name}: repeated last name ${a.lastName}`);
      if (firsts.has(lc(a.firstName))) out.push(`${t.name}: repeated first name ${a.firstName}`);
      lasts.add(lc(a.lastName));
      firsts.add(lc(a.firstName));
    }
  }
  // NPCs (coaches, agents, scouts, etc.) never share a full name with a player or each other
  const npcNames = new Map<string, number>();
  for (const n of Object.values(s.npcs)) {
    npcNames.set(lc(n.name), (npcNames.get(lc(n.name)) ?? 0) + 1);
    if (!n.athleteId && full.has(lc(n.name))) out.push(`NPC ${n.name} duplicates a player`);
  }
  for (const [k, n] of npcNames) if (n > 1) out.push(`duplicate NPC ${k}`);
  return out;
}

describe('name pools', () => {
  it('are large and varied, and have no duplicates', () => {
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(600);
    expect(FEMALE_FIRST.length).toBeGreaterThanOrEqual(200);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(1000);
    expect(new Set(FIRST_NAMES).size).toBe(FIRST_NAMES.length);
    expect(new Set(LAST_NAMES).size).toBe(LAST_NAMES.length);
    expect(FAMOUS_NAMES.size).toBeGreaterThan(50);
  });
});

describe('NameBook', () => {
  it('never repeats a full name, or a first/last name within a team', () => {
    const rng = new RNG(1);
    const book = new NameBook();
    const seen = new Set<string>();
    const lastsInTeam = new Set<string>();
    const firstsInTeam = new Set<string>();
    for (let i = 0; i < 13; i++) {
      const n = book.draw(rng, { team: 'T1' });
      expect(seen.has(lc(n.full))).toBe(false);
      expect(lastsInTeam.has(lc(n.lastName))).toBe(false);
      expect(firstsInTeam.has(lc(n.firstName))).toBe(false);
      seen.add(lc(n.full));
      lastsInTeam.add(lc(n.lastName));
      firstsInTeam.add(lc(n.firstName));
    }
  });

  it('keeps last names unique across a whole league, and respects reserved names', () => {
    const book = new NameBook();
    book.reserve('Marcus', 'Hale');
    const rng = new RNG(2);
    const lasts = new Set<string>(['hale']);
    for (let i = 0; i < 400; i++) {
      const n = book.draw(rng, { team: `T${i % 30}`, gender: 'any' });
      expect(lasts.has(lc(n.lastName))).toBe(false);
      lasts.add(lc(n.lastName));
    }
  });

  it('never produces a famous real person, even over a huge number of draws', () => {
    const rng = new RNG(3);
    let drawn = 0;
    for (let b = 0; b < 1000; b++) {
      const book = new NameBook();
      for (let i = 0; i < 100; i++) {
        const n = book.draw(rng, { team: 'x', gender: i % 3 === 0 ? 'any' : 'm' });
        expect(FAMOUS_NAMES.has(lc(n.full))).toBe(false);
        drawn++;
      }
    }
    expect(drawn).toBe(100_000);
  });

  it('draws female and mixed names when asked', () => {
    const rng = new RNG(4);
    const book = new NameBook();
    for (let i = 0; i < 40; i++) expect(FEMALE_FIRST).toContain(book.draw(rng, { gender: 'f' }).firstName);
    const mixed = new Set<boolean>();
    for (let i = 0; i < 60; i++) mixed.add(FEMALE_FIRST.includes(book.draw(rng, { gender: 'any' }).firstName));
    expect(mixed.size).toBe(2);
  });
});

describe('generated leagues', () => {
  for (const level of ['hs', 'college', 'pro'] as Level[]) {
    it(`have no repeated names (${level}, 40 seeds)`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const rng = new RNG(seed);
        const { teams, athletes } = generateLeagueTeams(rng, level);
        const lasts = new Map<string, number>();
        for (const a of athletes) lasts.set(lc(a.lastName), (lasts.get(lc(a.lastName)) ?? 0) + 1);
        // league-wide, every last name is unique (pool is ~10x the league size)
        expect([...lasts.values()].filter((n) => n > 1)).toEqual([]);
        expect(new Set(athletes.map((a) => lc(a.firstName))).size).toBe(athletes.length);
        for (const t of teams) expect(new Set(t.rosterIds.map((id) => athletes.find((a) => a.id === id)!.firstName)).size).toBe(t.rosterIds.length);
        expect(new Set(teams.map((t) => lc(t.coachName))).size).toBe(teams.length);
      }
    });
  }

  it('looks varied: a league draws on many different first and last names', () => {
    const { athletes } = generateLeagueTeams(new RNG(9), 'pro');
    expect(new Set(athletes.map((a) => a.lastName)).size).toBe(athletes.length);
    expect(new Set(athletes.map((a) => a.firstName)).size).toBe(athletes.length);
  });
});

describe('whole careers', () => {
  const create = (seed: number, first = 'Marcus', last = 'Hale') =>
    createCareer({ firstName: first, lastName: last, hometown: 'x', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

  it('start with unique names and nobody sharing the player\'s surname (except family)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = create(seed);
      expect(nameProblems(s)).toEqual([]);
      const user = s.athletes[s.player.athleteId];
      const sameSurname = Object.values(s.athletes).filter((a) => a.id !== user.id && lc(a.lastName) === lc(user.lastName));
      expect(sameSurname).toEqual([]);
      const family = Object.values(s.npcs).find((n) => n.role === 'family')!;
      expect(family.name.endsWith(` ${user.lastName}`)).toBe(true);
    }
  });

  it('stay unique through every season of HS, college and the pros', () => {
    for (const seed of [3, 17, 42]) {
      const s = create(seed, 'Dre', 'Hale');
      const check = (when: string) => {
        const p = nameProblems(s);
        if (p.length) throw new Error(`seed ${seed} at ${when} (S${s.career.season} ${s.career.level} ${s.career.phase}): ${p.slice(0, 4).join('; ')}`);
      };
      for (let i = 0; i < 20000 && s.career.phase !== 'retired'; i++) {
        const c = s.career;
        if (c.phase === 'recruiting') {
          commitToCollege(s, recruitingOffers(s)[0].name);
          check('commit');
          continue;
        }
        if (c.phase === 'draft') {
          runDraft(s);
          check('draft');
          continue;
        }
        if (c.phase === 'free_agency') {
          signFreeAgent(s, freeAgencyOffers(s)[0]);
          check('free agency');
          continue;
        }
        if (c.step === 'training') {
          if (c.phase === 'offseason') doSummerTraining(s, ['shooting', 'finishing']);
          else doTraining(s, 'shooting');
        } else if (c.step === 'scene') completeScene(s);
        else if (c.step === 'game') {
          const g = createUserGameSim(s)!;
          g.sim.runToEnd();
          finishUserGame(s, g.sim, g.game);
        } else {
          if (c.level === 'college' && c.phase === 'offseason' && c.year >= 3) s.story.flags.declared_for_draft = true;
          if (c.level === 'pro' && c.phase === 'offseason' && s.athletes[s.player.athleteId].age >= 34) s.story.flags.retiring = true;
          const before = `${c.season}${c.phase}`;
          advanceWeek(s);
          if (`${s.career.season}${s.career.phase}` !== before) check('new phase');
        }
      }
      expect(s.career.phase).toBe('retired');
      check('retirement');
    }
  }, 30_000);
});
