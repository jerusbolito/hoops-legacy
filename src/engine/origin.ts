import type { Background, Build, GameState, Motive, Origin, RatingKey, Temperament } from '../state/schemas';
import { familyProfileFor, profileById } from './characters';
import { clamp } from './rng';

/**
 * Where a player comes from and why they play. Four choices made at the start (family background, motive, temperament,
 * build) that change real numbers all career long, each with a price, and that the narrator is told about so they show
 * up in the story. Saves from before this existed have `chosen: false` and play exactly as they always did.
 *
 * This file is pure data and arithmetic: every other module asks `modsOf(state)` for the numbers that apply to it.
 */

/* ───────────────────────── The numbers ───────────────────────── */

type MulKey =
  | 'allowance' // weekly money in high school and college
  | 'trainingMul' // how well training works
  | 'repGain' // reputation earned from games
  | 'followerMul' // followers earned from games
  | 'endorseMul' // how often brand deals come, and (softly) what they pay
  | 'moraleLossMul' // morale lost after a defeat
  | 'moraleGainMul' // morale gained after a win
  | 'relGain' // how fast good relationships build
  | 'rivalMul' // how hard rivalry games land, both ways
  | 'romanceMul' // how fast a romance grows
  | 'nilMul' // what colleges pay to land you
  | 'gpaDrift'; // how fast grades slip on their own
type AddKey =
  | 'jobEnergy' // energy lost each high school week to a job
  | 'clutch' // extra odds on clutch moments
  | 'leaveMorale' // morale change for leaving a team (negative hurts)
  | 'ratingBoost' // added to every rating at the start
  | 'money' // starting money
  | 'reputation' // starting reputation
  | 'followers' // starting followers
  | 'gpa' // starting GPA
  | 'chem' // team chemistry at the start
  | 'coachTrust' // the first coach's trust at the start
  | 'coachRespect'; // the first coach's respect at the start

export type Mods = Record<MulKey | AddKey, number> & {
  /** How much likelier (or rarer) a random moment is. Missing means 1. */
  events: Record<string, number>;
};

const MUL_KEYS: MulKey[] = ['allowance', 'trainingMul', 'repGain', 'followerMul', 'endorseMul', 'moraleLossMul', 'moraleGainMul', 'relGain', 'rivalMul', 'romanceMul', 'nilMul', 'gpaDrift'];
const ADD_KEYS: AddKey[] = ['jobEnergy', 'clutch', 'leaveMorale', 'ratingBoost', 'money', 'reputation', 'followers', 'gpa', 'chem', 'coachTrust', 'coachRespect'];

export const NEUTRAL: Mods = {
  ...(Object.fromEntries(MUL_KEYS.map((k) => [k, 1])) as Record<MulKey, number>),
  ...(Object.fromEntries(ADD_KEYS.map((k) => [k, 0])) as Record<AddKey, number>),
  events: {},
};

type Part = Partial<Record<MulKey | AddKey, number>> & { events?: Record<string, number> };

function combine(...parts: Part[]): Mods {
  const out: Mods = { ...NEUTRAL, events: {} };
  for (const p of parts) {
    for (const k of MUL_KEYS) if (p[k] !== undefined) out[k] *= p[k]!;
    for (const k of ADD_KEYS) if (p[k] !== undefined) out[k] += p[k]!;
    for (const [id, w] of Object.entries(p.events ?? {})) out.events[id] = (out.events[id] ?? 1) * w;
  }
  return out;
}

