import type { GameState, PlanId } from '../state/schemas';
import { LEVEL_CONFIG } from '../data/teams';
import type { UserMods } from './gameSim';
import { overall } from './ratings';

/**
 * Pre-game preparation: study the opponent, pick an approach, and optionally spend energy on film.
 * Plans are small, visible odds shifts, not magic. The right one depends on your game and their weaknesses.
 */

export interface PlanDef {
  id: PlanId;
  name: string;
  icon: string;
  blurb: string;
  /** Plain-language effect, shown before you pick. */
  effect: string;
  mods: Partial<{ rim: number; mid: number; three: number; pass: number; steal: number; solid: number; block: number; all: number }>;
  /** Fraction of normal game energy cost saved. */
  energySaved?: number;
}

export const PLANS: PlanDef[] = [
  { id: 'balanced', name: 'Play your game', icon: '⚖️', blurb: 'No special approach. Trust your instincts.', effect: 'No change.', mods: {} },
  { id: 'attack_rim', name: 'Attack the paint', icon: '🏀', blurb: 'Drive, finish, and get to the line.', effect: 'Your rim shots +4%. Your threes −3%.', mods: { rim: 0.04, three: -0.03 } },
  { id: 'perimeter', name: 'Live from deep', icon: '🎯', blurb: 'Space the floor and let it fly.', effect: 'Your threes and jumpers +4%. Your rim shots −2%.', mods: { three: 0.04, mid: 0.02, rim: -0.02 } },
  { id: 'playmaker', name: 'Run the offense', icon: '🧠', blurb: 'Get everyone involved and read the defense.', effect: 'Passing to a teammate +7%. Your own shots −1%.', mods: { pass: 0.07, rim: -0.01, mid: -0.01, three: -0.01 } },
  { id: 'lockdown', name: 'Lock them down', icon: '🛡️', blurb: 'Make every possession hard for them.', effect: 'Steals +5%, staying solid +5%, blocks +3% on key moments. Your shots −1.5%.', mods: { steal: 0.05, solid: 0.05, block: 0.03, rim: -0.015, mid: -0.015, three: -0.015 } },
  { id: 'conserve', name: 'Save your legs', icon: '🔋', blurb: 'Pace yourself and stay fresh for the stretch.', effect: 'You use about 35% less energy this game. Your shots −1%.', mods: { rim: -0.01, mid: -0.01, three: -0.01 }, energySaved: 0.35 },
];

export const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<PlanId, PlanDef>;

export const FILM_ENERGY_COST = 6;
export const FILM_BONUS = 0.02;

/** Fold the chosen plan and film study into the simulator modifiers. */
export function applyPlan(plan: { id: PlanId; film: boolean } | null, mods: UserMods) {
  if (!plan) return;
  const m = PLAN_BY_ID[plan.id].mods;
  mods.shot.rim += m.rim ?? 0;
  mods.shot.mid += m.mid ?? 0;
  mods.shot.three += m.three ?? 0;
  mods.pass += m.pass ?? 0;
  mods.steal += m.steal ?? 0;
  mods.solid += m.solid ?? 0;
  mods.block += m.block ?? 0;
  if (plan.film) mods.all += FILM_BONUS;
}

/** Share of a normal game's energy the plan saves. */
export function energySavedBy(plan: { id: PlanId } | null): number {
  return plan ? (PLAN_BY_ID[plan.id].energySaved ?? 0) : 0;
}

export interface ScoutPlayer {
  name: string;
  position: string;
  ovr: number;
  shooting: number;
  finishing: number;
  defense: number;
}

