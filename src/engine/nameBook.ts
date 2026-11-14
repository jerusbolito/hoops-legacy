import { FAMOUS_NAMES, FEMALE_FIRST, FIRST_NAMES, LAST_NAMES } from '../data/names';
import type { GameState } from '../state/schemas';
import type { RNG } from './rng';

export type Gender = 'm' | 'f' | 'any';

export interface DrawnName {
  firstName: string;
  lastName: string;
  full: string;
}

const key = (first: string, last: string) => `${first} ${last}`.toLowerCase();

/**
 * Hands out names and remembers them, so nobody gets a name that's already taken:
 *  - the same full name is never used twice,
 *  - no team has two players with the same first or last name,
 *  - first and last names are each unique across the whole league whenever the pool allows (it always should),
 *  - famous real people are never generated.
 * Everything that needs a name (players, coaches, scouts, agents, family, reporters) goes through here.
 */
export class NameBook {
  private full = new Set<string>();
  private firstAll = new Set<string>();
  private lastAll = new Set<string>();
  private teamFirst = new Map<string, Set<string>>();
  private teamLast = new Map<string, Set<string>>();

  /** Record a name that already exists (e.g. the player, or someone loaded from a save). */
  reserve(first: string, last: string, team?: string | null) {
    this.full.add(key(first, last));
    this.firstAll.add(first.toLowerCase());
    this.lastAll.add(last.toLowerCase());
    if (team) {
      this.set(this.teamFirst, team).add(first.toLowerCase());
      this.set(this.teamLast, team).add(last.toLowerCase());
    }
  }

  reserveFull(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) this.reserve(parts[0], parts.slice(1).join(' '));
  }

  /** Everyone already in a game: athletes (with their team), NPCs and head coaches. */
  static fromState(state: GameState): NameBook {
    const book = new NameBook();
    for (const a of Object.values(state.athletes)) book.reserve(a.firstName, a.lastName, a.teamId);
    for (const n of Object.values(state.npcs)) book.reserveFull(n.name);
    for (const t of Object.values(state.teams)) book.reserveFull(t.coachName);
    return book;
  }

  private set(map: Map<string, Set<string>>, team: string) {
    let s = map.get(team);
    if (!s) map.set(team, (s = new Set()));
    return s;
  }

  isTaken(first: string, last: string): boolean {
    return this.full.has(key(first, last));
  }

  /** A first name only (nothing is reserved), e.g. for a parent who shares the player's surname. */
  firstName(rng: RNG, gender: Gender = 'any'): string {
    const female = gender === 'f' || (gender === 'any' && rng.chance(0.5));
    return rng.pick(female ? FEMALE_FIRST : FIRST_NAMES);
  }

  /** Draw a fresh name. `team` makes first and last names unique within that team too. */
  draw(rng: RNG, opts: { team?: string | null; gender?: Gender } = {}): DrawnName {
    const { team = null, gender = 'm' } = opts;
    const tFirst = team ? this.set(this.teamFirst, team) : null;
    const tLast = team ? this.set(this.teamLast, team) : null;
    const pickFirst = () => {
      const female = gender === 'f' || (gender === 'any' && rng.chance(0.35));
      return rng.pick(female ? FEMALE_FIRST : FIRST_NAMES);
    };

    let chosen: { f: string; l: string } | null = null;
    // Strictest first: league-unique last name + team-unique names. Relax only if the pool is nearly exhausted.
    for (let attempt = 0; attempt < 200 && !chosen; attempt++) {
      const f = pickFirst();
      const l = rng.pick(LAST_NAMES);
      const k = key(f, l);
      if (this.full.has(k) || FAMOUS_NAMES.has(k)) continue;
      if (tFirst?.has(f.toLowerCase()) || tLast?.has(l.toLowerCase())) continue;
      // League-wide too (so a player carried up from a lower level can never collide with a new teammate).
      if (attempt < 150 && (this.lastAll.has(l.toLowerCase()) || this.firstAll.has(f.toLowerCase()))) continue;
      chosen = { f, l };
    }
    // Last resort (pool effectively exhausted): keep only full-name uniqueness.
    for (let attempt = 0; attempt < 5000 && !chosen; attempt++) {
      const f = pickFirst();
      const l = rng.pick(LAST_NAMES);
      const k = key(f, l);
      if (!this.full.has(k) && !FAMOUS_NAMES.has(k)) chosen = { f, l };
    }
    if (!chosen) chosen = { f: pickFirst(), l: rng.pick(LAST_NAMES) };

    this.reserve(chosen.f, chosen.l, team);
    return { firstName: chosen.f, lastName: chosen.l, full: `${chosen.f} ${chosen.l}` };
  }
}
