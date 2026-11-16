import type { GameState, Npc } from '../state/schemas';
import { addNews } from './news';
import { modsOf } from './origin';
import { clamp } from './rng';

/**
 * Life outside the gym. A crush can become a relationship, survive a move to a new level, become an engagement and a
 * marriage, and bring kids. It can also fall apart if you neglect it. The stage lives in a story flag; the relationship
 * numbers on the NPC decide how fast things move.
 */

export type Stage = 'none' | 'crush' | 'dating' | 'partner' | 'engaged' | 'married';
const ORDER: Stage[] = ['none', 'crush', 'dating', 'partner', 'engaged', 'married'];

export const loveOf = (state: GameState): Npc | undefined => Object.values(state.npcs).find((n) => n.role === 'love_interest' && n.active);

/** Where the relationship stands. With no stage recorded yet, it follows how close you are. */
export function stageOf(state: GameState): Stage {
  const v = state.story.flags.love_stage;
  if (typeof v === 'string' && (ORDER as string[]).includes(v)) return v as Stage;
  const n = loveOf(state);
  if (!n) return 'none';
  return n.relationship.romance >= 15 ? 'crush' : 'none';
}

export const atLeast = (state: GameState, s: Stage): boolean => ORDER.indexOf(stageOf(state)) >= ORDER.indexOf(s);
export const kidsOf = (state: GameState): number => Number(state.story.flags.kids ?? 0);

const TITLE: Record<Stage, string> = {
  none: 'Someone you used to know well',
  crush: 'Someone you cannot stop thinking about',
  dating: 'Someone you are seeing',
  partner: 'Your partner',
  engaged: 'Your future spouse',
  married: 'Your spouse',
};

export function setStage(state: GameState, stage: Stage) {
  state.story.flags.love_stage = stage;
  state.story.flags.love_since = state.career.season;
  const n = loveOf(state);
  if (n && stage !== 'none') n.title = TITLE[stage];
}

/** Each week the relationship needs attention: it cools if nobody tends it, and can end. Kids tire you and lift you. */
export function weeklyRomance(state: GameState) {
  const n = loveOf(state);
  const stage = stageOf(state);
  // seeing someone regularly lets a spark grow on its own, up to the point where it takes a conversation to go further
  if (n && !n.estranged && !state.story.flags.love_far && (stage === 'none' || stage === 'crush') && n.relationship.affinity >= 0 && n.relationship.romance < 50) {
    n.relationship.romance = Math.min(50, n.relationship.romance + modsOf(state).romanceMul);
  }
  if (n && ORDER.indexOf(stage) >= ORDER.indexOf('dating')) {
    // time together keeps it going; distance does not
    if (stage !== 'married' && !longDistance(state) && n.relationship.affinity >= 0 && n.relationship.romance < 75) n.relationship.romance = Math.min(75, n.relationship.romance + 0.45 * modsOf(state).romanceMul);
    n.relationship.romance = clamp(n.relationship.romance - (stage === 'married' ? 0.15 : stage === 'dating' ? 0.25 : 0.2), 0, 100);
    if (stage !== 'married' && n.relationship.romance < 15) {
      setStage(state, 'none');
      n.estranged = true;
      n.title = 'Your ex';
      n.memories.push('It ended. You grew apart.');
      state.player.morale = clamp(state.player.morale - 8, 0, 100);
      addNews(state, `${state.athletes[state.player.athleteId].lastName} and ${n.name} split up.`);
    }
  }
  const kids = kidsOf(state);
  if (kids > 0) {
    state.player.energy = clamp(state.player.energy - Math.min(3, kids), 0, 100);
    state.player.morale = clamp(state.player.morale + Math.min(2, kids), 0, 100);
  }
}

/** A move up a level puts distance between you. A serious relationship has to survive it. */
export function romanceNewLevel(state: GameState) {
  const n = loveOf(state);
  // a crush on someone back home does not travel well
  if (n && !atLeast(state, 'dating')) {
    n.relationship.romance = clamp(n.relationship.romance - 10, 0, 100);
    n.title = 'Someone from back home';
    state.story.flags.love_far = true; // you are not in the same place any more, so nothing grows on its own
    return;
  }
  if (!n || stageOf(state) === 'married') return;
  state.story.flags.long_distance = state.career.season + 1;
  n.title = `${TITLE[stageOf(state)]}, now far away`;
  n.memories.push('You moved away for the next level. Keeping this going is going to take work.');
}

/** True while the distance is still new. */
export const longDistance = (state: GameState): boolean => Number(state.story.flags.long_distance ?? 0) >= state.career.season && atLeast(state, 'dating') && stageOf(state) !== 'married';

export const loveBlock = (state: GameState): string | null => {
  const n = loveOf(state);
  const stage = stageOf(state);
  const kids = kidsOf(state);
  if (!n || stage === 'none') return kids ? `The player has ${kids} kid${kids > 1 ? 's' : ''}.` : null;
  const word = { crush: 'has a crush on', dating: 'is seeing', partner: 'is in a serious relationship with', engaged: 'is engaged to', married: 'is married to' }[stage];
  return `The player ${word} ${n.name}${longDistance(state) ? ' (long distance)' : ''}${kids ? `, and has ${kids} kid${kids > 1 ? 's' : ''}` : ''}.`;
};