export interface OpponentScout {
  teamName: string;
  record: string;
  top: ScoutPlayer[];
  /** Best defender among their rotation, and the weakest one. */
  bestDefender: ScoutPlayer | null;
  weakDefender: ScoutPlayer | null;
  avgDefense: number;
  style: 'perimeter' | 'interior' | 'balanced';
  rivalName?: string;
  /** How good each plan looks against this team, higher is better. */
  fit: Record<PlanId, number>;
  recommended: PlanId;
  reasons: string[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function scoutOpponent(state: GameState, oppTeamId: string): OpponentScout {
  const me = state.athletes[state.player.athleteId];
  const mean = LEVEL_CONFIG[state.league.level].ratingMean;
  const opp = state.teams[oppTeamId];
  const roster = opp.rosterIds
    .map((id) => state.athletes[id])
    .filter(Boolean)
    .sort((a, b) => overall(b.ratings) - overall(a.ratings));
  const toScout = (a: (typeof roster)[number]): ScoutPlayer => ({ name: `${a.firstName} ${a.lastName}`, position: a.position, ovr: overall(a.ratings), shooting: a.ratings.shooting, finishing: a.ratings.finishing, defense: a.ratings.defense });
  const top = roster.slice(0, 5).map(toScout);
  const rotation = roster.slice(0, 7).map(toScout);
  const avgDefense = avg(top.map((p) => p.defense));
  const avgShoot = avg(top.map((p) => p.shooting));
  const avgFinish = avg(top.map((p) => p.finishing));
  const mates = (state.teams[state.career.teamId]?.rosterIds ?? []).map((id) => state.athletes[id]).filter((a) => a && a.id !== me.id).sort((a, b) => overall(b.ratings) - overall(a.ratings)).slice(0, 4);
  const mateShoot = avg(mates.map((a) => a.ratings.shooting));
  const st = state.league.standings[oppTeamId];
  const rival = Object.values(state.npcs).find((n) => n.active && n.role === 'rival' && n.athleteId && state.athletes[n.athleteId]?.teamId === oppTeamId);

  const r = me.ratings;
  const fit: Record<PlanId, number> = {
    balanced: 0,
    attack_rim: r.finishing * 0.7 + r.athleticism * 0.3 - avgDefense,
    perimeter: r.shooting - avgDefense * 0.9 - 2,
    playmaker: r.passing * 0.6 + r.iq * 0.4 - avgDefense * 0.5 + (mateShoot - mean) * 0.3 - 8,
    lockdown: r.defense * 0.7 + r.athleticism * 0.3 - (avgShoot + avgFinish) / 2 + ((top[0]?.ovr ?? mean) - mean) * 0.2 - 2,
    conserve: -99,
  };
  const reasons: string[] = [];
  let recommended: PlanId;
  if (state.player.energy < 45) {
    recommended = 'conserve';
    reasons.push(`Your energy is ${state.player.energy}. Pacing yourself keeps you sharp late.`);
  } else {
    const ranked = (Object.keys(fit) as PlanId[]).filter((k) => k !== 'conserve').sort((a, b) => fit[b] - fit[a]);
    recommended = fit[ranked[0]] >= 4 ? ranked[0] : 'balanced';
    if (recommended === 'attack_rim') reasons.push(`Their top five average ${Math.round(avgDefense)} defense and your finishing is ${r.finishing}.`);
    if (recommended === 'perimeter') reasons.push(`Your shooting is ${r.shooting} against a defense that averages ${Math.round(avgDefense)}.`);
    if (recommended === 'playmaker') reasons.push(`You can read a defense (PAS ${r.passing}) and your teammates can finish what you set up.`);
    if (recommended === 'lockdown') reasons.push(`Your defense (${r.defense}) is a real weapon against a team that scores like this one.`);
    if (recommended === 'balanced') reasons.push('Nothing about this matchup tilts the odds much. Play your game.');
  }
  const best = [...rotation].sort((a, b) => b.defense - a.defense)[0] ?? null;
  const weak = [...rotation].sort((a, b) => a.defense - b.defense)[0] ?? null;
  const style = avgShoot - avgFinish > 4 ? 'perimeter' : avgFinish - avgShoot > 4 ? 'interior' : 'balanced';

  return {
    teamName: `${opp.name} ${opp.mascot}`,
    record: st ? `${st.w}-${st.l}` : '0-0',
    top,
    bestDefender: best,
    weakDefender: weak,
    avgDefense,
    style,
    rivalName: rival?.name,
    fit,
    recommended,
    reasons,
  };
}
