import type { GameState } from '../state/schemas';
import { clamp } from './rng';

/**
 * Team chemistry: how well the locker room gets along. Wins, a leader who owns the room and moments that bring people
 * together raise it. Losing, fights, a new coach and roster churn lower it. It matters: a close team plays a little
 * above its ratings, a fractured one a little below.
 */

export const BASELINE = 55;

export const isCaptain = (state: GameState): boolean => state.story.flags.captain_season === state.career.season;

export function chemistryLabel(v: number): string {
  return v >= 85 ? 'Brothers' : v >= 70 ? 'Tight' : v >= 45 ? 'Fine' : v >= 30 ? 'Strained' : 'Fractured';
}

/** Rating points added to every teammate, from -2 to +2. */
export function chemistryMod(state: GameState): number {
  const v = state.career.chemistry;
  return v >= 85 ? 2 : v >= 70 ? 1 : v <= 25 ? -2 : v <= 40 ? -1 : 0;
}

export function bumpChemistry(state: GameState, d: number): number {
  state.career.chemistry = clamp(Math.round((state.career.chemistry + d) * 10) / 10, 0, 100);
  return state.career.chemistry;
}

/** After each of your games: winning feels good, a blowout loss does not. */
export function chemistryAfterGame(state: GameState, o: { won: boolean; margin: number }) {
  bumpChemistry(state, o.won ? 1.5 : o.margin >= 15 ? -2.5 : -1);
  // a leader keeps a losing room together a little
  if (!o.won && isCaptain(state)) bumpChemistry(state, 0.5);
}

/** Each week the room drifts back toward normal, and a captain's presence lifts the normal a little. */
export function weeklyChemistry(state: GameState) {
  const target = BASELINE + (isCaptain(state) ? 6 : 0);
  const v = state.career.chemistry;
  bumpChemistry(state, clamp((target - v) * 0.08, -1.5, 1.5));
}

/** New season: people leave, people arrive. Most of last year's feeling fades. */
export function chemistryNewSeason(state: GameState) {
  state.career.chemistry = Math.round(state.career.chemistry * 0.6 + BASELINE * 0.4);
}

/** A new team means a locker room that does not know you yet. */
export function chemistryNewTeam(state: GameState, forced = false) {
  state.career.chemistry = forced ? 38 : 42;
}
