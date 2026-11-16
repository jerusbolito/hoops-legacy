import type { Archetype, Athlete, Position, RatingKey, Ratings } from '../state/schemas';
import { RATING_KEYS } from '../state/schemas';
import { RNG, clamp } from './rng';

/** Relative strengths per archetype, added to a base mean. */
export const ARCHETYPE_PROFILE: Record<Archetype, Partial<Record<RatingKey, number>>> = {
  slasher: { finishing: 9, athleticism: 8, handles: 4, shooting: -5, rebounding: -2 },
  sharpshooter: { shooting: 12, iq: 3, finishing: -4, athleticism: -3, rebounding: -4 },
  playmaker: { passing: 11, handles: 9, iq: 5, rebounding: -5, finishing: -2 },
  big: { rebounding: 12, finishing: 6, defense: 4, handles: -8, shooting: -6, passing: -3 },
  'two-way': { defense: 11, athleticism: 4, stamina: 3, shooting: -1, passing: -2 },
};

export const ARCHETYPE_INFO: Record<Archetype, { label: string; blurb: string; positions: Position[] }> = {
  slasher: { label: 'Slasher', blurb: 'Explosive driver who lives at the rim.', positions: ['SG', 'SF'] },
  sharpshooter: { label: 'Sharpshooter', blurb: 'Deadly from deep; gravity off the ball.', positions: ['SG', 'SF', 'PG'] },
  playmaker: { label: 'Playmaker', blurb: 'Floor general who makes everyone better.', positions: ['PG'] },
  big: { label: 'Big Man', blurb: 'Owns the paint on both ends.', positions: ['PF', 'C'] },
  'two-way': { label: 'Two-Way Wing', blurb: 'Lockdown defender who can score enough.', positions: ['SF', 'SG', 'PF'] },
};

const POSITION_HEIGHT: Record<Position, [number, number]> = {
  PG: [70, 76],
  SG: [73, 78],
  SF: [76, 80],
  PF: [78, 82],
  C: [80, 85],
};

/** What each rating is, in plain words, for the screens that show the three-letter shorthand. */
export const RATING_INFO: Record<RatingKey, { name: string; what: string }> = {
  shooting: { name: 'Shooting', what: 'Jumpers, threes and free throws. The biggest piece of your overall.' },
  finishing: { name: 'Finishing', what: 'Layups, dunks and every shot at the rim, and how well you attack a defender.' },
  handles: { name: 'Ball handling', what: 'Protecting the ball: fewer turnovers, and defenders find it harder to steal.' },
  passing: { name: 'Passing', what: 'Setting up teammates: more assists, and better odds when you kick it out.' },
  defense: { name: 'Defense', what: 'Contesting shots, staying in front, and forcing turnovers and steals.' },
  rebounding: { name: 'Rebounding', what: 'Winning the ball off the glass, on both ends of the floor.' },
  athleticism: { name: 'Athleticism', what: 'Speed, strength and leaping. Helps at the rim, on blocks and on steals.' },
  iq: { name: 'Basketball IQ', what: 'Smart decisions: fewer turnovers and better mid-range shots.' },
  stamina: { name: 'Stamina', what: 'Conditioning. Counts toward your overall at a lower weight than the skills.' },
};

const OVERALL_WEIGHTS: Record<RatingKey, number> = {
  shooting: 1.2,
  finishing: 1.1,
  handles: 0.9,
  passing: 0.9,
  defense: 1.1,
  rebounding: 0.8,
  athleticism: 1.0,
  iq: 1.0,
  stamina: 0.5,
};

/** Overall: weighted mean, but stars get credit for their best skills (archetype-agnostic). */
export function overall(r: Ratings): number {
  let sum = 0;
  let w = 0;
  for (const k of RATING_KEYS) {
    sum += r[k] * OVERALL_WEIGHTS[k];
    w += OVERALL_WEIGHTS[k];
  }
  const mean = sum / w;
  const top3 = [...RATING_KEYS].map((k) => r[k]).sort((a, b) => b - a).slice(0, 3);
  const topMean = top3.reduce((a, b) => a + b, 0) / 3;
  return Math.round(mean * 0.7 + topMean * 0.3);
}

export function makeRatings(rng: RNG, mean: number, sd: number, archetype: Archetype): Ratings {
  const prof = ARCHETYPE_PROFILE[archetype];
  const base = rng.normal(mean, sd);
  const out = {} as Ratings;
  for (const k of RATING_KEYS) {
    out[k] = Math.round(clamp(base + (prof[k] ?? 0) + rng.normal(0, 4), 15, 99));
  }
  return out;
}

export function heightFor(rng: RNG, pos: Position): number {
  const [lo, hi] = POSITION_HEIGHT[pos];
  return rng.int(lo, hi);
}

export function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function fullName(a: Pick<Athlete, 'firstName' | 'lastName'>): string {
  return `${a.firstName} ${a.lastName}`;
}

export function shortName(a: Pick<Athlete, 'firstName' | 'lastName'>): string {
  return `${a.firstName[0]}. ${a.lastName}`;
}

export const RATING_TIERS = [
  { min: 0, name: 'Raw' },
  { min: 40, name: 'Developing' },
  { min: 55, name: 'Solid' },
  { min: 65, name: 'Good' },
  { min: 75, name: 'Great' },
  { min: 85, name: 'Elite' },
  { min: 95, name: 'Legend' },
] as const;

/** Named skill band for a rating; used for level-up moments. */
export function ratingTier(v: number): { index: number; name: string } {
  let index = 0;
  RATING_TIERS.forEach((t, i) => {
    if (v >= t.min) index = i;
  });
  return { index, name: RATING_TIERS[index].name };
}
