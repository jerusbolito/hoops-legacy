import type { GameState, Level, Npc, NpcRole, Relationship } from '../state/schemas';
import { addNews } from './news';
import type { RNG } from './rng';

/**
 * Who people are underneath their role. A coach is not just "the coach": they might be strict, or warm to a fault, or
 * quietly brilliant, or already half out the door. Each profile gives a character a want, a flaw, a soft spot and a way
 * of talking, which shapes their starting relationship with you, the moments that come up around them, what the narrator
 * is told, and how they change as the seasons go by depending on how you treat them.
 */

export type Rel = Partial<Record<keyof Relationship, number>>;

export interface Profile {
  id: string;
  role: NpcRole;
  label: string;
  /** How they come across, in a sentence the narrator can play. */
  blurb: string;
  want: string;
  flaw: string;
  soft: string;
  /** How they sound. */
  voice: string;
  traits: string[];
  /** Added to whatever the relationship would start as. */
  rel: Rel;
  /** What the first meeting left behind, if anything. */
  memory?: string;
  weight: number;
  levels?: Level[];
}

const P = (p: Profile): Profile => p;

export const PROFILES: Profile[] = [
  /* ── coaches ── */
  P({ id: 'disciplinarian', role: 'coach', label: 'The disciplinarian', blurb: 'Strict and by the book. Rules are the same for everyone, and being on time is a form of respect.', want: 'A program people respect.', flaw: 'Cannot admit a mistake, even a small one.', soft: 'Loyalty shown on a bad day. He remembers who stayed.', voice: 'Short sentences. Rarely raises his voice, which is worse.', traits: ['stern', 'fair'], rel: { respect: 8, trust: -6 }, weight: 1.2 }),
  P({ id: 'players_coach', role: 'coach', label: "The players' coach", blurb: 'Warm and easy to talk to. Players love playing for them, and they hate delivering bad news.', want: 'For everyone to enjoy playing.', flaw: 'Avoids hard conversations and lets things slide until they cannot.', soft: 'A player who works without being asked.', voice: 'Friendly, jokes first, honest second.', traits: ['warm', 'easygoing'], rel: { affinity: 14, trust: 12, respect: -4 }, weight: 1.2 }),
  P({ id: 'tactician', role: 'coach', label: 'The tactician', blurb: 'Quiet and brilliant with film. Sees the game as a puzzle and sometimes forgets the people are people.', want: 'To solve the game.', flaw: 'Under-communicates and mistakes silence for trust.', soft: 'A player who asks a good question.', voice: 'Precise, a little dry, drifts into diagrams.', traits: ['analytical', 'reserved'], rel: { respect: 10, affinity: -4 }, weight: 1, levels: ['college', 'pro'] }),
  P({ id: 'old_school', role: 'coach', label: 'The old-school mentor', blurb: 'Gruff, patient with effort and impatient with excuses. Teaches through stories about people you have never met.', want: 'To hand down what he learned.', flaw: 'Stuck in his ways, and a little deaf to new ideas.', soft: 'Anyone who wants to learn the fundamentals.', voice: 'Folksy. Starts sentences with "Back when I..."', traits: ['gruff', 'wise'], rel: { respect: 6, trust: 4 }, weight: 1 }),
  P({ id: 'climber', role: 'coach', label: 'The climber', blurb: 'Young, sharp and visibly ambitious. Every game is a résumé line.', want: 'A better job.', flaw: 'Treats players as stepping stones when the pressure is on.', soft: 'He sees something of himself in a player who hustles.', voice: 'Fast, motivational, always on his phone between drills.', traits: ['ambitious', 'driven'], rel: { respect: 4, trust: -8 }, weight: 1 }),
  P({ id: 'burned_out', role: 'coach', label: 'The burned-out veteran', blurb: 'Years of this have worn him down. He coaches on habit, and the clock is never far from his mind.', want: 'One more group that makes it feel worth it.', flaw: 'Coasts, and lets problems slide because he is tired.', soft: 'A player who reminds him why he started.', voice: 'Flat, tired, occasionally startlingly kind.', traits: ['weary', 'dry'], rel: { respect: -6, trust: 6 }, weight: 0.8, levels: ['college', 'pro'] }),
  P({ id: 'politician', role: 'coach', label: 'The politician', blurb: 'Smooth with boosters and administrators, careful with the truth. Knows who matters and who is in the room.', want: 'Job security.', flaw: 'Plays favorites, usually the ones with influence.', soft: 'Will go to the wall for a player when it counts.', voice: 'Polished and diplomatic; answers a different question than you asked.', traits: ['smooth', 'calculating'], rel: { trust: -10, respect: 4 }, weight: 0.9, levels: ['college', 'pro'] }),
  P({ id: 'father_figure', role: 'coach', label: 'The father figure', blurb: 'Treats every player like family and every loss like a personal failing. Shows up to your graduation party.', want: 'To be needed.', flaw: 'Possessive, and takes any thought of leaving as betrayal.', soft: 'A player who just says thank you.', voice: 'Warm, protective, a little too invested.', traits: ['caring', 'protective'], rel: { affinity: 12, trust: 8 }, weight: 1, levels: ['hs', 'college'] }),

  /* ── rivals ── */
  P({ id: 'trash_talker', role: 'rival', label: 'The trash-talker', blurb: 'Loud, funny, and sure they are better. Lives for the crowd and the clip.', want: 'To be the name everyone says.', flaw: 'Needs the crowd; falls apart when it goes quiet.', soft: 'Their little sibling, who still thinks they are unbeatable.', voice: 'Quick, cocky, a nickname for everyone.', traits: ['cocky', 'flashy'], rel: {}, memory: 'Beat you in an AAU tournament final and let you hear about it.', weight: 1.4 }),
  P({ id: 'quiet_grinder', role: 'rival', label: 'The quiet grinder', blurb: 'Never says a word about you. Just shows up earlier, stays later, and is somehow always in the gym.', want: 'To earn it without anyone noticing.', flaw: 'Cannot take a day off, and mistakes rest for weakness.', soft: 'Anyone who works as hard as they do.', voice: 'Few words, polite, unreadable.', traits: ['intense', 'reserved'], rel: { affinity: 24, rivalry: -12, respect: 16 }, memory: 'You keep finding their name on the gym sign-in sheet right above yours.', weight: 1.2 }),
  P({ id: 'old_friend', role: 'rival', label: 'The old friend', blurb: 'Used to be your best friend. Somewhere between middle school and now it turned into a competition neither of you chose.', want: 'To be seen as more than your old friend.', flaw: 'Keeps score, and never says what actually hurt.', soft: 'The old neighborhood court.', voice: 'Easy and familiar, with an edge that comes and goes.', traits: ['loyal', 'proud'], rel: { affinity: 30, rivalry: -12, trust: 15 }, memory: 'You two used to shoot until the streetlights came on, before the rankings came out.', weight: 1 }),
  P({ id: 'reluctant', role: 'rival', label: 'The reluctant rival', blurb: 'Did not ask for the comparison. The media and the fans built the rivalry; they just want to play.', want: 'To be left alone to play.', flaw: 'Hides from the attention instead of handling it.', soft: 'Their family, who are tired of the headlines.', voice: 'Polite and a little embarrassed.', traits: ['humble', 'private'], rel: { affinity: 18, rivalry: -18, respect: 10 }, memory: 'A reporter put you two on the same poster before you had even met.', weight: 1 }),
  P({ id: 'chip', role: 'rival', label: 'The one with a chip', blurb: 'Plays angry. Came up with nothing, and sees you as someone who was handed things.', want: 'To prove the doubters wrong.', flaw: 'Reads disrespect into everything.', soft: 'Anyone who shows they know where they came from.', voice: 'Clipped and guarded; does not ask for anything.', traits: ['hot-headed', 'driven'], rel: { affinity: -8, rivalry: 10, respect: 8 }, memory: 'They told a teammate you had never had to earn anything. It got back to you.', weight: 1 }),
  P({ id: 'class_act', role: 'rival', label: 'The class act', blurb: 'Wins and loses with grace. The standard you end up measuring yourself against.', want: 'To be great and to be good.', flaw: 'Almost too perfect, and quietly afraid of failing in public.', soft: 'The people who see them as more than a highlight.', voice: 'Gracious, thoughtful, a little formal.', traits: ['gracious', 'composed'], rel: { affinity: 20, rivalry: -14, respect: 22 }, memory: 'They shook your hand after a loss and meant it.', weight: 0.9 }),
  P({ id: 'fan_made', role: 'rival', label: 'The feud the fans made', blurb: 'You barely know each other. The group chats decided you hate each other, and everyone is waiting for it to be true.', want: 'To not be dragged into this.', flaw: 'Plays into the story when it is convenient.', soft: 'Honest conversations away from the cameras.', voice: 'Careful, scripted, sometimes surprisingly real.', traits: ['guarded', 'witty'], rel: { affinity: 6, rivalry: -6 }, memory: 'The hashtag started before you had spoken a single word to each other.', weight: 0.9 }),

  /* ── teammates ── */
  P({ id: 'demanding_star', role: 'teammate', label: 'The demanding star', blurb: 'Sure the offense runs through them, and often right. Pushes everyone, including you, hard.', want: 'The ball, and the credit.', flaw: 'Cannot share the spotlight.', soft: 'Anyone who makes the team win.', voice: 'Direct, impatient, loud on the floor.', traits: ['confident', 'demanding'], rel: { respect: 4, affinity: -6, rivalry: 6 }, weight: 1.1 }),
  P({ id: 'glue_guy', role: 'teammate', label: 'The glue guy', blurb: 'Does the dirty work and never asks for credit. The team is better with them, and nobody notices why.', want: 'For the team to win, whoever scores.', flaw: 'Never speaks up for themself.', soft: 'Someone who thanks them out loud.', voice: 'Easygoing, quick to pass the credit.', traits: ['selfless', 'warm'], rel: { affinity: 14, trust: 10 }, weight: 1.1 }),
  P({ id: 'insecure_vet', role: 'teammate', label: 'The insecure veteran', blurb: 'Good, and afraid of being replaced. Acts friendly while holding things back.', want: 'To keep their spot.', flaw: 'Withholds help from anyone who might take it.', soft: 'A younger player who asks them for advice and means it.', voice: 'Warm on the surface, careful underneath.', traits: ['guarded', 'proud'], rel: { trust: -6, rivalry: 8, affinity: 4 }, weight: 0.9 }),
  P({ id: 'mentor_vet', role: 'teammate', label: 'The mentor', blurb: 'A veteran who remembers how it felt to be new and is determined to make it easier for you.', want: 'To leave something behind.', flaw: 'Overextends, and takes on everyone else’s problems.', soft: 'Players who listen.', voice: 'Patient and funny, with a story for everything.', traits: ['wise', 'generous'], rel: { affinity: 18, trust: 14, respect: 10 }, weight: 0.9 }),
  P({ id: 'class_clown', role: 'teammate', label: 'The class clown', blurb: 'Keeps the room loose with jokes, and is carrying more than anyone knows.', want: 'For everyone to be okay.', flaw: 'Jokes instead of saying what is wrong.', soft: 'The one person who asks seriously.', voice: 'Never stops, until suddenly they do.', traits: ['funny', 'restless'], rel: { affinity: 16, trust: 2 }, weight: 1 }),
  P({ id: 'quiet_leader', role: 'teammate', label: 'The quiet leader', blurb: 'Does not say much, and when they do everyone stops. Leads by what they do at 6 a.m.', want: 'For the team to be serious about it.', flaw: 'Holds disappointment inside until it comes out all at once.', soft: 'Effort, and any proof you noticed it.', voice: 'Low and calm; says one thing and means it.', traits: ['composed', 'steady'], rel: { respect: 14, trust: 8 }, weight: 1 }),
  P({ id: 'hungry_bench', role: 'teammate', label: 'The hungry reserve', blurb: 'Stuck behind better players and working like they are not. Ready the moment they get a chance.', want: 'Minutes, and proof they belong.', flaw: 'Hard on themself, and resentful when it shows.', soft: 'Someone who argues for them.', voice: 'Eager, a little defensive.', traits: ['driven', 'restless'], rel: { affinity: 6, rivalry: 4 }, weight: 0.9 }),

  /* ── friends ── */
  P({ id: 'ride_or_die', role: 'friend', label: 'Ride or die', blurb: 'Always there, always on your side, even when you are wrong.', want: 'For you to make it, and for it not to change anything.', flaw: 'Cannot tell you the hard thing.', soft: 'Being asked, not told.', voice: 'Loyal, loud in your defense.', traits: ['loyal', 'protective'], rel: { affinity: 8, trust: 8 }, weight: 1.1 }),
  P({ id: 'drifting', role: 'friend', label: 'Drifting away', blurb: 'Still your friend, but the distance is growing, and you are both pretending it is not.', want: 'A life that is not about your career.', flaw: 'Says yes to plans they cancel later.', soft: 'Any time you ask about them.', voice: 'Warm, vague, a half-beat late.', traits: ['kind', 'distant'], rel: { affinity: -6, trust: -4 }, weight: 0.9 }),
  P({ id: 'friendly_rival', role: 'friend', label: 'The competitive friend', blurb: 'Your best friend and a fierce competitor. Everything is a bet, and they hate losing to you most of all.', want: 'To be as good as you, and for you to know it.', flaw: 'Cannot celebrate your wins without measuring theirs.', soft: 'You being honest about your own doubts.', voice: 'Teasing, quick, always keeping score.', traits: ['competitive', 'funny'], rel: { rivalry: 8, affinity: 4 }, weight: 1 }),
  P({ id: 'worrier', role: 'friend', label: 'The worrier', blurb: 'Cares so much it comes out as nagging. Checks that you ate, slept and did the homework.', want: 'For you to be okay.', flaw: 'Smothers, and takes it personally when you push back.', soft: 'A thank-you that is not a joke.', voice: 'Anxious, affectionate, practical.', traits: ['caring', 'anxious'], rel: { affinity: 10, trust: 10 }, weight: 0.9 }),
  P({ id: 'hype_man', role: 'friend', label: 'The hype man', blurb: 'Your biggest fan and loudest voice. Cheers every small win as loudly as a big one, and sometimes you need it quiet.', want: 'To be part of something big.', flaw: 'Hypes the moment instead of the work.', soft: 'Being included, not just cheered.', voice: 'Loud, generous, all caps.', traits: ['flashy', 'loyal'], rel: { affinity: 12 }, weight: 1 }),
];

