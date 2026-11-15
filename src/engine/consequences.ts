import type { GameState, Npc } from '../state/schemas';
import { clamp } from './rng';

/**
 * Choices that last: grades that bench you, injuries you play through, friends who stop talking to you,
 * and past decisions that come back later. The engine decides all of it; the narrator only tells it.
 */

/* ───────────────────────── Grades ───────────────────────── */

export const MIN_GPA = 2.0;
export const WARN_GPA = 2.4;

export interface AcademicStatus {
  /** Pros have no grades to keep. */
  applies: boolean;
  gpa: number;
  eligible: boolean;
  /** Close enough to the line to worry. */
  warning: boolean;
}

export function academicStatus(state: GameState): AcademicStatus {
  const applies = state.career.level !== 'pro';
  const gpa = state.player.academics;
  return { applies, gpa, eligible: !applies || gpa >= MIN_GPA, warning: applies && gpa >= MIN_GPA && gpa < WARN_GPA };
}

/** Grades slip a little every week the player does not keep up with school. */
export const WEEKLY_GPA_DRIFT = 0.015;

/* ───────────────────────── Playing hurt ───────────────────────── */

/** A minor injury (two weeks or less left) can be played through. Anything worse cannot. */
export function canPlayHurt(state: GameState): boolean {
  const inj = state.player.injury;
  return !!inj && inj.weeks > 0 && inj.weeks <= 2 && (state.career.phase === 'regular' || state.career.phase === 'playoffs');
}

export function isPlayingHurt(state: GameState): boolean {
  return state.career.playHurt && canPlayHurt(state);
}

/** Ratings you lose while playing on an injury. */
export const HURT_PENALTY = 6;
/** Chance a hurt player makes it worse. */
export const AGGRAVATE_CHANCE = 0.35;

/** Injuries add up: after enough of them the body wears down. */
export function isInjuryProne(state: GameState): boolean {
  return state.player.injuryHistory >= 3;
}

/** Everything that keeps the player out of the next game, with the reason to show. */
export function sitOutReason(state: GameState): string | null {
  if (state.story.flags.holdout === true) return 'You are holding out for a new contract, so you are not playing.';
  const ac = academicStatus(state);
  if (!ac.eligible) return `You are academically ineligible. Your GPA is ${ac.gpa.toFixed(2)} and you need ${MIN_GPA.toFixed(1)} to play.`;
  const inj = state.player.injury;
  if (inj && inj.weeks > 0 && !isPlayingHurt(state)) return `You are out with a ${inj.desc} (${inj.weeks} week${inj.weeks === 1 ? '' : 's'}).`;
  return null;
}

/* ───────────────────────── Falling outs ───────────────────────── */

const CLOSE_ROLES = ['friend', 'family', 'love_interest', 'mentor'];

/** People stop talking to you when trust and affection both collapse, and come back when you repair it. */
export function updateEstrangement(state: GameState): string[] {
  const out: string[] = [];
  for (const n of Object.values(state.npcs) as Npc[]) {
    if (!n.active || !CLOSE_ROLES.includes(n.role)) continue;
    const r = n.relationship;
    if (!n.estranged && r.trust <= 20 && r.affinity <= -25) {
      n.estranged = true;
      state.player.morale = clamp(state.player.morale - 6, 0, 100);
      n.memories.push('Stopped speaking to you after things fell apart.');
      if (n.memories.length > 8) n.memories.shift();
      out.push(`${n.name} has stopped speaking to you.`);
    } else if (n.estranged && r.trust >= 35 && r.affinity >= 0) {
      n.estranged = false;
      out.push(`${n.name} is talking to you again.`);
    }
  }
  return out;
}

/* ───────────────────────── Delayed consequences ───────────────────────── */

export const MAX_PENDING_RIPPLES = 5;

export function addRipple(state: GameState, o: { text: string; seasons?: number; npcId?: string }): boolean {
  const text = o.text.trim().slice(0, 200);
  const pending = state.story.ripples.filter((r) => r.status !== 'resolved');
  if (!text || pending.length >= MAX_PENDING_RIPPLES || pending.some((r) => r.text === text)) return false;
  const wait = clamp(Math.round(o.seasons ?? 1), 1, 3);
  state.story.ripples.push({ id: `ripple_${state.story.ripples.length + 1}`, text, npcId: o.npcId, openedSeason: state.career.season, dueSeason: state.career.season + wait, status: 'pending' });
  if (state.story.ripples.length > 40) state.story.ripples.splice(0, state.story.ripples.length - 40);
  return true;
}

/** Called when a new season starts: anything whose time has come becomes due. */
export function activateDueRipples(state: GameState): number {
  let n = 0;
  for (const r of state.story.ripples) {
    if (r.status === 'pending' && r.dueSeason <= state.career.season) {
      r.status = 'due';
      n++;
    }
  }
  return n;
}

export function dueRipples(state: GameState) {
  return state.story.ripples.filter((r) => r.status === 'due');
}

export function resolveRipple(state: GameState, id: string) {
  const r = state.story.ripples.find((x) => x.id === id);
  if (r) r.status = 'resolved';
}