const BACKGROUND: Record<Background, Part> = {
  struggling: { allowance: 0.35, jobEnergy: 2, repGain: 1.3, followerMul: 1.2, nilMul: 1.4, trainingMul: 1.03, coachTrust: 4, events: { family_money: 4, power_cut: 3, ride_trouble: 2, envelope: 1.5, booster_offer: 1.5, rent_notice: 6, second_job: 4 } },
  working: { money: 100, moraleLossMul: 0.9, chem: 3 },
  comfortable: { allowance: 1.8, money: 300, gpa: 0.25, gpaDrift: 0.5, trainingMul: 0.97, events: { exam_crunch: 0.4, college_fund_talk: 5 } },
  athletic: { ratingBoost: 1, reputation: 4, followers: 300, coachTrust: 8, moraleLossMul: 1.3, repGain: 0.9, allowance: 1.2, events: { parent_film_session: 5, family_comparison: 5 } },
  wealthy: { allowance: 5, money: 1200, trainingMul: 0.93, coachTrust: -8, chem: -4, followerMul: 1.1, events: { family_money: 0.1, power_cut: 0.1, ride_trouble: 0.2, booster_offer: 2, rich_kid_label: 6, private_gym_offer: 5 } },
};

const MOTIVE: Record<Motive, Part> = {
  prove: { rivalMul: 1.6, coachTrust: -3, events: { rival_post: 2, rival_press: 2, doubter: 6 } },
  provide: { endorseMul: 1.25, moraleLossMul: 1.15, events: { provide_ask: 5, family_money: 1.5, family_set: 1 } },
  love: { trainingMul: 1.04, moraleLossMul: 0.85, repGain: 0.85, endorseMul: 0.9, events: { old_court: 5 } },
  fame: { followerMul: 1.5, endorseMul: 1.3, repGain: 1.15, trainingMul: 0.96, moraleLossMul: 1.2, coachRespect: -4, chem: -3, events: { viral_clip: 2, viral_fail: 2, media_bait: 2, party_invite: 2, fame_dm: 6 } },
  legacy: { moraleLossMul: 1.2, followerMul: 1.2, repGain: 1.1, events: { family_comparison: 6 } },
};

const TEMPERAMENT: Record<Temperament, Part> = {
  steady: { moraleLossMul: 0.8, moraleGainMul: 0.85, repGain: 0.95 },
  fiery: { clutch: 0.03, rivalMul: 1.25, moraleLossMul: 1.1, relGain: 0.9, events: { locker_beef: 2, temper_flare: 6 } },
  loyal: { relGain: 1.3, chem: 5, leaveMorale: -8, followerMul: 0.9, events: { loyal_call: 6 } },
  charming: { followerMul: 1.15, endorseMul: 1.15, romanceMul: 1.4, coachRespect: -3, trainingMul: 0.97, events: { charm_offensive: 6 } },
  loner: { trainingMul: 1.05, moraleLossMul: 0.9, chem: -5, relGain: 0.75, romanceMul: 0.7, followerMul: 0.85, events: { lone_wolf_night: 6 } },
};

/** Each option on its own, for tests and tools that need to look at one choice at a time. */
export const PARTS = { background: BACKGROUND, motive: MOTIVE, temperament: TEMPERAMENT };

/** A build moves seven rating points around and keeps the total about even. */
export const BUILD_SHIFT: Record<Build, Partial<Record<RatingKey, number>>> = {
  lean: { athleticism: 3, handles: 2, stamina: 2, rebounding: -3, defense: -2, finishing: -2 },
  balanced: {},
  strong: { rebounding: 3, defense: 2, finishing: 2, athleticism: -3, handles: -2, stamina: -2 },
};

/** A starting set of ratings after a family's head start and the player's build. */
export function startRatings(ratings: Record<RatingKey, number>, o: Origin) {
  if (!o.chosen) return;
  const boost = combine(BACKGROUND[o.background], MOTIVE[o.motive], TEMPERAMENT[o.temperament]).ratingBoost;
  const shift = BUILD_SHIFT[o.look.build];
  for (const k of Object.keys(ratings) as RatingKey[]) ratings[k] = clamp(ratings[k] + boost + (shift[k] ?? 0), 1, 99);
}

/* ───────────────────────── Reading a save ───────────────────────── */

export const originOf = (state: GameState): Origin => state.player.origin;

/** The numbers that apply to this player. Neutral for saves that never chose an origin. */
export function modsOf(state: GameState): Mods {
  const o = state.player.origin;
  if (!o.chosen) return NEUTRAL;
  return combine(BACKGROUND[o.background], MOTIVE[o.motive], TEMPERAMENT[o.temperament]);
}