const BY_ID = new Map(PROFILES.map((p) => [p.id, p]));
export const profileById = (id: string): Profile | undefined => BY_ID.get(id);
export const PROFILED_ROLES: NpcRole[] = ['coach', 'rival', 'teammate', 'friend'];
export const profilesFor = (role: NpcRole): Profile[] => PROFILES.filter((p) => p.role === role);

/** Picks a profile for a new character. Weighted, and some suit some levels better. */
export function pickProfile(rng: RNG, role: NpcRole, level?: Level): Profile | undefined {
  const pool = profilesFor(role);
  if (!pool.length) return undefined;
  return rng.weighted(pool, (p) => (level && p.levels && !p.levels.includes(level) ? p.weight * 0.2 : p.weight));
}

export const profileOf = (n: Pick<Npc, 'profile'> | undefined | null): Profile | undefined => (n?.profile ? BY_ID.get(n.profile) : undefined);

/** True for this profile. */
export const isProfile = (n: Pick<Npc, 'profile'> | undefined | null, ...ids: string[]): boolean => !!n && ids.includes(n.profile);

/**
 * True for these profiles, and also for people from before profiles existed, who keep behaving as they always did.
 * Use it to gate the old, one-note moments without taking them away from existing saves.
 */
export const isProfileOrLegacy = (n: Pick<Npc, 'profile'> | undefined | null, ...ids: string[]): boolean => !!n && (n.profile === '' || ids.includes(n.profile));

