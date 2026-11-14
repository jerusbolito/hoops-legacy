import type { GameState, RatingKey } from '../state/schemas';
import { shotZones } from './analytics';
import type { SignatureMove, UserMods } from './gameSim';
import { totals } from './stats';

/**
 * Badges are earned, not picked: a rating bar to clear plus proof in your career numbers.
 * Some add a signature option to key moments, others quietly tilt the odds.
 */

export interface BadgeReq {
  label: string;
  have: number;
  need: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  /** What it does, in plain words. */
  effect: string;
  reqs: (c: BadgeContext) => BadgeReq[];
  apply: (m: UserMods) => void;
  signature?: SignatureMove;
}

export interface BadgeContext {
  r: Record<RatingKey, number>;
  tpm: number;
  stl: number;
  blk: number;
  ast: number;
  rimMade: number;
  midMade: number;
  clutchWins: number;
}

export function badgeContext(state: GameState): BadgeContext {
  const a = state.athletes[state.player.athleteId];
  const t = totals(state.gameLog);
  const z = shotZones(state.gameLog).zones;
  const made = (ids: string[]) => z.filter((s) => ids.includes(s.zone.id)).reduce((n, s) => n + s.made, 0);
  return {
    r: a.ratings,
    tpm: t.tpm,
    stl: t.stl,
    blk: t.blk,
    ast: t.ast,
    rimMade: made(['rim']),
    midMade: made(['midL', 'midC', 'midR']),
    clutchWins: state.player.clutchWins,
  };
}

const rating = (label: string, have: number, need: number): BadgeReq => ({ label, have, need });