/** The numbers for a set of choices, for the creation screen's running total. */
export const modsFor = (o: Pick<Origin, 'background' | 'motive' | 'temperament'>): Mods => combine(BACKGROUND[o.background], MOTIVE[o.motive], TEMPERAMENT[o.temperament]);

/** A random moment's weight, scaled by who the player is. */
export const originWeight = (state: GameState, eventId: string): number => modsOf(state).events[eventId] ?? 1;

/** Only changes anything for a positive number: building a good relationship, not breaking one. */
export const relGainOf = (state: GameState, delta: number): number => (delta > 0 ? delta * modsOf(state).relGain : delta);

/* ───────────────────────── The start of a career ───────────────────────── */

const FAMILY: Record<Background, { title: string; personality?: string[]; rel: { affinity?: number; trust?: number; respect?: number } } | null> = {
  struggling: { title: 'Your parent, working doubles to keep the lights on', personality: ['tired', 'proud'], rel: { affinity: 82, trust: 80, respect: 55 } },
  working: null,
  comfortable: { title: 'Your parent, who keeps one eye on your grades', personality: ['practical', 'warm'], rel: { respect: 55 } },
  athletic: { title: 'Your parent, a former player who knows exactly what it takes', personality: ['demanding', 'wise'], rel: { respect: 72, trust: 60 } },
  wealthy: { title: 'Your parent, who has never had to say no to you', personality: ['indulgent', 'busy'], rel: { affinity: 60, respect: 35 } },
};

/**
 * Applies the one-time parts of an origin to a freshly built save: starting ratings, money, standing, locker room and
 * the first people in the story. Everything that keeps working all career (training, pay, morale, events) is read
 * through `modsOf` where it happens. Does nothing for an unchosen origin. Uses no randomness.
 */
export function applyOriginStart(state: GameState, o2: { ratings?: boolean } = {}) {
  const o = state.player.origin;
  if (!o.chosen) return;
  const m = modsOf(state);
  const me = state.athletes[state.player.athleteId];
  if (o2.ratings !== false) startRatings(me.ratings, o);
  const p = state.player;
  p.money += m.money;
  p.reputation = clamp(p.reputation + m.reputation, 0, 100);
  p.followers += m.followers;
  p.academics = clamp(Math.round((p.academics + m.gpa) * 100) / 100, 0, 4);
  state.career.chemistry = clamp(state.career.chemistry + m.chem, 0, 100);

  const npcs = Object.values(state.npcs);
  const coach = npcs.find((n) => n.role === 'coach' && n.active);
  if (coach) {
    coach.relationship.trust = clamp(coach.relationship.trust + m.coachTrust, 0, 100);
    coach.relationship.respect = clamp(coach.relationship.respect + m.coachRespect, 0, 100);
  }
  const fam = FAMILY[o.background];
  const parent = npcs.find((n) => n.role === 'family' && n.active);
  if (parent && fam) {
    parent.title = fam.title;
    if (fam.personality) parent.personality = fam.personality;
    for (const [k, v] of Object.entries(fam.rel) as [keyof typeof parent.relationship, number][]) parent.relationship[k] = clamp(v, k === 'affinity' ? -100 : 0, 100);
    // what kind of parent they are depends on the family they came from (not on the game's dice)
    const kind = profileById(familyProfileFor(o.background, parent.id));
    if (kind) {
      parent.profile = kind.id;
      for (const [k, v] of Object.entries(kind.rel) as [keyof typeof parent.relationship, number][]) parent.relationship[k] = clamp(parent.relationship[k] + v, k === 'affinity' ? -100 : 0, 100);
    }
  }
}

/* ───────────────────────── For the creation screen ───────────────────────── */

export interface Choice<T extends string> {
  id: T;
  label: string;
  icon: string;
  blurb: string;
  /** What it gives you, in plain words that match the numbers above. */
  perks: string[];
  /** What it costs you. Every choice has a price. */
  costs: string[];
  /** One sentence for the narrator. */
  story: string;
}