/** What the narrator is told about someone. Empty for people without a profile. */
export function profileLine(n: Npc): string {
  const p = profileOf(n);
  if (!p) return '';
  const turn = n.stage > 0 ? n.keyMemories?.[n.keyMemories.length - 1] : '';
  const changed = turn ? ` They have changed since you met: ${turn}` : '';
  return `${p.label}. ${p.blurb} Wants: ${p.want} Flaw: ${p.flaw} Soft spot: ${p.soft} Voice: ${p.voice}${changed}`;
}

/* ───────────────────────── Change over time ───────────────────────── */

interface Turn {
  /** Runs once per season, only for people still at stage 0. */
  when: (s: GameState, n: Npc) => boolean;
  rel: Rel;
  memory: string;
  news?: string;
}

const winPct = (s: GameState): number => {
  const st = s.league.standings[s.career.teamId];
  return st && st.w + st.l > 0 ? st.w / (st.w + st.l) : 0.5;
};
const games = (n: Npc) => n.h2h.w + n.h2h.l;

const TURNS: Record<string, Turn[]> = {
  trash_talker: [
    { when: (_s, n) => games(n) >= 3 && n.h2h.w >= n.h2h.l + 2, rel: { respect: 12, rivalry: -8, affinity: 6 }, memory: 'After losing to you again, the talking stopped. They started watching instead.' },
    { when: (_s, n) => games(n) >= 3 && n.h2h.l >= n.h2h.w + 3, rel: { rivalry: 10, affinity: -6 }, memory: 'They have started wearing the series like a medal, and it is hard to ignore.' },
  ],
  quiet_grinder: [{ when: (_s, n) => n.relationship.respect >= 55, rel: { affinity: 12, rivalry: -10 }, memory: 'They asked, quietly, if you wanted to work out together. It was the most they had ever said.' }],
  old_friend: [
    { when: (_s, n) => n.relationship.trust >= 50, rel: { affinity: 15, rivalry: -12 }, memory: 'Somewhere along the way the old friendship came back. The scoreboard matters less.' },
    { when: (_s, n) => n.relationship.affinity <= -25, rel: { rivalry: 12, affinity: -6 }, memory: 'The break between you hardened. Neither of you will be the first to say it.' },
  ],
  reluctant: [{ when: (_s, n) => n.relationship.respect >= 50, rel: { affinity: 12, rivalry: -15 }, memory: 'You two quietly agreed the feud was everyone else’s idea. It felt like relief.' }],
  chip: [{ when: (_s, n) => n.relationship.affinity >= 20 || n.relationship.trust >= 45, rel: { affinity: 12, rivalry: -10 }, memory: 'They stopped seeing you as someone who was handed things. It took a long time.' }],
  fan_made: [{ when: (s, n) => s.career.season - n.metSeason >= 2, rel: { rivalry: -12, affinity: 8 }, memory: 'The feud faded the way those things do. Fans moved on to the next one.' }],

  disciplinarian: [{ when: (_s, n) => n.relationship.trust >= 65, rel: { affinity: 10, trust: 4 }, memory: 'He let his guard down for a moment. It turns out there is a person under the whistle.' }],
  players_coach: [{ when: (s) => winPct(s) < 0.35, rel: { respect: 6, affinity: -6 }, memory: 'After the losing, the easy-going coach finally got tougher. Not everyone liked it.' }],
  tactician: [{ when: (_s, n) => n.relationship.trust >= 60, rel: { respect: 8, affinity: 6 }, memory: 'He started pulling you into the film room, and explaining his thinking instead of just having it.' }],
  old_school: [{ when: (_s, n) => n.relationship.respect >= 65, rel: { affinity: 10, trust: 6 }, memory: 'The first time he called you "son," neither of you made a thing of it.' }],
  climber: [{ when: (s) => winPct(s) >= 0.7, rel: { trust: -5, respect: 5 }, memory: 'There is talk of a bigger job. He is already half in another gym.', news: 'There are rumors a bigger program is circling your coach.' }],
  burned_out: [{ when: (s) => winPct(s) >= 0.65, rel: { affinity: 8, respect: 6 }, memory: 'Somewhere in the winning, the tired old coach found something. He smiles at practice now.' }],

  demanding_star: [
    { when: (_s, n) => n.relationship.respect >= 55, rel: { affinity: 12, rivalry: -8 }, memory: 'They stopped asking for the ball and started asking what you see out there.' },
    { when: (_s, n) => n.relationship.affinity <= -20, rel: { rivalry: 10 }, memory: 'The tension between you stopped being private. The whole locker room knows.' },
  ],
  insecure_vet: [{ when: (_s, n) => n.relationship.trust >= 45, rel: { affinity: 10, rivalry: -8, trust: 6 }, memory: 'They finally showed you the move they had been keeping to themself. It was a gift.' }],
  hungry_bench: [{ when: (_s, n) => n.relationship.trust >= 45, rel: { affinity: 8, rivalry: -4 }, memory: 'They stopped treating you as the obstacle. They treat you as the standard instead.' }],
  ride_or_die: [{ when: (_s, n) => n.relationship.affinity <= 10, rel: { affinity: -4 }, memory: 'You have not been there for them the way they were for you.' }],
  drifting: [
    { when: (_s, n) => n.relationship.affinity >= 45, rel: { affinity: 10, trust: 8 }, memory: 'You made time, and it turns out that was all it needed.' },
    { when: (_s, n) => n.relationship.affinity <= 15, rel: { affinity: -10 }, memory: 'The plans stopped getting made. Nobody said anything.' },
  ],
};

