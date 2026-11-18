import type { GameState, Npc, NpcRole } from '../state/schemas';

/**
 * People with lives of their own. Once a week, someone close to you might send a message, in their own voice, about
 * what is actually going on: you got hurt, you scored 30, you lost three in a row, or nothing in particular. It uses no
 * random numbers, only a hash of who, when and how things stand, so it never changes anything else in the game.
 */

export type Mood = 'injured' | 'big' | 'rough' | 'win' | 'loss' | 'champ' | 'idle';
export type Style = 'warm' | 'loud' | 'dry' | 'formal' | 'anxious' | 'blunt';

/** How each kind of person talks. */
export const STYLE: Record<string, Style> = {
  disciplinarian: 'formal', players_coach: 'warm', tactician: 'dry', old_school: 'blunt', climber: 'loud', burned_out: 'dry', politician: 'formal', father_figure: 'warm',
  trash_talker: 'loud', quiet_grinder: 'dry', old_friend: 'warm', reluctant: 'anxious', chip: 'blunt', class_act: 'formal', fan_made: 'dry',
  demanding_star: 'blunt', glue_guy: 'warm', insecure_vet: 'formal', mentor_vet: 'warm', class_clown: 'loud', quiet_leader: 'dry', hungry_bench: 'anxious',
  ride_or_die: 'loud', drifting: 'dry', friendly_rival: 'blunt', worrier: 'anxious', hype_man: 'loud',
  steady_supporter: 'warm', stage_parent: 'loud', worried_parent: 'anxious', proud_talker: 'loud', overworked: 'warm', former_player: 'blunt', practical: 'formal',
  in_your_corner: 'warm', independent: 'dry', keeps_you_honest: 'dry', slow_to_open: 'anxious', going_somewhere: 'warm',
  shark: 'loud', protector: 'formal', green_agent: 'anxious', smooth_agent: 'warm', old_hand: 'blunt',
  fair_reporter: 'formal', sensationalist: 'loud', fan_writer: 'warm', digger: 'dry',
  blunt_scout: 'blunt', flatterer: 'warm', numbers_scout: 'formal',
};

