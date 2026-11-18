import type { Archetype, Background, GameState, Legend, Motive, Position, Temperament } from '../state/schemas';
import type { NewCareerInput } from './career';
import type { Difficulty } from './difficulty';
import { ARCHETYPE_INFO } from './ratings';
import { RNG } from './rng';

/**
 * Challenges: a fixed seed and a fixed start, so everyone who takes one faces the same league and the same dice
 * at the start, and plays it differently from there. The score is the career's Hall of Fame score. A challenge is
 * tagged on the save (`story.flags.challenge`) and on the Legend it files.
 */

export interface Challenge {
  id: string;
  kind: 'weekly' | 'classic';
  title: string;
  blurb: string;
  seed: number;
  archetype: Archetype;
  position: Position;
  heightIn: number;
  difficulty: Difficulty;
  background: Background;
  motive: Motive;
  temperament: Temperament;
  traits: string[];
}

const CLASSICS: Challenge[] = [
  { id: 'classic-underdog', kind: 'classic', title: 'The Underdog', blurb: 'A struggling family, a short guard and no safety net. Make it anyway.', seed: 101, archetype: 'playmaker', position: 'PG', heightIn: 70, difficulty: 'hard', background: 'struggling', motive: 'provide', temperament: 'steady', traits: ['gym_rat'] },
  { id: 'classic-silver-spoon', kind: 'classic', title: 'Silver Spoon', blurb: 'Money, a private gym and every door open. The only question is whether you want it.', seed: 202, archetype: 'slasher', position: 'SG', heightIn: 77, difficulty: 'normal', background: 'wealthy', motive: 'fame', temperament: 'charming', traits: ['showman'] },
  { id: 'classic-big-man', kind: 'classic', title: 'Last Real Big', blurb: 'A rim protector in a league that has forgotten them.', seed: 303, archetype: 'big', position: 'C', heightIn: 83, difficulty: 'normal', background: 'athletic', motive: 'legacy', temperament: 'loner', traits: [] },
];

/** Everything about an ISO week that makes it unique, e.g. "2026-47". */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const BACKGROUNDS: Background[] = ['struggling', 'working', 'comfortable', 'athletic', 'wealthy'];
const MOTIVES: Motive[] = ['prove', 'provide', 'love', 'fame', 'legacy'];
const TEMPERAMENTS: Temperament[] = ['steady', 'fiery', 'loyal', 'charming', 'loner'];
const ARCHETYPES = Object.keys(ARCHETYPE_INFO) as Archetype[];
const WEEKLY_TITLES = ['Prove Them Wrong', 'The Long Climb', 'Chip on the Shoulder', 'A Different Road', 'Fresh Start', 'Against the Odds', 'Make Some Noise'];

/** This week's challenge. Same for everyone, whatever the time zone, for the whole ISO week. */
export function weeklyChallenge(d: Date = new Date()): Challenge {
  const week = isoWeek(d);
  const rng = new RNG(hash(`week-${week}`));
  const archetype = rng.pick(ARCHETYPES);
  const info = ARCHETYPE_INFO[archetype];
  const position = rng.pick(info.positions) as Position;
  const heightIn = 70 + rng.int(0, 13);
  const difficulty = rng.pick<Difficulty>(['normal', 'normal', 'hard']);
  const background = rng.pick(BACKGROUNDS);
  return {
    id: `weekly-${week}`,
    kind: 'weekly',
    title: rng.pick(WEEKLY_TITLES),
    blurb: `Week ${week.split('-')[1]}. ${info.label}, ${Math.floor(heightIn / 12)}'${heightIn % 12}", from a ${background} family.${difficulty === 'hard' ? ' Grind difficulty.' : ''}`,
    seed: hash(`seed-${week}`) % 2147483647,
    archetype,
    position,
    heightIn,
    difficulty,
    background,
    motive: rng.pick(MOTIVES),
    temperament: rng.pick(TEMPERAMENTS),
    traits: [],
  };
}

export const classicChallenges = (): Challenge[] => CLASSICS;
export const allChallenges = (d: Date = new Date()): Challenge[] => [weeklyChallenge(d), ...CLASSICS];

/** The new-career input for a challenge. The player only chooses a name and a hometown. */
export function challengeInput(c: Challenge, name: { firstName: string; lastName: string; hometown?: string }): NewCareerInput {
  return {
    firstName: name.firstName,
    lastName: name.lastName,
    hometown: name.hometown?.trim() || 'Akron, OH',
    archetype: c.archetype,
    position: c.position,
    heightIn: c.heightIn,
    schoolIndex: 0,
    traits: c.traits,
    seed: c.seed,
    difficulty: c.difficulty,
    origin: { background: c.background, motive: c.motive, temperament: c.temperament },
    challengeId: c.id,
  };
}

export const challengeOf = (state: GameState): string => (typeof state.story.flags.challenge === 'string' ? state.story.flags.challenge : '');

/** A career's score on its challenge: the Hall of Fame score, to one decimal. */
export const challengeScore = (l: Legend): number => Math.round(l.score * 10) / 10;

/** Your best finished run at each challenge, from the Hall of Fame. */
export function personalBests(legends: Legend[]): Record<string, Legend> {
  const out: Record<string, Legend> = {};
  for (const l of legends) if (l.challenge && (!out[l.challenge] || l.score > out[l.challenge].score)) out[l.challenge] = l;
  return out;
}
