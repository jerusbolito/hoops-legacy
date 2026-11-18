import type { GameState } from '../state/schemas';

/**
 * Difficulty. Stored as a story flag so older saves read as Normal with no migration. Normal multiplies by 1
 * everywhere and consumes no extra randomness, so it plays exactly as the game always has.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  id: Difficulty;
  label: string;
  blurb: string;
  /** Multiplies training gains. */
  training: number;
  /** Multiplies the chance of getting hurt in a game. */
  injury: number;
  /** Multiplies what life costs (pro living costs); the amateur allowance moves the other way. */
  cost: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: 'easy', label: 'Relaxed', blurb: 'Training pays off faster, injuries are rarer and money goes further. A good first career.', training: 1.2, injury: 0.7, cost: 0.8 },
  { id: 'normal', label: 'Standard', blurb: 'The game as designed.', training: 1, injury: 1, cost: 1 },
  { id: 'hard', label: 'Grind', blurb: 'Slower growth, more injuries and tighter money. Greatness is earned.', training: 0.85, injury: 1.3, cost: 1.25 },
];

export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d])) as Record<Difficulty, DifficultyDef>;

export function difficultyOf(state: GameState): DifficultyDef {
  const f = state.story.flags.difficulty;
  return typeof f === 'string' && f in DIFFICULTY_BY_ID ? DIFFICULTY_BY_ID[f as Difficulty] : DIFFICULTY_BY_ID.normal;
}

export function setDifficulty(state: GameState, id: Difficulty) {
  if (id === 'normal') delete state.story.flags.difficulty;
  else state.story.flags.difficulty = id;
}