export const BACKGROUNDS: Choice<Background>[] = [
  {
    id: 'struggling',
    label: 'Tight money',
    icon: '🏚️',
    blurb: 'A single parent working doubles. Basketball is the way out.',
    perks: ['Everyone loves an underdog: reputation grows 30% faster', 'Hungry: training works 3% better', 'The coach respects the grind (+4 trust)', 'Colleges pay 40% more to land you'],
    costs: ['Allowance is about a third of normal', 'An after-school job costs 2 energy a week in high school', 'Money trouble at home comes up far more often'],
    story: 'raised by a single parent working double shifts. Money is tight and basketball is the way out. Bills, rides and small sacrifices are part of daily life.',
  },
  {
    id: 'working',
    label: 'Working family',
    icon: '🏘️',
    blurb: 'Steady, proud and ordinary. Nothing handed to you, nothing in the way.',
    perks: ['Teammates relate to you (+3 chemistry)', 'Bounces back: morale losses are 10% smaller', '$100 saved to start'],
    costs: ['No head start of any kind'],
    story: 'from a steady working-class family. Proud, ordinary and supportive. Nothing handed over, nothing standing in the way.',
  },
  {
    id: 'comfortable',
    label: 'Comfortable',
    icon: '🏡',
    blurb: 'Stable and school-minded. College is not a question.',
    perks: ['Allowance 80% higher and $300 saved', 'Starts with +0.25 GPA, and grades slip half as fast'],
    costs: ['A balanced life: training 3% less effective', 'Your parents push school, and the college talk comes up'],
    story: 'from a comfortable, school-minded family. Stable, supported, and expected to treat basketball as one part of a bigger plan that includes college.',
  },
  {
    id: 'athletic',
    label: 'Athletic family',
    icon: '🏅',
    blurb: 'Your parent played, and knows every shortcut that is not one.',
    perks: ['A head start: +1 to every rating', 'Coaches know the name (+8 trust, +4 reputation, +300 followers)', 'Allowance 20% higher'],
    costs: ['Expectations: morale falls 30% harder after a loss', 'Reputation grows 10% slower, because you are supposed to be good', 'Comparisons to your parent follow you'],
    story: 'from an athletic family; a parent played at a high level and knows exactly what it takes. Coaches know the name and everyone expects something. The comparison is constant.',
  },
  {
    id: 'wealthy',
    label: 'Well off',
    icon: '💎',
    blurb: 'Money was never the issue. Hunger might be.',
    perks: ['Allowance five times normal and $1,200 to start', 'Followers grow 10% faster'],
    costs: ['No hunger: training 7% less effective', 'The coach starts skeptical (-8 trust) and teammates keep their distance (-4 chemistry)', 'Rich-kid labels and an easy way out come up a lot'],
    story: 'from a wealthy family. Money is never the problem, but teammates and coaches suspect the player has not had to fight for anything, and the player half-suspects it too.',
  },
];