/** What each way of talking says about what just happened. */
export const REACT: Record<Style, Partial<Record<Mood, string[]>>> = {
  warm: {
    injured: ['Heard you are hurt. Rest up, please, and let me know if you need anything.', 'Thinking about you. Take the time you need to heal.'],
    big: ['Saw what you did last game. I am so proud of you.', 'That was a great game. Call me when you have a minute.'],
    rough: ['Rough game. It happens to everyone. You are still great.', 'Do not let one bad night get to you. I am on your side.'],
    win: ['Congrats on the win! Enjoy tonight.', 'Great team win. You must be tired and happy.'],
    loss: ['Tough loss. Get some sleep, it will look better tomorrow.', 'Sorry about the game. I am here if you want to talk about it.'],
    champ: ['You won the title! I cannot believe it. So proud of all of you.', 'Champions! I am telling everyone.'],
  },
  loud: {
    injured: ['WHAT HAPPENED?? Are you okay??', 'I heard you are hurt. Tell me you are okay.'],
    big: ['YOU WENT OFF LAST NIGHT!!', 'Did you see your numbers?? Unreal.'],
    rough: ['Shake it off, that was one game. You are better than that.', 'Bad night. Forget it. Next game is yours.'],
    win: ['WE WON!! Let us go!', 'Big win. I am so hyped.'],
    loss: ['That one hurt. Get back in the gym.', 'We will get the next one. Do not let this sit.'],
    champ: ['CHAMPIONS!!! I am losing my mind!', 'You did it!!! I am so loud right now.'],
  },
  dry: {
    injured: ['Heard about the injury. Take care of it properly.', 'You are hurt. Do not rush back.'],
    big: ['Good game. I noticed.', 'Nice numbers last night.'],
    rough: ['Not your best game. Fix it.', 'You shot poorly. You will shoot better.'],
    win: ['Good win.', 'The team played well. So did you.'],
    loss: ['Tough one. Watch the film.', 'Lost. It happens. Move on.'],
    champ: ['Congratulations. You earned it.', 'Champions. Well done.'],
  },
  formal: {
    injured: ['I was sorry to hear about your injury. Please follow the medical advice carefully.', 'Please let me know how your recovery goes.'],
    big: ['Congratulations on an excellent performance.', 'That was a strong game. Well done.'],
    rough: ['A difficult game. I am confident you will respond well.', 'One poor performance is not a trend. Stay focused.'],
    win: ['Congratulations on the win.', 'A good result for the team.'],
    loss: ['A disappointing result. Let us look at what we can learn.', 'A tough loss. I expect you to bounce back.'],
    champ: ['Congratulations on the championship. It is a real accomplishment.', 'Many congratulations to you and the team.'],
  },
  anxious: {
    injured: ['I just heard. Are you okay? Please take care of yourself.', 'I am worried about you. Is it bad?'],
    big: ['I watched your game, you were amazing. Did you eat after?', 'That was a great game! Do not forget to rest.'],
    rough: ['Are you okay? I know that was a hard game.', 'Do not be too hard on yourself. Please.'],
    win: ['You won! Make sure you drink water.', 'Great win. Are you getting enough sleep?'],
    loss: ['I am sorry. Are you doing okay?', 'It is just one game. Please do not stress.'],
    champ: ['You did it! I am so happy, I could cry.', 'Champions!! Please rest now, you earned it.'],
  },
  blunt: {
    injured: ['You are hurt. Do the rehab. Do not play through it.', 'Heard you are injured. Come back right or do not come back.'],
    big: ['Good game. Do it again.', 'That was good. Now be consistent.'],
    rough: ['You played badly. You know it. Fix it.', 'Bad shooting night. Work on it this week.'],
    win: ['Good win. Do not get comfortable.', 'Win is a win. Next one.'],
    loss: ['You lost. Figure out why.', 'Bad loss. Go find out what went wrong.'],
    champ: ['Champions. Do not forget how it felt.', 'You won. Now do it again next year.'],
  },
};

