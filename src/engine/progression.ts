import type { Athlete, GameState, Player, RatingKey } from '../state/schemas';
import { difficultyOf } from './difficulty';
import { RATING_KEYS, RATING_LABELS } from '../state/schemas';
import { hasService } from './finance';
import { modsOf } from './origin';
import { RNG, clamp } from './rng';

export type TrainingFocus = RatingKey | 'rest' | 'study' | 'rehab';

export const TRAINING_OPTIONS: { id: TrainingFocus; label: string; desc: string; energy: number }[] = [
  { id: 'shooting', label: 'Shooting', desc: 'Form shooting, catch-and-shoot, off the dribble.', energy: -12 },
  { id: 'finishing', label: 'Finishing', desc: 'Footwork, touch, finishing through contact.', energy: -14 },
  { id: 'handles', label: 'Ball Handling', desc: 'Tight handles, change of pace.', energy: -12 },
  { id: 'passing', label: 'Playmaking', desc: 'Reads, pick-and-roll passes, vision.', energy: -10 },
  { id: 'defense', label: 'Defense', desc: 'Slides, closeouts, help rotations.', energy: -14 },
  { id: 'rebounding', label: 'Rebounding', desc: 'Box-outs, positioning, second jumps.', energy: -13 },
  { id: 'athleticism', label: 'Strength & Speed', desc: 'Weight room and sprints.', energy: -16 },
  { id: 'iq', label: 'Film Study', desc: 'Learn tendencies, sets and spacing.', energy: -5 },
  { id: 'stamina', label: 'Conditioning', desc: 'Suicides until you hate the baseline.', energy: -15 },
  { id: 'rest', label: 'Rest & Recover', desc: 'Ice bath, sleep, and some peace.', energy: 28 },
  { id: 'study', label: 'Hit the Books', desc: 'Keep your grades up (and eligibility).', energy: -4 },
  { id: 'rehab', label: 'Rehab', desc: 'Work with the trainer. Two sessions shave a week off the injury and protect you from losing a step.', energy: -3 },
];

/** Weeks of a layoff that make a comeback a story of its own. */
export const COMEBACK_WEEKS = 3;

/** Secondary ratings that get a sliver of growth when training a skill. */
export const SPILLOVER: Partial<Record<RatingKey, RatingKey>> = {
  shooting: 'iq',
  finishing: 'athleticism',
  handles: 'passing',
  passing: 'iq',
  defense: 'athleticism',
  rebounding: 'stamina',
  athleticism: 'stamina',
  iq: 'passing',
};

/** Fractional training progress; whole points flush into the rating. Returns the rating points gained. */
export function addProgress(player: Player, ath: Athlete, key: RatingKey, amount: number): number {
  const cur = (player.progress[key] ?? 0) + amount;
  const whole = Math.floor(cur);
  player.progress[key] = cur - whole;
  if (whole > 0) {
    const before = ath.ratings[key];
    ath.ratings[key] = clamp(ath.ratings[key] + whole, 1, 99);
    return ath.ratings[key] - before;
  }
  return 0;
}

function gapFactor(ath: Athlete, key: RatingKey): number {
  const ceiling = ath.potential + 6; // individual skills can exceed overall potential a bit
  return clamp((ceiling - ath.ratings[key]) / 18, 0.08, 1.4);
}

function ageFactor(age: number): number {
  if (age <= 19) return 1.25;
  if (age <= 23) return 1.05;
  if (age <= 27) return 0.8;
  if (age <= 30) return 0.5;
  return 0.25;
}

export interface TrainingResult {
  gains: { key: RatingKey; delta: number }[];
  energyDelta: number;
  academicsDelta: number;
  text: string;
}