export const MOTIVES: Choice<Motive>[] = [
  {
    id: 'prove',
    label: 'Prove them wrong',
    icon: '🔥',
    blurb: 'Somebody said you would never make it. Remember who.',
    perks: ['Rivalry games land 60% harder when you win', 'Starts with a goal to beat your rival head to head'],
    costs: ['...and 60% harder when you lose', 'A chip on your shoulder: coaches start 3 trust lower', 'Doubters come out of the woodwork'],
    story: 'driven to prove the doubters wrong. A specific person or label stings, and every rivalry and every slight is personal.',
  },
  {
    id: 'provide',
    label: 'Take care of family',
    icon: '🤝',
    blurb: 'Everything is for them. The game is how you pay it back.',
    perks: ['Brand deals come 25% more often', 'Starts with a goal to build a fortune', 'A special moment waits for when the family is finally set'],
    costs: ['The weight: morale falls 15% harder after a loss', 'Family asks for help more often'],
    story: 'playing to take care of family. Every contract, deal and bad week is weighed against what it means for the people back home.',
  },
  {
    id: 'love',
    label: 'Love of the game',
    icon: '❤️',
    blurb: 'You would play for nothing. Some days you nearly do.',
    perks: ['Training works 4% better', 'Morale losses are 15% smaller', 'Starts with a goal to reach elite ratings'],
    costs: ['Not chasing the spotlight: reputation grows 15% slower', 'Fewer brand deals (-10%)'],
    story: 'plays purely for the love of the game. The gym is home, the ball is the point, and fame or money are side effects at best.',
  },
  {
    id: 'fame',
    label: 'Chase the spotlight',
    icon: '🌟',
    blurb: 'You want the name on the jersey, the crowd and the cameras.',
    perks: ['Followers grow 50% faster, reputation 15% faster', 'Brand deals come 30% more often', 'Starts with a goal to build a huge following'],
    costs: ['Training 4% less effective', 'A loss stings 20% more', 'Coach respect starts -4 and chemistry -3', 'Viral highs and viral falls both come around'],
    story: 'wants the spotlight: the following, the brands, the name. Attention is fuel, but it distracts from the work and the team notices.',
  },
  {
    id: 'legacy',
    label: 'Carry the name',
    icon: '👑',
    blurb: 'You are building on someone else\'s legend.',
    perks: ['Followers grow 20% faster, reputation 10% faster', 'Starts with a goal to out-achieve your parent'],
    costs: ['A loss stings 20% more', 'The comparison never ends'],
    story: 'carrying a famous family name. Pride and pressure in equal measure; everyone compares the player to the legend who came first.',
  },
];

export const TEMPERAMENTS: Choice<Temperament>[] = [
  {
    id: 'steady',
    label: 'Steady',
    icon: '🧊',
    blurb: 'Cool head, even keel. Nothing rattles you for long.',
    perks: ['Morale losses are 20% smaller'],
    costs: ['Quieter highs: morale gains 15% smaller', 'Reputation grows 5% slower'],
    story: 'steady and cool-headed. Slow to anger, hard to rattle, and a little hard to read.',
  },
  {
    id: 'fiery',
    label: 'Fiery',
    icon: '💢',
    blurb: 'You play with your whole chest, and say what you think.',
    perks: ['+3% on clutch moments', 'Rivalry swings 25% bigger'],
    costs: ['Morale falls 10% harder', 'Friendships grow 10% slower', 'Flare-ups and locker-room beefs come around'],
    story: 'fiery and competitive. Plays with emotion, says what is on their mind, and sometimes regrets it.',
  },
  {
    id: 'loyal',
    label: 'Loyal',
    icon: '🫶',
    blurb: 'Your people come first, always. You do not walk out on anyone.',
    perks: ['Relationships build 30% faster', '+5 chemistry to start'],
    costs: ['Leaving a team costs 8 morale', 'Followers grow 10% slower', 'Old friends call in favors'],
    story: 'fiercely loyal. Teammates, friends and family come first, and leaving anyone behind feels like betrayal.',
  },
  {
    id: 'charming',
    label: 'Charming',
    icon: '😎',
    blurb: 'People like you. Reporters, brands and a few crushes.',
    perks: ['Followers grow 15% faster', 'Brand deals 15% more often', 'Romance grows 40% faster'],
    costs: ['Coach respect starts -3 ("all talk")', 'Training 3% less effective'],
    story: 'charming and easy to like. Wins people over in a room, but some people take the polish for lack of substance.',
  },
  {
    id: 'loner',
    label: 'Lone wolf',
    icon: '🐺',
    blurb: 'You do the work alone and trust it more than anyone.',
    perks: ['Training works 5% better', 'Morale losses are 10% smaller'],
    costs: ['-5 chemistry to start', 'Relationships build 25% slower and romance 30% slower', 'Followers grow 15% slower'],
    story: 'a lone wolf. Does the work alone, trusts few people, and has a hard time letting a team in.',
  },
];

