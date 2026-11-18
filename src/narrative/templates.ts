import { PROFILE_SCENES } from '../engine/characters';
import type { Effect, GameState } from '../state/schemas';
import type { SceneSetup } from './parse';
import type { ScenePlan } from './scenes';

/** Fallback text used when no LLM is configured or the model fails. Keeps the game playable. */

function cast(state: GameState, plan: ScenePlan) {
  return plan.castIds.map((id) => state.npcs[id]).filter(Boolean);
}

export const OPENERS: Record<string, string[]> = {
  season_opener: [
    'The gym lights hum to life. New season, new jerseys, same squeak of rubber on hardwood. Everyone is sizing everyone up.',
  ],
  practice: ['Practice runs long. Coach blows the whistle hard enough to rattle the bleachers and points at you.'],
  locker_room: ['The locker room smells like tape and body spray. Somebody has a speaker going, and somebody else has an opinion.'],
  school: ['Third period drags. Your phone buzzes under the desk — the group chat is talking about you.'],
  family: ['Dinner at home. The TV murmurs in the background while the conversation turns, inevitably, to basketball.'],
  social: ['Friday night. The party is loud, the music is louder, and half the people here know your name now.'],
  rival_encounter: ['Open gym on a Sunday. You walk in and there they are, shooting at your usual hoop like they own it.'],
  rivalry_week: ['Rivalry week. The hallways are buzzing, and your notifications are worse.'],
  low_point: ['You have been in your own head for days. Every miss replays when you close your eyes.'],
  injury: ['The brace on your leg feels heavier than it should. Watching from the bench is its own kind of pain.'],
  playoff_pressure: ['Playoffs. One loss and it is over. The air in the gym feels different.'],
  date: ['You spent way too long picking what to wear. Your heart is doing a full-court press.'],
  consequence: ['Something you did a while ago has caught up with you. It is not going away on its own.'],
  reconcile: ['You see them across the room and neither of you moves. It has been a while since you really talked.'],
  coach_meeting: ['Coach asks you to stay after practice. The gym empties out. This is going to be a straight conversation.'],
  academics: ['A note in your locker says to stop by the counselor. You already know what it is about.'],
};

/** Player-facing dilemma lines (the LLM brief is internal and never shown). */
export const DILEMMAS: Record<string, string> = {
  season_opener: 'Coach looks around the gym and asks who wants to set the tone today. Every eye in the room drifts toward you.',
  practice: 'Coach wants to know why your man scored three straight times in the drill. The whole gym goes quiet, waiting on your answer.',
  locker_room: 'Somebody is talking about who should be starting, loud enough for you to hear. A couple of guys are watching for your reaction.',
  school: 'Your teacher hands back a test you barely studied for, and the person next to you leans over with a question.',
  family: 'The question comes, the one you knew was coming: is all this basketball actually going anywhere?',
  social: 'Someone you barely know offers a ride to an after-party across town. Your friends are split on going.',
  rival_encounter: 'They spot you, smirk, and check the ball your way. "One to eleven. Unless you are scared."',
  rivalry_week: 'A clip of your rival talking about you is going around. Your phone will not stop buzzing.',
  low_point: 'You can sit here replaying misses, or you can do something about it.',
  injury: 'The trainer says rest. Your gut says you are falling behind every day you sit.',
  playoff_pressure: 'Coach pulls you aside before practice. "I need more from you this week. What have you got?"',
  date: 'It is quieter than you expected, and suddenly you are not sure what to say.',
  consequence: 'You can own what happened or try to talk your way around it. Either way, people are watching how you handle it.',
  reconcile: 'You could say sorry, you could say nothing, or you could finally say what you really think.',
  coach_meeting: 'Coach lays out where you stand and asks what you are going to do about it.',
  academics: 'The counselor says it plainly: fix your grades or you will not play. What do you say?',
  summer_workouts: 'An older player offers to train with you at 5 a.m. all summer. That means giving up a lot of everything else.',
  aau_tournament: 'Scouts are in the stands, and your rival is warming up on the other end. Everybody knows it.',
  summer_break: 'For the first time in months there is no practice tomorrow. How you spend it says a lot about you.',
};