export const BADGES: BadgeDef[] = [
  {
    id: 'stepback',
    name: 'Step-Back Specialist',
    icon: '↩️',
    blurb: 'A hesitation and a step back that leaves defenders reaching.',
    effect: 'Adds a "Step-back three" option on offensive key moments, with better odds than the basic three.',
    reqs: (c) => [rating('Shooting', c.r.shooting, 68), rating('Ball handling', c.r.handles, 60), rating('Threes made', c.tpm, 15)],
    apply: () => {},
    signature: { id: 'stepback', label: 'Signature: Step-back three', detail: 'Your hesitation step-back. Hard to guard.', kind: 'offense', shot: 'three', bonus: 0.07, rating: 'shooting', win: 'Hesitation, step-back... SPLASH, and the defender is still reaching.', lose: 'You get the step-back off but it rims out.' },
  },
  {
    id: 'eurostep',
    name: 'Euro-Step',
    icon: '👣',
    blurb: 'Two long strides that go around, not through.',
    effect: 'Adds a "Euro-step finish" option at the rim, with better odds than a normal drive.',
    reqs: (c) => [rating('Finishing', c.r.finishing, 68), rating('Athleticism', c.r.athleticism, 62), rating('Baskets at the rim', c.rimMade, 20)],
    apply: () => {},
    signature: { id: 'eurostep', label: 'Signature: Euro-step', detail: 'Go around the help defender and finish.', kind: 'offense', shot: 'rim', bonus: 0.08, rating: 'finishing', win: 'Euro-step around the help, finger-roll, and it drops.', lose: 'You swing around the defender but the layup rolls off.' },
  },
  {
    id: 'pullup_pro',
    name: 'Pull-Up Pro',
    icon: '🎯',
    blurb: 'A mid-range jumper you can hit off the dribble in rhythm.',
    effect: 'Adds a "Elbow pull-up" option with better odds than a basic pull-up.',
    reqs: (c) => [rating('Shooting', c.r.shooting, 66), rating('Ball handling', c.r.handles, 58), rating('Mid-range makes', c.midMade, 20)],
    apply: () => {},
    signature: { id: 'pullup_pro', label: 'Signature: Elbow pull-up', detail: 'Stop on a dime and rise.', kind: 'offense', shot: 'mid', bonus: 0.08, rating: 'shooting', win: 'You stop on a dime, rise from the elbow, and it is pure.', lose: 'Good look from the elbow, but it comes up short.' },
  },
  {
    id: 'dime',
    name: 'Dime Dropper',
    icon: '🎁',
    blurb: 'You see the play one pass before everyone else.',
    effect: 'Your pass to a teammate on key moments is more likely to lead to a bucket.',
    reqs: (c) => [rating('Passing', c.r.passing, 70), rating('Basketball IQ', c.r.iq, 60), rating('Assists', c.ast, 50)],
    apply: (m) => {
      m.pass += 0.08;
    },
  },
  {
    id: 'clamps',
    name: 'Clamps',
    icon: '🧲',
    blurb: 'Once you are in front of someone, they stay stuck.',
    effect: 'Staying solid on defense in key moments works better.',
    reqs: (c) => [rating('Defense', c.r.defense, 70), rating('Athleticism', c.r.athleticism, 60), rating('Steals and blocks', c.stl + c.blk, 25)],
    apply: (m) => {
      m.solid += 0.08;
    },
  },
  {
    id: 'ballhawk',
    name: 'Ball Hawk',
    icon: '🦅',
    blurb: 'You can smell a lazy pass from across the floor.',
    effect: 'Steal attempts on defense work better, and "Poke it free" becomes a real option.',
    reqs: (c) => [rating('Defense', c.r.defense, 64), rating('Athleticism', c.r.athleticism, 66), rating('Steals', c.stl, 20)],
    apply: (m) => {
      m.steal += 0.09;
    },
    signature: { id: 'ballhawk', label: 'Signature: Jump the lane', detail: 'Read the pass and take it.', kind: 'defense', base: 'steal', bonus: 0.04, rating: 'defense', win: 'You read the eyes, jump the lane, and the ball is yours.', lose: 'You break on the pass a half-step late.' },
  },
  {
    id: 'rim_protector',
    name: 'Rim Protector',
    icon: '🚫',
    blurb: 'Nobody gets an easy one while you are on the floor.',
    effect: 'Block attempts work better, and "Meet him at the rim" becomes a real option.',
    reqs: (c) => [rating('Athleticism', c.r.athleticism, 68), rating('Defense', c.r.defense, 62), rating('Blocks', c.blk, 12)],
    apply: (m) => {
      m.block += 0.09;
    },
    signature: { id: 'rim_protector', label: 'Signature: Meet him at the rim', detail: 'Time it and send it back.', kind: 'defense', base: 'block', bonus: 0.04, rating: 'athleticism', win: 'You time it perfectly and send it into the stands.', lose: 'You go up early and he floats it past you.' },
  },
  {
    id: 'sniper',
    name: 'Sniper',
    icon: '🔭',
    blurb: 'Open or not, the three is going to look good.',
    effect: 'Every three you take, in the flow of the game or in key moments, goes in a bit more.',
    reqs: (c) => [rating('Shooting', c.r.shooting, 76), rating('Threes made', c.tpm, 40)],
    apply: (m) => {
      m.shot.three += 0.04;
    },
  },
  {
    id: 'closer',
    name: 'Closer',
    icon: '🔒',
    blurb: 'When it is tight in the fourth, you want the ball.',
    effect: 'Better odds on every option in clutch moments.',
    reqs: (c) => [rating('Basketball IQ', c.r.iq, 55), rating('Clutch moments won', c.clutchWins, 3)],
    apply: (m) => {
      m.clutch += 0.05;
    },
  },
];

export const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b])) as Record<string, BadgeDef>;

export interface BadgeStatus {
  def: BadgeDef;
  reqs: BadgeReq[];
  /** 0 to 1: average progress across the requirements. */
  progress: number;
  unlocked: boolean;
  ready: boolean;
}

export function badgeStatus(state: GameState): BadgeStatus[] {
  const c = badgeContext(state);
  return BADGES.map((def) => {
    const reqs = def.reqs(c);
    const progress = reqs.reduce((a, r) => a + Math.min(1, r.have / r.need), 0) / reqs.length;
    return { def, reqs, progress, unlocked: state.player.badges.includes(def.id), ready: reqs.every((r) => r.have >= r.need) };
  });
}

/** Unlocks any badge whose requirements are now met. Returns the ones just earned. */
export function checkBadgeUnlocks(state: GameState): BadgeDef[] {
  const earned = badgeStatus(state).filter((s) => !s.unlocked && s.ready);
  for (const s of earned) state.player.badges.push(s.def.id);
  return earned.map((s) => s.def);
}

/** Folds every unlocked badge into the simulator modifiers. */
export function applyBadges(ids: string[], mods: UserMods) {
  for (const id of ids) {
    const b = BADGE_BY_ID[id];
    if (!b) continue;
    b.apply(mods);
    if (b.signature) mods.signatures.push(b.signature);
  }
}