const clamp100 = (n: number, lo = 0) => Math.max(lo, Math.min(100, n));

/**
 * Once a season, people who have reached a turning point change. No randomness: what happens depends only on how things
 * stand between you, so it can run without disturbing the game's dice. Returns who changed, for the caller to report.
 */
export function evolveCharacters(state: GameState): Npc[] {
  const changed: Npc[] = [];
  for (const n of Object.values(state.npcs)) {
    if (!n.active || n.stage > 0 || !n.profile) continue;
    const turn = TURNS[n.profile]?.find((t) => t.when(state, n));
    if (!turn) continue;
    const r = n.relationship;
    for (const [k, d] of Object.entries(turn.rel) as [keyof Relationship, number][]) r[k] = k === 'affinity' ? Math.max(-100, Math.min(100, r[k] + d)) : clamp100(r[k] + d);
    n.stage = 1;
    n.memories.push(turn.memory);
    n.keyMemories = [...(n.keyMemories ?? []), turn.memory].slice(-4);
    addNews(state, turn.news ?? `${n.name}: ${turn.memory}`);
    changed.push(n);
  }
  return changed;
}

/* ───────────────────────── Scenes without a narrator ───────────────────────── */

/** Opening line and dilemma for a scene, when who is in the room changes how it plays. */
export const PROFILE_SCENES: Record<string, Partial<Record<string, { opener: string; dilemma: string }>>> = {
  disciplinarian: {
    practice: { opener: 'Practice starts at 3:00 sharp. At 3:01 the doors are locked, and Coach has not said a word about it.', dilemma: 'Coach points to the line on the floor. "Standards are standards." He wants to know where you stand.' },
    coach_meeting: { opener: 'Coach waits until the gym is empty. He does not sit. Neither do you.', dilemma: 'He lists, calmly, everything he has seen. He is not angry, which is worse, and asks what you plan to do.' },
  },
  players_coach: {
    practice: { opener: 'Practice is loose today. There is music, and Coach is laughing at something in the huddle.', dilemma: 'Coach pulls you aside, smiling, and says everything is great. You are not sure he means it.' },
    coach_meeting: { opener: 'Coach asks how you are doing and seems to mean it. You can feel him steering around something.', dilemma: 'You could push him for the real answer, or you could let the nice version stand.' },
  },
  tactician: {
    practice: { opener: 'Coach runs the same set eleven times, stopping each time to move a cone two inches.', dilemma: 'He asks, without looking up, what you saw on that last possession. He wants the real answer, not the safe one.' },
    coach_meeting: { opener: 'The meeting is in the film room. A frozen frame of you is on the screen.', dilemma: 'Coach points at a detail you missed. It is small, precise and completely fair.' },
  },
  old_school: {
    practice: { opener: 'Coach has the whole team shooting form shots from three feet. "You earn the long ones."', dilemma: 'Coach tells a story about a player you have never heard of. It takes a while to see it is about you.' },
    coach_meeting: { opener: 'Coach drops into a folding chair. "Sit. This is going to take a minute."', dilemma: 'He tells you what he would do in your spot, and why you will not like it.' },
  },
  climber: {
    practice: { opener: 'Coach is on his phone between drills, then, suddenly, entirely locked in. Scouts are in the stands.', dilemma: 'He wants an answer fast: are you the player who helps him win this week?' },
    coach_meeting: { opener: 'Coach talks quickly and smiles a lot. There is a plan, and you are part of it, for now.', dilemma: 'He says it is a team decision. You are not sure whose.' },
  },
  burned_out: {
    practice: { opener: 'Practice runs the same as it has for years. Coach checks the clock more than the court.', dilemma: 'Coach says he does not have the energy to explain it twice. Is that a challenge or an invitation?' },
    coach_meeting: { opener: 'Coach rubs his eyes and tells you to sit. He sounds like someone running out of reasons.', dilemma: 'For a second he is completely honest with you. You can use it or leave it.' },
  },
  politician: {
    practice: { opener: 'A booster in a quarter-zip watches from the bleachers. Coach is nicer than usual to everybody.', dilemma: 'Coach says the right thing in a way that does not quite answer you. You can let it go or ask again.' },
    coach_meeting: { opener: 'Coach closes the door and uses your first name more than he usually does.', dilemma: 'He is warm and says nothing definite. You are left to guess how much you matter here.' },
  },
  father_figure: {
    practice: { opener: 'Coach asks about your mom before he asks about the drill.', dilemma: 'He says he worries about you, and he means it, but it makes the next decision harder.' },
    coach_meeting: { opener: 'Coach has brought a thermos and two cups, like he has done this before.', dilemma: 'He talks about your future as something he has a share in. It is hard to tell whether that is love or pressure.' },
  },
  trash_talker: {
    rival_encounter: { opener: 'Open gym. The speaker is already on, and they are narrating their own warmups to a crowd of eleven.', dilemma: 'They spot you, grin, and check the ball your way. "One to eleven, unless you are scared."' },
    rivalry_week: { opener: 'Rivalry week. They have been posting all week, and every post is a little too well timed.', dilemma: 'A clip of them talking about you is making the rounds. Your phone will not stop buzzing.' },
  },
  quiet_grinder: {
    rival_encounter: { opener: 'It is 6 a.m. and the lights are already on. They are in the corner, working on footwork, and they do not look up.', dilemma: 'You could ask to run a drill together, or you could start your own and let the gym get louder.' },
    rivalry_week: { opener: 'Rivalry week. They have said nothing about it, which is somehow louder than anything.', dilemma: 'They are in the gym when you arrive, and when you leave. You are not sure who is chasing whom.' },
  },
  old_friend: {
    rival_encounter: { opener: 'You run into them at the old park. The rims are the same and the feeling is not.', dilemma: 'They toss you the ball like it is eighth grade. The question is whether you play like it is.' },
    rivalry_week: { opener: 'Rivalry week. Everyone keeps asking what happened between you two, and you do not know what to say.', dilemma: 'They send you a text: "Still remember the old plays?" It is not clear what they mean.' },
  },
  reluctant: {
    rival_encounter: { opener: 'You see them at the edge of the court, hood up, trying to be invisible. There is a camera pointed their way.', dilemma: 'They catch your eye and give a small shrug that says they did not ask for any of this.' },
    rivalry_week: { opener: 'Rivalry week. Every headline has both of your faces on it. Neither of you looks happy about it.', dilemma: 'They message you privately: "Can we talk before the game?" You are not sure what you are hoping they say.' },
  },
  chip: {
    rival_encounter: { opener: 'They are playing like the gym owes them money. Nobody wants to guard them.', dilemma: 'They stop, look you over, and say, "Must be nice." It is not clear what they mean until it is.' },
    rivalry_week: { opener: 'Rivalry week. They are the only person in the building not smiling, and they plan to keep it that way.', dilemma: 'In the hallway they say something that sounds like an insult and might be an invitation.' },
  },
  class_act: {
    rival_encounter: { opener: 'They are already in the gym, helping a younger kid with his form. They wave you over like it is normal.', dilemma: 'They suggest a game to eleven, loser buys water. It does not seem to be a trap, which surprises you.' },
    rivalry_week: { opener: 'Rivalry week. They sent flowers to the school nurse, according to a post you did not expect to like.', dilemma: 'They congratulate you on your last game, publicly. You have to decide how to answer.' },
  },
  fan_made: {
    rival_encounter: { opener: 'There is a crowd at open gym, phones out, because the group chat said you would both be here.', dilemma: 'They look as awkward as you feel. The crowd wants a show. You can give one, or not.' },
    rivalry_week: { opener: 'Rivalry week. A made-up quote is going around with both of your names on it. Neither of you said it.', dilemma: 'You could clear it up with them directly, or let the feud run its course.' },
  },
  demanding_star: { locker_room: { opener: 'They are talking about the offense again, loudly, with a lot of hand gestures.', dilemma: 'Somebody has to say something about touches. A couple of guys are watching to see if it is you.' } },
  glue_guy: { locker_room: { opener: 'The locker room is organized in a way that nobody remembers doing. Somebody always does it.', dilemma: 'Nobody ever thanks them. You could be the first, or you could let it stay invisible.' } },
  insecure_vet: { locker_room: { opener: 'They are friendly, helpful-sounding, and a few seconds slow to answer when you ask about the play.', dilemma: 'You have a feeling they are holding something back. You can call it out or wait it out.' } },
  mentor_vet: { locker_room: { opener: 'The veteran is telling the new guys how it works, and for once everyone is listening.', dilemma: 'They offer you the thing that took them years to learn, and a warning about what it costs.' } },
  class_clown: { locker_room: { opener: 'There is a bit going, and the whole room is laughing. You are the only one who notices it is a little too long.', dilemma: 'After the laughing stops, they are quiet. You can ask, or you can let the joke carry it.' } },
  quiet_leader: { locker_room: { opener: 'It is quiet. They have said one thing, and everyone is thinking about it.', dilemma: 'They look at you and ask what you think. The room waits.' } },
  hungry_bench: { locker_room: { opener: 'They are the last one out of the gym every night, and the first one in the next morning.', dilemma: 'They ask you, flatly, what it would take to earn minutes. You could be honest, or you could be kind.' } },
};