/** What each person says when nothing in particular is going on. A few of these are the only line they have. */
export const IDLE: Record<string, string[]> = {
  disciplinarian: ['Practice is at 3:00 tomorrow. Please be early.'],
  players_coach: ['Hey, just checking in. How are you doing?'],
  tactician: ['I found a clip of your last game I want to show you.'],
  old_school: ['Come by early tomorrow. I want to show you a drill.'],
  climber: ['Big week coming up. I need everyone sharp.'],
  burned_out: ['Gym is open late if you need to get shots up.'],
  politician: ['Remember we have a donor dinner next week. Please be there.'],
  father_figure: ['Have you eaten? I made too much food, come by.'],
  trash_talker: ['Still thinking about when we play. You are not ready.'],
  quiet_grinder: ['Gym at 6 tomorrow. Open if you want to work.'],
  old_friend: ['Drove past the old court today. Still thinking about it.'],
  reluctant: ['Hey. Hope you are doing well. I hope this week is quiet.'],
  chip: ['Saw you at the gym. You work harder than I thought.'],
  class_act: ['Good luck this week. May the best player win.'],
  fan_made: ['Did you see what people are saying about us? Wild.'],
  demanding_star: ['We need to talk about the offense before Friday.'],
  glue_guy: ['I will bring snacks to the bus. Anything you want?'],
  insecure_vet: ['Hey, great to see you at practice. Let me know if you need anything.'],
  mentor_vet: ['Come get lunch with me. I have something I want to tell you.'],
  class_clown: ['I have a new bit for the bus. You will either love it or hate it.'],
  quiet_leader: ['Six a.m. gym. If you want.'],
  hungry_bench: ['Can I get a few extra reps with you after practice?'],
  ride_or_die: ['What are you doing this weekend? I am free.'],
  drifting: ['Sorry I have been bad at texting. Life is crazy.'],
  friendly_rival: ['I bet I can make more threes than you this week. Dinner on the line.'],
  worrier: ['Did you eat today? Did you finish the reading?'],
  hype_man: ['Your next game is going to be so good, I can feel it.'],
  steady_supporter: ['I will be there Friday. Nothing you need to do.'],
  stage_parent: ['I talked to someone about your plans. Call me.'],
  worried_parent: ['Are you sleeping? Are you wearing the brace?'],
  proud_talker: ['Everyone at work keeps asking about you. I tell them all about it.'],
  overworked: ['Working late again. Save me a seat if you can.'],
  former_player: ['Been thinking about your footwork. Call me when you can.'],
  practical: ['Reminder to look at your schedule for next week.'],
  in_your_corner: ['Thinking about you. How is your day going?'],
  independent: ['Busy week for me. Want to get dinner on Thursday?'],
  keeps_you_honest: ['I saw your highlights. Do not let them go to your head.'],
  slow_to_open: ['Hi. I was thinking about you. Nothing important.'],
  going_somewhere: ['I have a big week. Want to hear about it on Sunday?'],
  shark: ['I have three calls this week about you. Big things coming.'],
  protector: ['I am reviewing your options for next year. No decisions yet.'],
  green_agent: ['Hi! Just checking if you need anything. I am always available!'],
  smooth_agent: ['Everyone is talking about you. It is a great time to be you.'],
  old_hand: ['Watched some film. Come by my office when you can.'],
  fair_reporter: ['I am working on a piece about the team. Can I get your thoughts later?'],
  sensationalist: ['Anything good for me this week? Even just one quote.'],
  fan_writer: ['I am so excited about this team. Great season so far.'],
  digger: ['Do you have a minute? Just a couple of background questions.'],
  blunt_scout: ['I am at your game Friday. Show me your left hand.'],
  flatterer: ['You are on a lot of lists. I am always in your corner.'],
  numbers_scout: ['I have your latest measurements. They are interesting.'],
};

/** General check-ins for when someone has nothing specific to say, so a person is never limited to a single line. */
export const CHECK_IN: Record<Style, string[]> = {
  warm: ['Hope your week is going well.', 'Just thinking of you. Talk soon.', 'Let me know if you need anything.'],
  loud: ['What is up?! Been a minute.', 'You free this weekend?', 'Miss seeing you around.'],
  dry: ['Checking in.', 'Busy week. Hope yours is fine.', 'Let me know if anything changes.'],
  formal: ['I hope your week is going well.', 'Please let me know if I can help with anything.', 'Wishing you a good week.'],
  anxious: ['Hi, just checking that you are okay.', 'Hope you are taking care of yourself.', 'Thinking of you, hope all is well.'],
  blunt: ['Stay focused.', 'Work hard this week.', 'Keep your head on straight.'],
};

/** Check-ins for people whose job is not being your friend, so a reporter does not say "thinking of you". */
export const ROLE_CHECK_IN: Partial<Record<NpcRole, string[]>> = {
  coach: ['Make sure you rest well before the next game.', 'Stay ready. Practice will be hard this week.', 'I am happy with how you have been working.'],
  rival: ['See you on the court.', 'Enjoy your week. Next time we play, I will not go easy.', 'Heard you have been busy. So have I.'],
  teammate: ['Ready for the next game?', 'Are you coming to the team dinner this week?', 'Want to get extra shots up after practice?'],
  agent: ['Just checking in. Any questions about your contract?', 'Let me know if you want to go over your options.', 'Nothing new this week. I will call if that changes.'],
  media: ['Do you have time for a quick question this week?', 'Anything new with the team I should know about?', 'I am filing a story Friday. Anything you want to add?'],
  scout: ['I will be at your next game.', 'Hope the season is going well. Keep working.', 'Send me your schedule when you can.'],
};

/** Roughly how often (per week) each kind of person reaches out, before closeness and news change it. */
const BASE: Partial<Record<NpcRole, number>> = { friend: 0.2, family: 0.16, love_interest: 0.24, coach: 0.09, rival: 0.07, teammate: 0.09, agent: 0.07, media: 0.06, scout: 0.05 };