/** Weekly training session. Mutates state. */
export function train(state: GameState, rng: RNG, focus: TrainingFocus, intensity = 1): TrainingResult {
  const p = state.player;
  const ath = state.athletes[p.athleteId];
  const opt = TRAINING_OPTIONS.find((o) => o.id === focus)!;
  const gains: { key: RatingKey; delta: number }[] = [];
  let academicsDelta = 0;

  if (focus === 'rehab') {
    const inj = p.injury;
    if (!inj) {
      p.energy = clamp(p.energy + 10, 0, 100);
      return { gains, energyDelta: 10, academicsDelta, text: 'Nothing to rehab. You take it easy instead.' };
    }
    inj.total ??= inj.weeks;
    inj.rehab = (inj.rehab ?? 0) + 1;
    state.story.flags.rehab_sessions = Number(state.story.flags.rehab_sessions ?? 0) + 1;
    p.energy = clamp(p.energy + opt.energy, 0, 100);
    p.morale = clamp(p.morale + 2, 0, 100);
    let text = 'Hours with the trainer, a little progress at a time.';
    if (inj.rehab >= 2 && inj.weeks > 1) {
      inj.weeks -= 1;
      inj.rehab = 0;
      text = 'The work pays off. The trainer clears you a week sooner than planned.';
    }
    return { gains, energyDelta: opt.energy, academicsDelta, text };
  }
  if (focus === 'rest') {
    p.energy = clamp(p.energy + opt.energy, 0, 100);
    p.morale = clamp(p.morale + 3, 0, 100);
    return { gains, energyDelta: opt.energy, academicsDelta, text: 'You rest up. Your legs thank you.' };
  }
  if (focus === 'study') {
    academicsDelta = state.career.level === 'pro' ? 0 : Math.round(rng.range(0.05, 0.14) * (hasService(state, 'tutor') ? 1.5 : 1) * 100) / 100;
    p.academics = clamp(p.academics + academicsDelta, 0, 4);
    p.energy = clamp(p.energy + opt.energy, 0, 100);
    if (state.career.level === 'pro') {
      addProgress(p, ath, 'iq', 0.35);
    }
    return { gains, energyDelta: opt.energy, academicsDelta, text: state.career.level === 'pro' ? 'You study film and business books.' : 'Late nights at the library pay off.' };
  }

  const energyF = clamp(p.energy / 70, 0.35, 1.15);
  const coach = 0.95 + (state.teams[state.career.teamId]?.prestige ?? 50) / 400;
  const trainer = hasService(state, 'trainer') ? 1.2 : 1;
  const amount = 0.55 * gapFactor(ath, focus) * energyF * ageFactor(ath.age) * coach * intensity * trainer * difficultyOf(state).training * rng.range(0.8, 1.2);
  const d = addProgress(p, ath, focus, amount);
  if (d) gains.push({ key: focus, delta: d });
  const spill = SPILLOVER[focus];
  if (spill) {
    const d2 = addProgress(p, ath, spill, amount * 0.25);
    if (d2) gains.push({ key: spill, delta: d2 });
  }
  const energyDelta = Math.round(opt.energy * intensity);
  p.energy = clamp(p.energy + energyDelta, 0, 100);
  const text = gains.length
    ? `The work shows: ${gains.map((g) => `${RATING_LABELS[g.key]} +${g.delta}`).join(', ')}.`
    : `Good session. You can feel your ${opt.label.toLowerCase()} getting sharper.`;
  return { gains, energyDelta, academicsDelta, text };
}

/** Summer: two focus areas with larger gains plus natural growth. */
export function offseasonDevelopment(state: GameState, rng: RNG, focuses: RatingKey[]): { key: RatingKey; delta: number }[] {
  const p = state.player;
  const ath = state.athletes[p.athleteId];
  const out = new Map<RatingKey, number>();
  const bump = (k: RatingKey, d: number) => {
    if (!d) return;
    const before = ath.ratings[k];
    ath.ratings[k] = clamp(ath.ratings[k] + d, 1, 99);
    out.set(k, (out.get(k) ?? 0) + (ath.ratings[k] - before));
  };
  for (const k of focuses) {
    bump(k, Math.round(rng.range(2.5, 4.5) * gapFactor(ath, k) * ageFactor(ath.age) * (hasService(state, 'trainer') ? 1.2 : 1)));
  }
  // natural growth / aging
  for (const k of RATING_KEYS) {
    bump(k, naturalChange(rng, ath, k));
  }
  return [...out.entries()].filter(([, d]) => d !== 0).map(([key, delta]) => ({ key, delta }));
}