const GENERIC_CHOICES: { text: string; tone: string }[][] = [
  [
    { text: 'Step up and take charge of the moment.', tone: 'bold' },
    { text: 'Hang back, listen, and read the room.', tone: 'calm' },
    { text: 'Crack a joke to cut the tension.', tone: 'funny' },
    { text: 'Push back hard — you will not be disrespected.', tone: 'aggressive' },
  ],
  [
    { text: 'Tell the truth, even if it stings.', tone: 'honest' },
    { text: 'Offer help and support without being asked.', tone: 'kind' },
    { text: 'Play it cool and keep your cards close.', tone: 'sly' },
  ],
];

export function templateScene(state: GameState, plan: ScenePlan, seed: number): SceneSetup {
  const people = cast(state, plan);
  // someone in the room who has their own way of being there changes how the scene opens and what it asks of you
  const own = people.map((p) => PROFILE_SCENES[p.profile]?.[plan.kind]).find(Boolean);
  const opener = own?.opener ?? (OPENERS[plan.kind] ?? ['Another day, another test of who you are becoming.'])[0];
  const names = people.map((p) => p.name);
  const who = names.length ? ` ${names.join(names.length > 1 ? ' and ' : '')} ${names.length > 1 ? 'are' : 'is'} here, watching how you handle it.` : '';
  const choices = GENERIC_CHOICES[seed % GENERIC_CHOICES.length];
  return {
    title: plan.kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    location: '',
    narration: `${opener}${who}\n\n${own?.dilemma ?? DILEMMAS[plan.kind] ?? 'The moment is yours. How you handle it will be remembered.'}`,
    choices: choices.map((c, i) => ({ id: String.fromCharCode(97 + i), ...c })),
  };
}

export const TONE_EFFECTS: Record<string, { narration: string; build: (ids: string[]) => Effect[] }> = {
  bold: {
    narration: 'You step forward. It is a risk, but people notice when you do not flinch.',
    build: (ids) => [{ type: 'morale', delta: 3 }, ...ids.map((id): Effect => ({ type: 'rel', npc: id, field: 'respect', delta: 4 }))],
  },
  calm: {
    narration: 'You take a breath and let the moment come to you. Patience has its own kind of power.',
    build: (ids) => ids.map((id): Effect => ({ type: 'rel', npc: id, field: 'trust', delta: 3 })),
  },
  funny: {
    narration: 'The joke lands. The tension cracks, and for a second everyone is just a kid who loves this game.',
    build: (ids) => [{ type: 'morale', delta: 2 }, ...ids.map((id): Effect => ({ type: 'rel', npc: id, field: 'affinity', delta: 4 }))],
  },
  aggressive: {
    narration: 'You do not back down. Voices rise. It might cost you something, but nobody will mistake you for soft.',
    build: (ids) => [
      { type: 'reputation', delta: 1 },
      ...ids.flatMap((id): Effect[] => [
        { type: 'rel', npc: id, field: 'affinity', delta: -4 },
        { type: 'rel', npc: id, field: 'rivalry', delta: 5 },
      ]),
    ],
  },
  honest: {
    narration: 'You say what is true. It stings a little, but it clears the air.',
    build: (ids) => ids.map((id): Effect => ({ type: 'rel', npc: id, field: 'trust', delta: 5 })),
  },
  kind: {
    narration: 'You show up for someone else. It costs you nothing and means more than you expect.',
    build: (ids) => [{ type: 'morale', delta: 2 }, ...ids.map((id): Effect => ({ type: 'rel', npc: id, field: 'affinity', delta: 5 }))],
  },
  sly: {
    narration: 'You keep it cool and give away nothing. They are left wondering what you are really thinking.',
    build: (ids) => ids.map((id): Effect => ({ type: 'rel', npc: id, field: 'respect', delta: 2 })),
  },
};

export function templateResolution(plan: ScenePlan, tone: string, choiceText: string): { narration: string; summary: string; effects: Effect[] } {
  const t = TONE_EFFECTS[tone] ?? TONE_EFFECTS.calm;
  const effects = t.build(plan.castIds);
  // time together counts for something even when the narrator is off
  if (plan.kind === 'date') for (const id of plan.castIds) effects.push({ type: 'rel', npc: id, field: 'romance', delta: 4 });
  return {
    narration: t.narration,
    summary: `${plan.kind.replace(/_/g, ' ')}: you chose to "${choiceText}".`,
    effects,
  };
}
