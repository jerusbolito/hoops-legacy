import type { GameState } from '../state/schemas';
import { applyBadges } from './badges';
import { coachStanding } from './coach';
import { NO_MODS, type UserMods } from './gameSim';
import { applyPlan } from './gameplan';

/** Everything that tilts the user's next game, gathered from the save in one place. */
export function buildUserMods(state: GameState): UserMods {
  const mods: UserMods = { ...NO_MODS, shot: { ...NO_MODS.shot }, signatures: [] };
  applyBadges(state.player.badges, mods);
  applyPlan(state.career.plan, mods);
  const coach = coachStanding(state);
  mods.rankBoost = coach.rankBoost;
  mods.minutesBias = coach.minutesBias;
  return mods;
}
