import { TEAMS_BY_LEVEL } from '../data/teams';
import type { Archetype, Athlete, GameState, Legend, Origin, Position } from '../state/schemas';
import { addNpc, beginGeneration, userAthlete } from './career';
import { makeNpc } from './generate';
import { ensureGoals } from './goals';
import { TIER_LABELS, legendOf } from './legacyScore';
import { NameBook } from './nameBook';
import { addNews } from './news';
import { heirOrigin, startRatings } from './origin';
import { ARCHETYPE_INFO, heightFor, makeRatings } from './ratings';
import { RNG, clamp } from './rng';

/**
 * The next generation. When a career ends, the same save carries on with someone who grew up in its shadow: your own
 * kid if you had one, otherwise a young player you took under your wing. The old career is filed in the family record
 * (`state.legacy.lineage`), the world moves on a few years, and the new player starts in ninth grade with the family
 * name behind them. Fame is inherited only as a head start (a little rating, a little reputation); the climb is theirs.
 */

export type Relation = 'child' | 'protege';

/** Starting rating bonus and potential bonus by the tier of fame the player is born into. */
const RATING_BONUS = [0, 0, 1, 1.5, 2.5, 3.5];
const POTENTIAL_BONUS = [0, 0, 0, 1, 2, 3];

export interface HeirPlan {
  relation: Relation;
  athlete: Athlete;
  traits: string[];
  hometown: string;
  /** Fame tier the heir is born into (0 to 5). */
  tier: number;
  tierLabel: string;
  parentName: string;
  /** Where the heir comes from and why they play. */
  origin: Origin;
  yearsLater: number;
  schoolIndex: number;
  reputation: number;
  followers: number;
  money: number;
  /** One line for the retirement screen. */
  blurb: string;
}