export const BUILDS: { id: Build; label: string; icon: string; blurb: string; perks: string[]; costs: string[]; story: string }[] = [
  { id: 'lean', label: 'Lean and quick', icon: '🦌', blurb: 'Long strides and fast hands.', perks: ['+3 athleticism, +2 handles, +2 stamina'], costs: ['-3 rebounding, -2 defense, -2 finishing'], story: 'lean and quick, built for speed rather than contact' },
  { id: 'balanced', label: 'Balanced', icon: '⚖️', blurb: 'No weak spot and no standout one.', perks: ['No trade-offs'], costs: [], story: 'evenly built' },
  { id: 'strong', label: 'Strong and heavy', icon: '🦬', blurb: 'You win the contact.', perks: ['+3 rebounding, +2 defense, +2 finishing'], costs: ['-3 athleticism, -2 handles, -2 stamina'], story: 'strong and heavy, built to win the contact rather than run past it' },
];

export const LABELS = {
  background: Object.fromEntries(BACKGROUNDS.map((b) => [b.id, b.label])) as Record<Background, string>,
  motive: Object.fromEntries(MOTIVES.map((b) => [b.id, b.label])) as Record<Motive, string>,
  temperament: Object.fromEntries(TEMPERAMENTS.map((b) => [b.id, b.label])) as Record<Temperament, string>,
};

/* ───────────────────────── For the narrator ───────────────────────── */

/** What the storyteller must know about the player's roots. Empty for saves that never chose. */
export function originBlock(state: GameState): string | null {
  const o = state.player.origin;
  if (!o.chosen) return null;
  const bg = BACKGROUNDS.find((b) => b.id === o.background)!;
  const mo = MOTIVES.find((b) => b.id === o.motive)!;
  const te = TEMPERAMENTS.find((b) => b.id === o.temperament)!;
  const bu = BUILDS.find((b) => b.id === o.look.build)!;
  return [
    'WHO THE PLAYER IS (let this color choices, worries, dialogue and small details; do not recite it):',
    `- Family: ${bg.story}`,
    `- What drives them: ${mo.story}`,
    `- Temperament: ${te.story}`,
    `- Build: ${bu.story}. Wears number ${o.look.number}.`,
  ].join('\n');
}

/* ───────────────────────── Goals and heirs ───────────────────────── */

/** The long-term goal that matches why the player plays. */
export const goalForMotive = (m: Motive): string => ({ prove: 'rival', provide: 'money', love: 'ovr', fame: 'followers', legacy: 'surpass' })[m];

/** An heir's origin: grew up in the shadow (or the comfort) of a legend, with the family's looks. */
export function heirOrigin(o: {
  relation: 'child' | 'protege';
  tier: number;
  earnings: number;
  parent: Origin;
  rand: () => number;
}): Origin {
  const { relation, tier, earnings, parent, rand } = o;
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  // a protege comes from the old neighborhood; a child of a rich legend grows up rich, of a famous one grows up in the game
  const background: Background = relation === 'protege' ? 'struggling' : earnings >= 40_000_000 ? 'wealthy' : tier >= 1 ? 'athletic' : pick<Background>(['working', 'comfortable']);
  const motive: Motive = relation === 'child' ? 'legacy' : pick<Motive>(['prove', 'provide', 'love']);
  const temperament: Temperament = pick<Temperament>(['steady', 'fiery', 'loyal', 'charming', 'loner']);
  const skin = relation === 'child' ? clamp(parent.look.skin + (rand() < 0.5 ? 0 : rand() < 0.5 ? -1 : 1), 0, 7) : Math.floor(rand() * 8);
  return {
    chosen: true,
    background,
    motive,
    temperament,
    look: { skin, hair: Math.floor(rand() * 7), style: pick(['buzz', 'short', 'waves', 'afro', 'braids', 'cap']), build: pick<Build>(['lean', 'balanced', 'strong']), number: Math.floor(rand() * 45) + 1 },
  };
}
