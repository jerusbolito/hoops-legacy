import { LEVEL_CONFIG } from '../data/teams';
import type { Athlete, GameState, Npc, PlayerLine } from '../state/schemas';
import { MINUTE_SHARE } from './gameSim';
import { overall } from './ratings';
import { clamp } from './rng';
import { gameScore } from './stats';

/**
 * The coach decides who plays. Trust and respect, your recent form, and how you handle yourself move you up or down
 * the depth chart and change your minutes. Everything here is plain engine math the player can see.
 */

export function coachOf(state: GameState): Npc | null {
  return Object.values(state.npcs).find((n) => n.role === 'coach' && n.active) ?? null;
}

const rosterOf = (state: GameState): Athlete[] => state.teams[state.career.teamId].rosterIds.map((id) => state.athletes[id]).filter(Boolean);

/** A typical night is about 8 game score per 20 minutes. Measured per 20 so bench players are not judged on raw totals. */
export const PAR_GAME_SCORE = 8;

export function gameScorePer20(line: PlayerLine): number {
  return (gameScore(line) * 1200) / Math.max(1, line.sec);
}

/** Average of the last few games the player really played (at least 8 minutes each), per 20 minutes. Neutral with no games yet. */
export function recentForm(state: GameState, n = 5): number {
  const played = state.gameLog.filter((e) => e.line.sec >= 480).slice(-n);
  if (!played.length) return PAR_GAME_SCORE;
  return played.reduce((a, e) => a + gameScorePer20(e.line), 0) / played.length;
}

export interface CoachStanding {
  hasCoach: boolean;
  coachName: string;
  trust: number;
  respect: number;
  form: number;
  /** -1 to 1: how much the coach likes what he sees. */
  score: number;
  /** Added to your rating when the coach ranks his roster. */
  rankBoost: number;
  /** Scales your share of minutes. */
  minutesBias: number;
  /** Where you sit on the depth chart once trust is counted (1 = best). */
  rank: number;
  /** Where you would sit on talent alone. */
  talentRank: number;
  label: string;
  /** Expected minutes in a full game. */
  minutes: number;
  /** One line on why. */
  reason: string;
}

export function roleLabel(rank: number): string {
  return rank === 1 ? 'Franchise Star' : rank <= 3 ? 'Starter (go-to option)' : rank <= 5 ? 'Starter' : rank <= 8 ? 'Rotation' : 'Deep Bench';
}

export function coachStanding(state: GameState): CoachStanding {
  const coach = coachOf(state);
  const trust = coach?.relationship.trust ?? 50;
  const respect = coach?.relationship.respect ?? 50;
  const form = recentForm(state);
  const score = clamp(0.5 * ((trust - 50) / 50) + 0.3 * ((respect - 50) / 50) + 0.2 * clamp((form - 8) / 12, -1, 1), -1, 1);
  const rankBoost = Math.round(score * 4);
  const minutesBias = clamp(score * 0.28, -0.25, 0.25);

  const roster = rosterOf(state);
  const me = state.athletes[state.player.athleteId];
  const byTalent = [...roster].sort((a, b) => overall(b.ratings) - overall(a.ratings));
  const byCoach = [...roster].sort((a, b) => overall(b.ratings) + (b.id === me.id ? rankBoost : 0) - (overall(a.ratings) + (a.id === me.id ? rankBoost : 0)));
  const talentRank = byTalent.findIndex((a) => a.id === me.id) + 1;
  const rank = byCoach.findIndex((a) => a.id === me.id) + 1;

  const gameMinutes = LEVEL_CONFIG[state.career.level].quarterMinutes * 4;
  const share = clamp((MINUTE_SHARE[rank - 1] ?? 0.01) * (1 + minutesBias), 0.02, 0.92);
  const minutes = Math.round(share * gameMinutes);

  let reason: string;
  if (!coach) reason = 'You have no coach to answer to.';
  else if (score >= 0.35) reason = `${coach.name} trusts you and it shows in the lineup.`;
  else if (score <= -0.35) reason = `${coach.name} does not trust you right now, and your minutes are suffering.`;
  else if (rank < talentRank) reason = `${coach.name} rates you above where your talent alone would put you.`;
  else if (rank > talentRank) reason = `${coach.name} has you lower than your talent. Earn his trust back.`;
  else reason = `${coach?.name ?? 'Your coach'} has you about where your talent puts you.`;

  return { hasCoach: !!coach, coachName: coach?.name ?? '', trust, respect, form, score, rankBoost, minutesBias, rank, talentRank, label: roleLabel(rank), minutes, reason };
}

export interface CoachChange {
  trust: number;
  respect: number;
  notes: string[];
}

/**
 * After a game the coach reacts to what he saw. Returns the change so the UI can show it. Players who did not play
 * give him nothing to react to.
 */
export function coachReacts(state: GameState, o: { line: PlayerLine | null; won: boolean; playoff: boolean; playedHurt: boolean }): CoachChange {
  const out: CoachChange = { trust: 0, respect: 0, notes: [] };
  const coach = coachOf(state);
  if (!coach || !o.line || o.line.sec < 120) return out;
  const mins = o.line.sec / 60;

  // production per 20 minutes against a typical night. A rough night costs a little, a big one earns more.
  if (o.line.sec >= 600) {
    const prod = clamp(Math.round((gameScorePer20(o.line) - PAR_GAME_SCORE) / 6), -1, 2);
    if (prod) {
      out.trust += prod;
      out.notes.push(prod > 0 ? 'Strong game' : 'Rough game');
    }
  }
  // taking care of the ball
  if (o.line.tov >= 5 && o.line.sec >= 1200) {
    out.trust -= 1;
    out.notes.push('Too many turnovers');
  }
  // fouling out of games hurts
  if (o.line.pf >= 5 && mins < 25) {
    out.respect -= 1;
    out.notes.push('Foul trouble');
  }
  if (o.won) {
    out.trust += 0.5;
    out.respect += 0.5;
  }
  if (o.won && o.playoff) {
    out.respect += 1;
    out.notes.push('Won when it counted');
  }
  if (o.playedHurt) {
    out.respect += 3;
    out.trust += 1;
    out.notes.push('Played through an injury');
  }
  const r = coach.relationship;
  r.trust = clamp(r.trust + out.trust, 0, 100);
  r.respect = clamp(r.respect + out.respect, 0, 100);
  return out;
}

/** Working hard in practice earns a little respect. Resting when you are worn down does not cost any. */
export function practiceEffort(state: GameState, focus: string) {
  const coach = coachOf(state);
  if (!coach || focus === 'rest' || focus === 'study') return;
  coach.relationship.respect = clamp(coach.relationship.respect + 0.3, 0, 100);
}