/** A generator tied to the save and the generation, so the preview and the real start always agree and nothing shifts the game's own random sequence. */
function planRng(state: GameState): RNG {
  let h = 0x811c9dc5 ^ (state.legacy.generation * 7919);
  for (const ch of state.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return new RNG((h ^ 0xa17e) >>> 0);
}

export const canContinueLegacy = (state: GameState): boolean => state.career.phase === 'retired';

export function planHeir(state: GameState): HeirPlan {
  const rng = planRng(state);
  const parent = userAthlete(state);
  const legend = legendOf(state);
  const hasKid = Number(state.story.flags.kids ?? 0) > 0;
  const relation: Relation = hasKid ? 'child' : 'protege';
  // a protégé only gets half the head start: the name is not theirs
  const tier = relation === 'child' ? legend.tier : Math.floor(legend.tier / 2);

  const names = NameBook.fromState(state);
  let firstName: string;
  let lastName: string;
  if (relation === 'child') {
    lastName = parent.lastName;
    firstName = names.firstName(rng, 'any');
    for (let i = 0; i < 40 && names.isTaken(firstName, lastName); i++) firstName = names.firstName(rng, 'any');
  } else {
    const d = names.draw(rng, { gender: 'any' });
    firstName = d.firstName;
    lastName = d.lastName;
  }

  const positions: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  // a child often plays like the parent
  const samePosition = relation === 'child' && rng.chance(0.5);
  const position = samePosition ? parent.position : rng.pick(positions);
  const fits = (Object.keys(ARCHETYPE_INFO) as Archetype[]).filter((a) => ARCHETYPE_INFO[a].positions.includes(position));
  const archetype: Archetype = relation === 'child' && fits.includes(parent.archetype) && rng.chance(0.55) ? parent.archetype : rng.pick(fits);
  const heightIn = samePosition ? clamp(parent.heightIn + rng.int(-2, 2), 64, 90) : heightFor(rng, position);

  const athlete: Athlete = {
    id: rng.id('ath'),
    firstName,
    lastName,
    position,
    archetype,
    heightIn,
    age: 14,
    ratings: makeRatings(rng, 40 + RATING_BONUS[tier], 1.5, archetype),
    potential: clamp(rng.int(88, 95) + POTENTIAL_BONUS[tier], 88, 98),
    teamId: null,
    persistent: true,
  };

  const origin = heirOrigin({ relation, tier, earnings: legend.earnings, parent: state.player.origin, rand: () => rng.next() });
  startRatings(athlete.ratings, origin);

  const pool = ['clutch', 'gym_rat', 'leader', 'hothead', 'scholar', 'showman'];
  const inherited = relation === 'child' && state.player.traits.length && rng.chance(0.6) ? [rng.pick(state.player.traits)] : [];
  const traits = [...inherited, ...rng.shuffle(pool.filter((t) => !inherited.includes(t)))].slice(0, 2);

  const blurb =
    relation === 'child'
      ? `Your kid ${firstName} ${lastName}, a ninth-grade ${position}. The ${lastName} name opens doors${tier >= 2 ? ' and everyone is watching' : ''}.`
      : `A young player you took under your wing: ${firstName} ${lastName}, a ninth-grade ${position} from your old neighborhood. You had no kids of your own, so you put your time here.`;

  return {
    relation,
    athlete,
    traits,
    hometown: state.player.hometown,
    tier,
    tierLabel: TIER_LABELS[tier],
    parentName: `${parent.firstName} ${parent.lastName}`,
    origin,
    yearsLater: clamp(rng.int(40, 46) - parent.age, 3, 14),
    schoolIndex: rng.int(0, TEAMS_BY_LEVEL.hs.length - 1),
    reputation: 5 + tier * 6,
    followers: 150 + tier * tier * 400,
    money: Math.min(1000, tier * tier * 40),
    blurb,
  };
}

/**
 * Files the finished career and starts the heir's. Call only after retirement. Returns the legend that was filed,
 * for the caller to add to the Hall of Fame.
 */
export function startNextGeneration(state: GameState): { legend: Legend; plan: HeirPlan } {
  if (!canContinueLegacy(state)) throw new Error('The career has not ended.');
  const plan = planHeir(state);
  const legend = legendOf(state);
  const parent = userAthlete(state);

  // people from the old career who can still matter to the next one
  const old = Object.values(state.npcs);
  const spouse = old.find((n) => n.role === 'love_interest' && n.active && ['partner', 'engaged', 'married'].includes(String(state.story.flags.love_stage)));
  const rival = old.find((n) => n.role === 'rival');
  const friend = old.find((n) => n.role === 'friend');
  const legendSummary = legend.summary;

  state.legacy.lineage.push(legend);
  const season = state.career.season;

  const rng = new RNG(state.rngState);
  beginGeneration(state, rng, plan.athlete, {
    schoolIndex: plan.schoolIndex,
    hometown: plan.hometown,
    traits: plan.traits,
    money: plan.money,
    reputation: plan.reputation,
    followers: plan.followers,
    yearsLater: plan.yearsLater,
    origin: plan.origin,
  });

  const heir = plan.athlete;
  const gen = state.legacy.generation + 1;
  state.legacy.generation = gen;
  state.legacy.family = heir.lastName;
  state.legacy.inherited = plan.tier;
  state.legacy.relation = plan.relation;
  state.legacy.parent = plan.parentName;

  // the parent in the story is the legend, not a stranger who shares the surname
  const family = Object.values(state.npcs).find((n) => n.role === 'family');
  if (plan.relation === 'child' && family) {
    family.name = plan.parentName;
    family.title = `Your parent, ${legend.tierLabel.toLowerCase()} and retired legend`;
    family.personality = ['proud', 'demanding'];
    family.relationship.respect = 70;
    family.memories.push(`Retired after ${legend.seasons} seasons. ${legendSummary}`);
  } else {
    addNpc(
      state,
      makeNpc(rng, {
        name: plan.parentName,
        role: 'mentor',
        title: `Your mentor, a retired ${legend.tierLabel.toLowerCase()}`,
        season: state.career.season,
        personality: ['wise', 'demanding'],
        rel: { affinity: 55, trust: 60, respect: 70 },
        memories: [`Retired after ${legend.seasons} seasons and took you under their wing. ${legendSummary}`],
      }),
    );
  }
  if (spouse && plan.relation === 'child') {
    addNpc(state, makeNpc(rng, { name: spouse.name, role: 'family', title: 'Your other parent', season: state.career.season, rel: { affinity: 70, trust: 70, respect: 50 } }));
  }
  if (rival) {
    addNpc(
      state,
      makeNpc(rng, {
        name: rival.name,
        role: 'mentor',
        title: `Retired star and ${plan.parentName}'s old rival, now a TV analyst`,
        season: state.career.season,
        personality: ['blunt', 'fair'],
        rel: { affinity: 0, trust: 20, respect: 45 },
        memories: [`Spent a career going head to head with ${plan.parentName}. Respects the name, will not go easy on ${heir.firstName}.`],
      }),
    );
  }
  if (friend) {
    addNpc(
      state,
      makeNpc(rng, {
        name: friend.name,
        role: 'mentor',
        title: `${plan.parentName}'s oldest friend, now a youth coach`,
        season: state.career.season,
        personality: ['warm', 'loyal'],
        rel: { affinity: 55, trust: 55, respect: 45 },
        memories: [`Came up with ${plan.parentName} and has watched ${heir.firstName} grow up.`],
      }),
    );
  }

  state.rngState = rng.state;
  state.story.careerSummary = `${heir.firstName} ${heir.lastName} is the next generation of the ${heir.lastName === parent.lastName ? heir.lastName : parent.lastName} basketball story: ${plan.blurb} ${plan.parentName}'s career: ${legendSummary}`;
  state.story.defining.push({ season, text: `${plan.parentName} retired as a ${legend.tierLabel}. ${legendSummary}` });
  const team = state.teams[state.career.teamId];
  addNews(state, `${heir.firstName} ${heir.lastName}, ${plan.relation === 'child' ? `child of ${plan.parentName}` : `protégé of ${plan.parentName}`}, joins ${team.name} as a freshman.`);
  ensureGoals(state);
  return { legend, plan };
}

/** A line for the family tree: who came before and how far they got. */
export function lineageLine(l: Legend): string {
  return `${l.name} · ${l.tierLabel} · ${l.titles} title${l.titles === 1 ? '' : 's'} · ${l.seasons} seasons`;
}