function naturalChange(rng: RNG, ath: Athlete, k: RatingKey): number {
  const age = ath.age;
  if (age < 23) {
    const g = gapFactor(ath, k);
    const base = k === 'athleticism' && age < 19 ? 1.5 : 0.7;
    return Math.max(0, Math.round(rng.normal(base * g, 0.6)));
  }
  if (age < 28) return Math.round(rng.normal(k === 'iq' ? 0.6 : 0.15, 0.5));
  if (age < 31) return Math.round(rng.normal(k === 'athleticism' || k === 'stamina' ? -0.8 : k === 'iq' ? 0.5 : -0.1, 0.6));
  const physical = k === 'athleticism' || k === 'stamina' || k === 'finishing' || k === 'defense';
  return Math.round(rng.normal(physical ? -2.2 : k === 'iq' ? 0.3 : -0.8, 0.8));
}

/** Off-season growth for every non-user athlete. */
export function developNpcs(state: GameState, rng: RNG) {
  for (const a of Object.values(state.athletes)) {
    if (a.id === state.player.athleteId) continue;
    for (const k of RATING_KEYS) {
      let d = naturalChange(rng, a, k);
      if (a.age < 23) d += Math.round(rng.normal(gapFactor(a, k) * 1.6, 1));
      a.ratings[k] = clamp(a.ratings[k] + d, 10, 99);
    }
  }
}

/** Game wear: energy cost scaled by minutes, injury roll. */
export function postGameWear(state: GameState, rng: RNG, secPlayed: number, totalSec: number): string | null {
  const p = state.player;
  const ath = state.athletes[p.athleteId];
  const share = secPlayed / Math.max(1, totalSec);
  const stamF = 1.25 - ath.ratings.stamina / 120;
  p.energy = clamp(p.energy - Math.round(share * 26 * stamF), 0, 100);
  // a body that has been through a lot breaks down more easily
  const proneF = p.injuryHistory >= 3 ? 1.4 : 1;
  const careF = hasService(state, 'recovery') ? 0.75 : 1;
  const injuryP = (0.008 + share * 0.012 + (p.energy < 25 ? 0.05 : p.energy < 40 ? 0.02 : 0)) * proneF * careF * difficultyOf(state).injury;
  if (secPlayed > 0 && rng.chance(injuryP)) {
    const inj = rng.weighted(
      [
        { desc: 'rolled ankle', weeks: 1 },
        { desc: 'bruised knee', weeks: 1 },
        { desc: 'hamstring strain', weeks: 2 },
        { desc: 'sprained wrist', weeks: 2 },
        { desc: 'high ankle sprain', weeks: 4 },
      ],
      (i) => 6 - i.weeks,
    );
    p.injury = { ...inj };
    p.injuryHistory++;
    return inj.desc;
  }
  return null;
}

/** Between weeks: recovery, injury countdown. */
export function weeklyRecovery(state: GameState) {
  const p = state.player;
  const ath = state.athletes[p.athleteId];
  const extra = (hasService(state, 'nutrition') ? 5 : 0) + (hasService(state, 'recovery') ? 3 : 0);
  // an after-school job takes its toll all season long
  const job = state.career.level === 'hs' && state.career.phase === 'regular' ? modsOf(state).jobEnergy : 0;
  p.energy = clamp(p.energy + 10 + extra + Math.round(ath.ratings.stamina / 12) - job, 0, 100);
  if (p.injury) {
    p.injury.total ??= p.injury.weeks;
    p.injury.weeks -= hasService(state, 'recovery') ? 2 : 1;
    if (p.injury.weeks <= 0) {
      // a long layoff ends: the comeback is waiting
      if ((p.injury.total ?? 0) >= COMEBACK_WEEKS) state.story.flags.comeback_due = p.injury.total ?? COMEBACK_WEEKS;
      p.injury = null;
    }
  }
  // relationships drift slowly toward neutral affinity
  for (const n of Object.values(state.npcs)) {
    const r = n.relationship;
    if (Math.abs(r.affinity) > 40) r.affinity -= Math.sign(r.affinity);
    if (r.rivalry > 50 && !n.athleteId) r.rivalry -= 1;
  }
}