const ROLE_LABEL: Partial<Record<NpcRole, string>> = { friend: 'Friend', family: 'Family', love_interest: 'Partner', coach: 'Coach', rival: 'Rival', teammate: 'Teammate', agent: 'Agent', media: 'Reporter', scout: 'Scout' };

/** A number between 0 and 1 that depends only on the text. */
export function unit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** What has been going on with the player, in a word. */
export function moodOf(s: GameState): Mood {
  if (s.player.injury) return 'injured';
  const g = s.gameLog[s.gameLog.length - 1];
  if (g && g.season === s.career.season && s.career.week - g.week <= 1 && g.line.sec > 0) {
    const big = { hs: 25, college: 22, pro: 28 }[g.level];
    const l = g.line;
    if (l.pts >= big) return 'big';
    if ((l.fga >= 8 && l.fgm / l.fga < 0.3) || l.tov >= 5) return 'rough';
    return g.teamScore > g.oppScore ? 'win' : 'loss';
  }
  if (s.career.phase === 'offseason' && s.league.champion === s.career.teamId) return 'champ';
  return 'idle';
}

const closeness = (n: Npc) => Math.max(0, Math.min(1, (n.relationship.affinity + n.relationship.trust) / 200));

/** The line this person would send now, or null if they have nothing new to say (they never repeat a recent message). */
export function lineFor(n: Npc, mood: Mood, salt: string, avoid: string[] = []): string | null {
  const style = STYLE[n.profile];
  if (!style) return null;
  const pool = mood === 'idle' ? [...(IDLE[n.profile] ?? []), ...(ROLE_CHECK_IN[n.role] ?? CHECK_IN[style])] : REACT[style][mood] ?? [];
  const fresh = pool.filter((t) => !avoid.includes(t));
  if (!fresh.length) return null;
  return fresh[Math.floor(unit(`${n.id}|line|${salt}`) * fresh.length)];
}

/**
 * Lets someone reach out this week, if anyone does. At most one message a week. Returns the message, or null.
 * People who are not speaking to you, and people from before profiles existed, stay quiet.
 */
export function npcPulse(s: GameState): { from: string; text: string } | null {
  const c = s.career;
  if (!['regular', 'playoffs', 'preseason', 'offseason'].includes(c.phase)) return null;
  const mood = moodOf(s);
  const recent = s.feed.slice(-14).map((p) => p.text);
  let best: { n: Npc; score: number } | null = null;
  for (const n of Object.values(s.npcs)) {
    if (!n.active || n.estranged || !n.profile || !STYLE[n.profile] || BASE[n.role] === undefined) continue;
    // someone who dislikes you only reaches out if that is the point of them (a rival)
    if (n.relationship.affinity < -30 && n.role !== 'rival') continue;
    // an agent matters from the pros, a scout before them
    if (n.role === 'agent' && c.level !== 'pro') continue;
    if (n.role === 'scout' && c.level === 'pro') continue;
    if (n.role === 'love_interest' && n.relationship.romance < 10) continue;
    const p = BASE[n.role]! * (0.5 + closeness(n)) * (mood === 'idle' ? 1 : 1.6);
    const h = unit(`${n.id}|${c.season}|${c.week}|${c.phase}`);
    if (h >= p) continue;
    const score = h / p;
    if (!best || score < best.score) best = { n, score };
  }
  if (!best) return null;
  const text = lineFor(best.n, mood, `${c.season}|${c.week}`, recent);
  if (!text) return null;
  const id = s.feed.length ? s.feed[s.feed.length - 1].id + 1 : 1;
  s.feed.push({ id, season: c.season, week: c.week, kind: 'dm', author: best.n.name, handle: `Message · ${ROLE_LABEL[best.n.role] ?? 'Someone'}`, text, likes: 0 });
  if (s.feed.length > 80) s.feed.splice(0, s.feed.length - 80);
  return { from: best.n.name, text };
}
