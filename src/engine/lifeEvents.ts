import { LEVEL_CONFIG } from '../data/teams';
import type { GameState, Level, LifeEventPending, Npc, RatingKey, RelField } from '../state/schemas';
import { RATING_LABELS } from '../state/schemas';
import { bumpChemistry, isCaptain } from './chemistry';
import { coachOf } from './coach';
import { receive, spend } from './finance';
import { tradeDeadlineWeek, forceTrade, replaceCoach } from './moves';
import { addNews } from './news';
import { addProgress } from './progression';
import { atLeast, kidsOf, longDistance, setStage, stageOf } from './romance';
import { bumpSuitor, bumpTarget, suitorOf, topSuitor } from './recruiting';
import { addPost } from './media';
import { overall } from './ratings';
import { RNG, clamp } from './rng';
import { athleteStatus } from './storyAthletes';

/**
 * Random moments: the stuff that just happens in a life. A flat tire before practice, a rumor in a column, a stranger
 * with an envelope. They arrive without warning, ask you what you will do, and the answer changes something real.
 * The text and the effects are engine-made, so they work with or without the AI narrator.
 */

export type Tone = 'good' | 'bad' | 'odd' | 'money';

export interface LifeOption {
  id: string;
  label: string;
  hint?: string;
  /** Money this choice costs up front. Not available if you cannot pay. */
  cost?: number;
}
export interface LifeOptionView extends LifeOption {
  affordable: boolean;
}
export interface LifeEventView {
  id: string;
  icon: string;
  title: string;
  tone: Tone;
  text: string;
  options: LifeOptionView[];
}
export interface LifeOutcome {
  id: string;
  icon: string;
  title: string;
  /** Your choice, then what happened. */
  choice: string;
  text: string;
  lines: string[];
}

/* ───────────────────────── Effects with a paper trail ───────────────────────── */

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

/** Applies changes to the save and records each as a short line for the result card. */
export class Fx {
  lines: string[] = [];
  constructor(
    readonly s: GameState,
    readonly rng: RNG,
  ) {}
  note(t: string) {
    this.lines.push(t);
  }
  morale(n: number) {
    const p = this.s.player;
    const d = clamp(p.morale + n, 0, 100) - p.morale;
    p.morale += d;
    if (d) this.note(`Morale ${signed(d)}`);
  }
  energy(n: number) {
    const p = this.s.player;
    const d = clamp(p.energy + n, 0, 100) - p.energy;
    p.energy += d;
    if (d) this.note(`Energy ${signed(d)}`);
  }
  rep(n: number) {
    const p = this.s.player;
    const d = clamp(p.reputation + n, 0, 100) - p.reputation;
    p.reputation += d;
    if (d) this.note(`Reputation ${signed(d)}`);
  }
  /** Change followers by a share of what you have (at least a handful). */
  followers(pct: number) {
    const p = this.s.player;
    const d = Math.round(Math.max(20, p.followers) * pct);
    const after = Math.max(0, p.followers + d);
    const real = after - p.followers;
    p.followers = after;
    if (real) this.note(`Followers ${real > 0 ? '+' : '−'}${Math.abs(real).toLocaleString()}`);
  }
  /** Gain money (a windfall) or lose it (as much as you actually have). */
  money(n: number) {
    if (n > 0) {
      receive(this.s, n);
      this.note(`Money +$${Math.round(n).toLocaleString()}`);
    } else if (n < 0) {
      const lost = Math.min(Math.round(-n), this.s.player.money);
      if (lost > 0 && spend(this.s, lost)) this.note(`Money −$${lost.toLocaleString()}`);
    }
  }
  gpa(n: number) {
    if (this.s.career.level === 'pro') return;
    const p = this.s.player;
    const next = clamp(Math.round((p.academics + n) * 100) / 100, 0, 4);
    const d = Math.round((next - p.academics) * 100) / 100;
    p.academics = next;
    if (d) this.note(`GPA ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`);
  }
  /** Fractional skill progress, which turns into a rating point once it adds up. */
  progress(key: RatingKey, amount: number) {
    const me = this.s.athletes[this.s.player.athleteId];
    const gained = addProgress(this.s.player, me, key, amount);
    if (gained) this.note(`${RATING_LABELS[key]} ${signed(gained)}`);
  }
  rel(npc: Npc | undefined, field: RelField, n: number) {
    if (!npc) return;
    const r = npc.relationship;
    const [lo, hi] = field === 'affinity' ? [-100, 100] : [0, 100];
    const d = clamp(r[field] + n, lo, hi) - r[field];
    r[field] += d;
    if (d) this.note(`${npc.name.split(' ')[0]}: ${field} ${signed(d)}`);
  }
  /** How the locker room gets along. */
  chem(n: number) {
    const d = bumpChemistry(this.s, n);
    void d;
    this.note(`Team chemistry ${signed(n)}`);
  }
  /** The head coach's view of you. */
  coach(trust: number, respect = 0) {
    const c = coachOf(this.s);
    if (!c) return;
    const t = clamp(c.relationship.trust + trust, 0, 100) - c.relationship.trust;
    const r = clamp(c.relationship.respect + respect, 0, 100) - c.relationship.respect;
    c.relationship.trust += t;
    c.relationship.respect += r;
    const bits = [t ? `trust ${signed(Math.round(t * 10) / 10)}` : '', r ? `respect ${signed(Math.round(r * 10) / 10)}` : ''].filter(Boolean);
    if (bits.length) this.note(`Coach: ${bits.join(', ')}`);
  }
  memory(npc: Npc | undefined, text: string) {
    if (!npc) return;
    npc.memories.push(text.slice(0, 160));
    if (npc.memories.length > 8) npc.memories.shift();
  }
  injury(desc: string, weeks: number) {
    const p = this.s.player;
    if (p.injury && p.injury.weeks >= weeks) return;
    p.injury = { desc, weeks };
    p.injuryHistory++;
    this.note(`Out: ${desc} (${weeks} wk)`);
  }
  flag(key: string, value: string | number | boolean) {
    this.s.story.flags[key] = value;
  }
  news(text: string) {
    addNews(this.s, text);
  }
  post(text: string, author: string, handle: string, kind = 'fans') {
    addPost(this.s, this.rng, { kind, author, handle, text });
  }
}

/* ───────────────────────── Definitions ───────────────────────── */

type Role = 'coach' | 'friend' | 'rival' | 'teammate' | 'family' | 'love';

interface Ctx {
  s: GameState;
  rng: RNG;
  level: Level;
  me: { first: string; last: string; ovr: number; pos: string };
  coach?: Npc;
  friend?: Npc;
  rival?: Npc;
  teammate?: Npc;
  family?: Npc;
  love?: Npc;
  /** An amount in high school, college or pro dollars. */
  $: (hs: number, college: number, pro: number) => number;
  /** Cheap flavor choice from the event's own seed. */
  pick: <T>(xs: T[]) => T;
}

interface Opt extends LifeOption {
  run: (f: Fx, c: Ctx) => string;
}

interface Def {
  id: string;
  icon: string;
  title: string;
  tone: Tone;
  levels: Level[];
  weight: number;
  need?: Role[];
  when?: (c: Ctx) => boolean;
  text: (c: Ctx) => string;
  options: (c: Ctx) => Opt[];
}

const ALL: Level[] = ['hs', 'college', 'pro'];
const HS: Level[] = ['hs'];
const COLLEGE: Level[] = ['college'];
const PRO: Level[] = ['pro'];
const AMATEUR: Level[] = ['hs', 'college'];
const UP: Level[] = ['college', 'pro'];

/** Move a school's interest in you and say so on the result card. */
const interest = (f: Fx, name: string, d: number, o: { contact?: boolean; visited?: boolean } = {}) => {
  if (!suitorOf(f.s, name)) return;
  bumpSuitor(f.s, name, d, o);
  f.note(`${name}: interest ${signed(d)}`);
};

/** A long layoff without the rehab to match it costs a step. */
function settleComeback(f: Fx, c: Ctx, text: string): string {
  const total = Number(c.s.story.flags.comeback_due ?? 0);
  const sessions = Number(c.s.story.flags.rehab_sessions ?? 0);
  f.flag('rehab_sessions', 0);
  f.flag('comeback_due', false);
  if (total >= 6 && sessions < 3) {
    const me = f.s.athletes[f.s.player.athleteId];
    me.ratings.athleticism = Math.max(1, me.ratings.athleticism - 1);
    f.note('ATH −1 (the layoff cost a step)');
  }
  return text;
}

const first = (n?: Npc) => (n ? n.name.split(' ')[0] : 'Someone');
const opt = (id: string, label: string, run: Opt['run'], extra: { hint?: string; cost?: number } = {}): Opt => ({ id, label, run, ...extra });
const inSeason = (c: Ctx) => c.s.career.phase === 'regular' || c.s.career.phase === 'playoffs' || c.s.career.phase === 'preseason';
const healthy = (c: Ctx) => !c.s.player.injury;

const DEFS: Def[] = [
  {
    id: 'make_official',
    icon: '💞',
    title: 'Is this a thing?',
    tone: 'good',
    levels: ALL,
    weight: 2.4,
    need: ['love'],
    when: (c) => stageOf(c.s) === 'crush' && !c.s.story.flags.love_far && c.s.story.flags.official_wait !== c.s.career.season && (c.love?.relationship.romance ?? 0) >= 30 && (c.love?.relationship.affinity ?? 0) >= 5,
    text: (c) => `You and ${first(c.love)} have been spending more and more time together, and everyone around you has noticed. Tonight it comes up: "So... what are we?"`,
    options: (c) => [
      opt('yes', 'Say you want this to be real', (f) => {
        const ok = (c.love?.relationship.romance ?? 0) + (c.love?.relationship.affinity ?? 0) / 2 + f.rng.range(-12, 12) >= 45;
        if (ok) {
          setStage(f.s, 'dating');
          f.rel(c.love, 'romance', 8);
          f.rel(c.love, 'trust', 6);
          f.morale(6);
          f.memory(c.love, 'The night you both said it out loud.');
          return `${first(c.love)} smiles like they have been waiting to hear it. You are together.`;
        }
        f.flag('official_wait', f.s.career.season);
        f.rel(c.love, 'romance', -4);
        f.morale(-4);
        return 'They are not ready. It is kind and clear, and it still hurts.';
      }, { hint: 'It depends on how close you really are' }),
      opt('wait', 'Say you are not ready', (f) => {
        f.flag('official_wait', f.s.career.season);
        f.rel(c.love, 'romance', -3);
        return 'You are honest that your head is full of basketball. They say they understand, and mostly they do.';
      }),
    ],
  },
  {
    id: 'getting_serious',
    icon: '🔑',
    title: 'Getting serious',
    tone: 'good',
    levels: ALL,
    weight: 2.4,
    need: ['love'],
    when: (c) => stageOf(c.s) === 'dating' && !longDistance(c.s) && (c.love?.relationship.romance ?? 0) >= 55 && c.s.story.flags.serious_wait !== c.s.career.season && Number(c.s.story.flags.love_since ?? 0) < c.s.career.season,
    text: (c) => `You have been with ${first(c.love)} for a while now, and it has stopped feeling like a phase. They bring up the future for the first time, quietly: "Where do you see us?"`,
    options: (c) => [
      opt('all', 'Say you are in this for the long run', (f) => {
        setStage(f.s, 'partner');
        f.rel(c.love, 'romance', 6);
        f.rel(c.love, 'trust', 8);
        f.morale(6);
        f.memory(c.love, 'The night you both said this was forever.');
        return `You mean every word. ${first(c.love)} cries a little and laughs about it. You are partners now, in every sense that matters.`;
      }),
      opt('slow', 'Ask to take it slowly', (f) => {
        f.flag('serious_wait', f.s.career.season);
        f.rel(c.love, 'romance', -2);
        f.rel(c.love, 'trust', 2);
        return 'You say you want to be sure, and mean it. They nod, a little quiet, and say they will be here.';
      }),
    ],
  },
  {
    id: 'love_attention',
    icon: '📵',
    title: 'You have been hard to reach',
    tone: 'bad',
    levels: ALL,
    weight: 1.6,
    need: ['love'],
    when: (c) => atLeast(c.s, 'dating') && stageOf(c.s) !== 'married',
    text: (c) => `${first(c.love)} tells you straight: between games, training and everything else, you have not been around. "I am not asking you to quit. I am asking to be a priority sometimes."`,
    options: (c) => [
      opt('time', 'Clear your calendar for them', (f) => {
        f.energy(-8);
        f.rel(c.love, 'romance', 6);
        f.rel(c.love, 'trust', 5);
        f.coach(-0.5);
        return 'You give up a recovery day and a film session. It is the best night you have had in weeks.';
      }),
      opt('explain', 'Explain what this season takes', (f) => {
        f.rel(c.love, 'trust', 2);
        f.rel(c.love, 'romance', -1);
        return 'They listen. They do not love the answer, but they love that you were honest.';
      }),
      opt('brush', '"You knew what this was"', (f) => {
        f.rel(c.love, 'romance', -9);
        f.rel(c.love, 'affinity', -6);
        f.morale(-2);
        return 'It comes out colder than you meant. The silence after is long.';
      }),
    ],
  },
  {
    id: 'long_distance',
    icon: '📞',
    title: 'Miles apart',
    tone: 'odd',
    levels: ['college', 'pro'],
    weight: 3,
    need: ['love'],
    when: (c) => longDistance(c.s),
    text: (c) => `Since the move, you and ${first(c.love)} are in different cities. The time zones and schedules do not line up, and the calls are getting shorter.`,
    options: (c) => [
      opt('call', 'Call every night, no matter what', (f) => {
        f.energy(-6);
        f.rel(c.love, 'romance', 4);
        f.rel(c.love, 'trust', 3);
        return 'You fall asleep on the phone more than once. It is small and it is everything.';
      }),
      opt('visit', 'Book a visit', (f) => {
        f.energy(-10);
        f.rel(c.love, 'romance', 9);
        f.morale(5);
        return 'A weekend together makes the distance feel temporary. It is hard to leave.';
      }, { cost: c.$(120, 900, 12000) }),
      opt('fade', 'Let it drift', (f) => {
        f.rel(c.love, 'romance', -10);
        f.morale(-2);
        return 'Neither of you says it, but the calls slow down. You both know where this is heading.';
      }),
    ],
  },
  {
    id: 'proposal',
    icon: '💍',
    title: 'The question',
    tone: 'good',
    levels: PRO,
    weight: 2.4,
    need: ['love'],
    when: (c) => stageOf(c.s) === 'partner' && (c.love?.relationship.romance ?? 0) >= 65 && !longDistance(c.s),
    text: (c) => `Years of road trips, injuries and bad nights, and ${first(c.love)} was there for all of it. You have been carrying a ring around for a month, waiting for the right moment.`,
    options: (c) => [
      opt('propose', 'Ask them', (f) => {
        if (f.rng.chance(0.9)) {
          setStage(f.s, 'engaged');
          f.rel(c.love, 'romance', 10);
          f.morale(10);
          f.followers(0.06);
          f.rep(1);
          f.news(`${c.me.last} gets engaged.`);
          return 'They say yes before you finish the question. You call everyone you know, and your phone does not stop for two days.';
        }
        f.morale(-6);
        f.rel(c.love, 'romance', -5);
        return 'They are overwhelmed and ask for time. It is not a no, and it is not a yes.';
      }, { cost: c.$(0, 0, 40000), hint: 'Probably, not certainly' }),
      opt('wait', 'Wait for a better moment', () => 'The ring stays in the drawer. There is no hurry, you tell yourself.'),
    ],
  },
  {
    id: 'wedding',
    icon: '🎊',
    title: 'The wedding',
    tone: 'good',
    levels: PRO,
    weight: 2.4,
    need: ['love'],
    when: (c) => stageOf(c.s) === 'engaged' && Number(c.s.story.flags.love_since ?? 0) < c.s.career.season,
    text: (c) => `The date is set. ${first(c.love)} wants it to be right, and the whole city wants an invitation. How big?`,
    options: (c) => [
      opt('big', 'The works', (f) => {
        setStage(f.s, 'married');
        f.rel(c.love, 'romance', 8);
        f.morale(8);
        f.rep(2);
        f.followers(0.1);
        f.rel(c.family, 'affinity', 6);
        f.news(`${c.me.last} gets married in a ceremony the whole league talks about.`);
        return 'Four hundred guests, a band that does not quit, and a first dance you will remember forever.';
      }, { cost: c.$(0, 0, 150000) }),
      opt('small', 'Small and close', (f) => {
        setStage(f.s, 'married');
        f.rel(c.love, 'romance', 8);
        f.morale(8);
        f.rel(c.family, 'affinity', 4);
        return 'Thirty people, a garden, and no cameras. It is exactly right.';
      }, { cost: c.$(0, 0, 25000) }),
      opt('elope', 'Skip the fuss', (f) => {
        setStage(f.s, 'married');
        f.rel(c.love, 'romance', 6);
        f.morale(6);
        f.rel(c.family, 'affinity', -5);
        return 'A courthouse and two witnesses. Your family is not thrilled to find out afterward.';
      }),
    ],
  },
  {
    id: 'baby',
    icon: '👶',
    title: 'A new arrival',
    tone: 'good',
    levels: PRO,
    weight: 2,
    need: ['love'],
    when: (c) => stageOf(c.s) === 'married' && kidsOf(c.s) < 3 && Number(c.s.story.flags.baby_season ?? 0) < c.s.career.season - 1,
    text: (c) => `${first(c.love)} has news, and it takes you a full minute to find any words. Life is about to get a lot louder.`,
    options: (c) => [
      opt('joy', 'Tell everyone', (f) => {
        f.flag('kids', kidsOf(f.s) + 1);
        f.flag('baby_season', f.s.career.season);
        f.morale(10);
        f.followers(0.05);
        f.rel(c.family, 'affinity', 6);
        return 'The sleepless nights start soon after, and so does a different kind of joy. You play for more than yourself now.';
      }, { cost: c.$(0, 0, 20000) }),
      opt('quiet', 'Keep it private', (f) => {
        f.flag('kids', kidsOf(f.s) + 1);
        f.flag('baby_season', f.s.career.season);
        f.morale(10);
        return 'Just the two of you, and then three. It is nobody else’s business, and it is the best thing in your life.';
      }, { cost: c.$(0, 0, 20000) }),
    ],
  },
  {
    id: 'family_scare',
    icon: '🏥',
    title: 'A call from home',
    tone: 'bad',
    levels: ALL,
    weight: 0.9,
    need: ['family'],
    when: (c) => Number(c.s.story.flags.family_scare ?? 0) < c.s.career.season - 2,
    text: (c) => `${first(c.family)} is in the hospital. They say it is under control, but the voice on the phone is not the one you know. A game is coming up.`,
    options: (c) => [
      opt('go', 'Be there', (f) => {
        f.flag('family_scare', f.s.career.season);
        f.energy(-10);
        f.coach(-1);
        f.rel(c.family, 'affinity', 9);
        f.rel(c.family, 'trust', 6);
        f.memory(c.family, 'You dropped everything and came when they were in the hospital.');
        return 'You sit by the bed through the night. Coach understands. It is the right call, even if the lineup suffers.';
      }),
      opt('help', 'Cover everything', (f) => {
        f.flag('family_scare', f.s.career.season);
        f.rel(c.family, 'affinity', 5);
        f.morale(1);
        return 'You pay for the best care and call twice a day. It helps, though it is not the same as being there.';
      }, { cost: c.$(200, 3000, 80000) }),
      opt('focus', 'Stay focused on the game', (f) => {
        f.flag('family_scare', f.s.career.season);
        f.rel(c.family, 'affinity', -7);
        f.morale(-3);
        return 'You tell yourself they would want you to play. You play, and you do not remember a minute of it.';
      }),
    ],
  },
  {
    id: 'captain_vote',
    icon: '🧢',
    title: 'Captain vote',
    tone: 'good',
    levels: ALL,
    weight: 0,
    text: (c) => `The team is voting on a captain this season. A few of the guys have been telling you they would back you. ${c.coach ? `Coach ${first(c.coach)} says the room needs a leader.` : 'Someone has to be the voice in the room.'}`,
    options: (c) => {
      const respect = coachOf(c.s)?.relationship.respect ?? 40;
      const trust = c.teammate?.relationship.trust ?? 30;
      const p = clamp(0.3 + respect / 250 + c.s.player.reputation / 220 + trust / 400, 0.12, 0.85);
      return [
        opt('run', 'Put your name in', (f) => {
          f.flag('captain_asked', f.s.career.season);
          if (f.rng.chance(p)) {
            f.flag('captain_season', f.s.career.season);
            f.chem(5);
            f.coach(3, 2);
            f.rep(1);
            f.morale(4);
            f.news(`${c.me.last} is named team captain.`);
            return 'The count comes back and it is not close. You are the captain. The room looks at you differently now.';
          }
          f.chem(-1);
          f.morale(-3);
          return 'You come up short. Somebody else gets the "C", and you shake their hand.';
        }, { hint: `About a ${Math.round(p * 100)}% chance` }),
        opt('back', 'Back a teammate', (f) => {
          f.flag('captain_asked', f.s.career.season);
          f.chem(2);
          f.rel(c.teammate, 'affinity', 6);
          return 'You throw your support behind someone else. They win, and they will not forget who stood up for them.';
        }),
        opt('stay', 'Stay out of it', (f) => {
          f.flag('captain_asked', f.s.career.season);
          return 'Not your thing. You would rather lead by playing.';
        }),
      ];
    },
  },
  {
    id: 'comeback',
    icon: '🩹',
    title: 'The comeback',
    tone: 'good',
    levels: ALL,
    weight: 0,
    text: (c) => {
      const total = Number(c.s.story.flags.comeback_due ?? 3);
      const sessions = Number(c.s.story.flags.rehab_sessions ?? 0);
      return `You are cleared after ${total} weeks out. ${sessions >= 2 ? 'All those hours of rehab are why you feel solid.' : 'You skipped most of the rehab and it shows in your legs.'} The whole team is watching to see how you move.`;
    },
    options: (c) => [
      opt('ease', 'Ease back in', (f) => {
        f.energy(8);
        f.coach(1);
        f.morale(2);
        return settleComeback(f, c, 'You listen to the trainer, build back slowly, and the sharpness comes with it.');
      }),
      opt('push', 'Prove you are back', (f) => {
        if (f.rng.chance(0.6)) {
          f.morale(5);
          f.coach(0, 2);
          f.rep(1);
          return settleComeback(f, c, 'You come out flying. The crowd stands, and for a few minutes it is like you never left.');
        }
        f.injury('a setback', 1);
        f.morale(-4);
        return settleComeback(f, c, 'You push too hard and feel it pull. A week back on the sideline.');
      }, { hint: 'Better if you did the rehab' }),
      opt('thank', 'Say thanks to the people who stuck with you', (f) => {
        f.rel(c.family, 'affinity', 5);
        f.rel(c.friend, 'affinity', 5);
        f.morale(4);
        return settleComeback(f, c, 'It is a quiet moment, and it matters more than any game. You will not forget who showed up.');
      }),
    ],
  },
  {
    id: 'recruiter_call',
    icon: '📞',
    title: 'A recruiter is calling',
    tone: 'good',
    levels: HS,
    weight: 1.6,
    when: (c) => !!topSuitor(c.s) && c.s.career.year >= 2,
    text: (c) => `${topSuitor(c.s)?.name ?? 'A college program'} is on the line. An assistant coach says they have been to two of your games, and they want to know where your head is at.`,
    options: (c) => {
      const name = topSuitor(c.s)?.name ?? '';
      return [
        opt('listen', 'Hear them out', (f) => {
          interest(f, name, 8, { contact: true });
          f.energy(-2);
          return 'It is a friendly call. They say all the right things about your game and the way you play.';
        }),
        opt('visit', 'Set up a campus visit', (f) => {
          interest(f, name, 18, { contact: true, visited: true });
          f.energy(-10);
          f.coach(-1);
          return 'You spend a weekend on campus. The facilities are unreal, and your coach hears about it, even if nobody says anything.';
        }, { hint: 'Interest jumps. Your coach may notice.' }),
        opt('focus', 'Tell them you are locked in on this season', (f) => {
          interest(f, name, -4);
          f.coach(1.5, 1);
          f.morale(1);
          return 'They respect it. Your coach hears you said it, and likes you a little more.';
        }),
      ];
    },
  },
  {
    id: 'poach_dm',
    icon: '👀',
    title: 'A coach slides into your DMs',
    tone: 'odd',
    levels: COLLEGE,
    weight: 1.3,
    when: (c) => !!topSuitor(c.s),
    text: (c) => `An assistant from ${topSuitor(c.s)?.name ?? 'another program'} messages you: "Your game would look good in our system. Nobody has to know we talked."`,
    options: (c) => {
      const name = topSuitor(c.s)?.name ?? '';
      return [
        opt('tell', 'Tell your coach', (f) => {
          interest(f, name, -10);
          f.coach(3, 1);
          return 'Coach thanks you for the honesty and promises to handle it. You are a little more trusted.';
        }),
        opt('listen', 'Hear them out quietly', (f) => {
          interest(f, name, 12, { contact: true });
          if (f.rng.chance(0.25)) {
            f.coach(-4);
            f.rep(-1);
            return 'Somebody leaks it. Coach hears you were talking to another program and does not say a word, which is worse.';
          }
          return 'It stays between the two of you. It is good to know somebody wants you.';
        }, { hint: 'Could leak' }),
        opt('ignore', 'Ignore it', () => 'You leave it on read. Nobody ever has to know you saw it.'),
      ];
    },
  },
  {
    id: 'recruit_help',
    icon: '🎯',
    title: 'Coach wants you to meet a recruit',
    tone: 'good',
    levels: AMATEUR,
    weight: 1.5,
    need: ['coach'],
    when: (c) => c.s.recruiting.targets.length > 0,
    text: (c) => {
      const t = [...c.s.recruiting.targets].sort((a, b) => b.pull - a.pull)[0];
      return `Coach ${first(c.coach)} says ${t?.name ?? 'a player'}, a ${t?.position ?? 'guard'} from ${t?.fromTeam ?? 'across town'}, is dropping by practice. "Spend some time with them. Players listen to players."`;
    },
    options: (c) => {
      const id = [...c.s.recruiting.targets].sort((a, b) => b.pull - a.pull)[0]?.athleteId;
      return [
        opt('sell', 'Sell them on this team', (f) => {
          bumpTarget(f.s, id, 16);
          f.energy(-6);
          f.coach(2);
          f.note('Recruit: sold on you +16');
          return 'You talk about the team, the guys and what you are building. They leave with a slightly different look in their eye.';
        }),
        opt('real', 'Be honest about what it takes', (f) => {
          bumpTarget(f.s, id, 8);
          f.coach(0, 1);
          f.note('Recruit: sold on you +8');
          return 'You do not oversell it. They respect that, and ask a lot of good questions.';
        }),
        opt('pass', 'Say you are busy', (f) => {
          f.coach(-1);
          return 'Coach nods, a little disappointed. Someone else takes them around.';
        }),
      ];
    },
  },
  {
    id: 'viral_clip',
    icon: '📱',
    title: 'Your clip is going viral',
    tone: 'good',
    levels: ALL,
    weight: 1.4,
    when: (c) => c.s.player.followers >= 100 && c.s.gameLog.length > 0,
    text: (c) => `A clip from your last game is blowing up. It has been shared all over ${c.s.player.hometown} and the comments are a mix of hype and noise.`,
    options: () => [
      opt('post', 'Post a follow-up', (f) => {
        if (f.rng.chance(0.65)) {
          f.followers(0.1);
          f.rep(1);
          return 'The follow-up lands perfectly. Strangers are hyping you up.';
        }
        f.followers(0.02);
        f.rep(-1);
        return 'It reads as trying too hard, and the replies get ugly fast.';
      }, { hint: 'Big upside, small risk' }),
      opt('credit', 'Credit your teammates', (f) => {
        f.followers(0.03);
        f.coach(0, 1.5);
        f.morale(2);
        return 'You turn the spotlight on the guys who set it up. People notice.';
      }),
      opt('quiet', 'Stay off your phone', (f) => {
        f.followers(0.05);
        return 'You let it run its course. The numbers keep climbing without you.';
      }),
    ],
  },
  {
    id: 'ride_trouble',
    icon: '🚗',
    title: 'No ride',
    tone: 'bad',
    levels: ALL,
    weight: 1,
    need: ['coach'],
    when: (c) => c.s.career.phase !== 'offseason',
    text: (c) => `Your ride falls through an hour before practice, and ${c.s.career.level === 'pro' ? 'the car will not start' : 'nobody else is going your way'}. Coach ${first(c.coach)} does not like late.`,
    options: () => [
      opt('hustle', 'Run, bike, whatever it takes', (f) => {
        f.energy(-10);
        f.coach(0, 1);
        return 'You show up soaked in sweat with minutes to spare. Nobody says anything, but they saw.';
      }),
      opt('call', 'Call and tell the truth', (f) => {
        if (f.rng.chance(0.7)) {
          f.coach(1.5);
          return 'Coach appreciates the heads-up and the honesty. "Just get here."';
        }
        f.coach(-1);
        return 'Coach is not in the mood for excuses, honest or not.';
      }),
      opt('skip', 'Skip it', (f) => {
        f.coach(-4);
        f.morale(1);
        return 'You stay home. The text from Coach arrives before you even sit down.';
      }),
    ],
  },
  {
    id: 'flu',
    icon: '🤒',
    title: 'Down with a fever',
    tone: 'bad',
    levels: ALL,
    weight: 0.9,
    when: healthy,
    text: () => 'You wake up burning up, with a throat like sandpaper. A full day of rest sounds amazing, and so does not letting anybody down.',
    options: () => [
      opt('rest', 'Stay in bed', (f) => {
        f.energy(12);
        f.morale(-1);
        return 'You sleep fourteen hours. You feel human again, and a little guilty.';
      }),
      opt('tough', 'Tough it out', (f) => {
        f.energy(-15);
        if (f.rng.chance(0.3)) {
          f.injury('the flu', 1);
          return 'You push through and pay for it. By afternoon you are shivering in the trainer’s room.';
        }
        return 'You grit your teeth through it. Misery, but you get through.';
      }, { hint: 'You might get worse' }),
    ],
  },
  {
    id: 'pickup_game',
    icon: '🏀',
    title: 'A challenge at the park',
    tone: 'odd',
    levels: ALL,
    weight: 1,
    when: healthy,
    text: (c) => `A local legend who has been running the ${c.level === 'pro' ? 'private gym' : 'park'} calls you out in front of a crowd: "Heard you are somebody now. Prove it."`,
    options: (c) => {
      const mean = LEVEL_CONFIG[c.level].ratingMean;
      const p = clamp(0.4 + (c.me.ovr - mean) / 40, 0.2, 0.85);
      const stake = c.$(25, 250, 15000);
      return [
        opt('play', 'Take the challenge', (f) => {
          f.energy(-8);
          if (f.rng.chance(p)) {
            f.rep(1);
            f.morale(4);
            f.followers(0.03);
            return 'You take the win in front of everyone. By dinner it is all over town.';
          }
          f.morale(-4);
          return 'They send you home humbled. The worst part is the video someone took.';
        }),
        opt('bet', 'Make it interesting', (f) => {
          f.energy(-8);
          if (f.rng.chance(p)) {
            f.money(stake * 2);
            f.morale(5);
            f.rep(1);
            return 'You win it, collect the cash, and the park gives you a standing ovation.';
          }
          f.morale(-5);
          return 'You lose the game and the money. Everyone saw.';
        }, { cost: stake, hint: 'Win and you double it' }),
        opt('pass', 'Walk away', () => 'You smile, wave, and leave. Some people call it smart. Some call it scared.'),
      ];
    },
  },
  {
    id: 'locker_beef',
    icon: '🥊',
    title: 'Tempers in the locker room',
    tone: 'bad',
    levels: ALL,
    weight: 1.2,
    need: ['teammate'],
    text: (c) => `${first(c.teammate)} and another player are chest to chest over who gets the shots. The whole room goes quiet and looks at you.`,
    options: (c) => [
      opt('step', 'Step between them', (f) => {
        if (f.rng.chance(clamp(0.45 + c.s.player.reputation / 200 + (isCaptain(c.s) ? 0.15 : 0), 0.4, 0.92))) {
          f.chem(3);
          f.rel(c.teammate, 'trust', 6);
          f.coach(0, 2);
          f.morale(2);
          return 'Your voice cuts through it. They back off, and the room remembers who stepped up.';
        }
        f.rel(c.teammate, 'affinity', -5);
        f.morale(-2);
        return 'It does not work. They turn on you instead, and you take the heat.';
      }),
      opt('side', `Back ${first(c.teammate)}`, (f) => {
        f.chem(-3);
        f.rel(c.teammate, 'affinity', 8);
        f.coach(-1);
        return 'You stand next to your teammate. They will not forget it, and neither will the other side.';
      }),
      opt('walk', 'Stay out of it', (f) => {
        f.chem(-1);
        f.rel(c.teammate, 'respect', -2);
        return 'You grab your bag and leave it alone. It blows over, but you notice who noticed.';
      }),
    ],
  },
  {
    id: 'rival_post',
    icon: '🔥',
    title: 'Your rival takes a shot',
    tone: 'odd',
    levels: ALL,
    weight: 1.1,
    need: ['rival'],
    text: (c) => `${c.rival?.name} posted a clip calling you overrated. It already has thousands of likes, and your friends keep sending it.`,
    options: (c) => [
      opt('fire', 'Fire back online', (f) => {
        f.rel(c.rival, 'rivalry', 8);
        if (f.rng.chance(0.55)) {
          f.followers(0.08);
          f.rep(1);
          return 'Your reply is perfect and it goes everywhere. The internet picks a side, and it is yours.';
        }
        f.coach(-2);
        f.rep(-1);
        return 'The reply gets dragged. Coach hears about it before you do.';
      }),
      opt('fuel', 'Save it for the court', (f) => {
        f.morale(3);
        f.rel(c.rival, 'rivalry', 5);
        f.progress('shooting', 0.4);
        return 'You screenshot it, close the app, and head to the gym. It is a good night for work.';
      }),
      opt('dm', 'Message them directly', (f) => {
        if (f.rng.chance(0.5)) {
          f.rel(c.rival, 'respect', 6);
          f.rel(c.rival, 'rivalry', -5);
          return 'They are surprised you reached out. It turns into a real conversation, and some mutual respect.';
        }
        f.rel(c.rival, 'rivalry', 6);
        f.rel(c.rival, 'affinity', -4);
        return 'They screenshot your message and post it too. That went exactly how you did not want.';
      }),
    ],
  },
  {
    id: 'coach_film',
    icon: '🎞️',
    title: 'A late text from Coach',
    tone: 'good',
    levels: ALL,
    weight: 1,
    need: ['coach'],
    text: (c) => `Coach ${first(c.coach)} texts at 11 p.m.: "Film session at 6 a.m. tomorrow. Optional. Think about it."`,
    options: () => [
      opt('go', 'Be there at 6', (f) => {
        f.energy(-10);
        f.coach(3, 2);
        f.progress('iq', 0.6);
        return 'The gym is dark except for the projector. Coach points out three things you had never noticed.';
      }),
      opt('ask', 'Ask what to look for', (f) => {
        f.energy(-3);
        f.coach(1);
        f.progress('iq', 0.3);
        return 'Coach sends back a short list. You watch it at your own pace and still learn something.';
      }),
      opt('sleep', 'Sleep', (f) => {
        f.energy(6);
        f.coach(-1);
        return 'Optional means optional, right? You are not sure Coach agrees.';
      }),
    ],
  },
  {
    id: 'envelope',
    icon: '✉️',
    title: 'An envelope in your locker',
    tone: 'money',
    levels: AMATEUR,
    weight: 0.8,
    text: (c) => `There is an envelope in your locker with $${c.$(300, 3000, 0).toLocaleString()} in cash and no name on it. The note says only: "Thanks for what you do."`,
    options: (c) => [
      opt('keep', 'Keep it', (f) => {
        f.money(c.$(300, 3000, 0));
        f.flag('took_envelope', true);
        if (f.rng.chance(0.3)) {
          f.rep(-4);
          f.coach(-4, -3);
          f.injury('a suspension', 1);
          f.news(`${c.me.last} is held out while the school looks into impermissible benefits.`);
          return 'It gets out. The compliance office has questions, and you sit while they ask them.';
        }
        return 'You tuck it away. No one ever asks about it, but you think about it more than you want to.';
      }, { hint: 'Free money. It might be a problem.' }),
      opt('report', 'Hand it to your coach', (f) => {
        f.coach(2, 3);
        f.rep(1);
        f.morale(-1);
        return 'Coach looks at the envelope, then at you. "That was the right call." It is a heavy kind of pride.';
      }),
    ],
  },
  {
    id: 'found_wallet',
    icon: '👛',
    title: 'A lost wallet',
    tone: 'good',
    levels: ALL,
    weight: 0.9,
    text: () => 'You find a wallet in the parking lot. There is cash in it and an ID of someone who lives a few blocks away.',
    options: (c) => [
      opt('return', 'Return it', (f) => {
        f.rep(1);
        f.morale(3);
        if (f.rng.chance(0.5)) {
          f.money(c.$(20, 100, 500));
          return 'The owner is so grateful they press a reward into your hand.';
        }
        return 'The owner thanks you three times. It feels good to be that person.';
      }),
      opt('keep', 'Keep the cash', (f) => {
        f.money(c.$(60, 200, 800));
        f.morale(-3);
        return 'You pocket the money. It does not feel as good as you thought it would.';
      }),
    ],
  },
  {
    id: 'clinic_ask',
    icon: '🧒',
    title: 'Kids want you to run a clinic',
    tone: 'good',
    levels: ALL,
    weight: 1,
    when: (c) => c.s.player.reputation >= 8,
    text: (c) => `A youth program from ${c.s.player.hometown} asks if you will run a clinic on Saturday. The kids already have your jersey.`,
    options: (c) => [
      opt('run', 'Run it', (f) => {
        f.energy(-8);
        f.rep(2);
        f.followers(0.04);
        f.morale(4);
        f.rel(c.family, 'affinity', 3);
        return 'Forty kids, one gym, and every one of them tries to dunk. You leave tired and weirdly happy.';
      }),
      opt('donate', 'Donate gear instead', (f) => {
        f.rep(2);
        f.followers(0.03);
        f.morale(3);
        return 'A box of balls and jerseys shows up at the gym with your name on the card. The kids go wild.';
      }, { cost: c.$(50, 400, 25000) }),
      opt('jersey', 'Send a signed jersey', (f) => {
        f.rep(1);
        f.followers(0.01);
        return 'The jersey hangs in the program’s office. It is not much, but it means something to them.';
      }),
      opt('no', 'Not this week', () => 'You send a polite no. They understand. You still feel a little odd about it.'),
    ],
  },
  {
    id: 'power_cut',
    icon: '⚡',
    title: 'The power goes out',
    tone: 'odd',
    levels: ALL,
    weight: 0.8,
    when: inSeason,
    text: () => 'A storm takes out the power across the neighborhood and the gym is dark. Practice is off. You have an unexpected free evening.',
    options: () => [
      opt('sprints', 'Run hills outside', (f) => {
        f.energy(-10);
        f.progress('stamina', 0.9);
        return 'You run until your lungs burn, in the rain, with no one watching. Good work.';
      }),
      opt('film', 'Watch film on your phone', (f) => {
        f.energy(-3);
        f.progress('iq', 0.7);
        return 'You watch your own mistakes pile up on a tiny screen. Painful, and exactly what you needed.';
      }),
      opt('off', 'Take the night off', (f) => {
        f.energy(15);
        f.morale(2);
        return 'Candles, takeout, and a long sleep. You will not apologize for it.';
      }),
    ],
  },
  {
    id: 'old_tweet',
    icon: '😬',
    title: 'An old post resurfaces',
    tone: 'bad',
    levels: ALL,
    weight: 0.9,
    when: (c) => c.s.player.followers >= 300 && c.s.player.reputation >= 5,
    text: () => 'Someone dug up something you posted years ago, back when you were a kid with no filter. It is making the rounds with a lot of screenshots.',
    options: () => [
      opt('own', 'Own it and apologize', (f) => {
        f.rep(-1);
        f.followers(-0.01);
        f.morale(1);
        return 'You post an honest apology. Some people roll their eyes, but most respect that you did not hide.';
      }),
      opt('double', 'Double down', (f) => {
        if (f.rng.chance(0.5)) {
          f.followers(0.07);
          f.rep(1);
          return 'It somehow lands as confidence. Your supporters dig in, loudly.';
        }
        f.rep(-3);
        f.followers(-0.04);
        return 'It makes things much worse. The story is bigger than the original post.';
      }, { hint: 'Coin flip' }),
      opt('ignore', 'Say nothing', (f) => {
        f.rep(-1);
        f.morale(-2);
        return 'You let it burn out. It takes a week, and you do not enjoy any of it.';
      }),
    ],
  },
  {
    id: 'kid_autograph',
    icon: '✍️',
    title: 'A kid has waited an hour',
    tone: 'good',
    levels: ALL,
    weight: 1,
    when: (c) => c.s.player.reputation >= 5,
    text: () => 'After the gym empties, there is one kid still at the door, holding a ball and a marker. Their ride was supposed to come an hour ago.',
    options: () => [
      opt('stay', 'Sit down and talk', (f) => {
        f.energy(-3);
        f.morale(4);
        f.rep(1);
        f.followers(0.03);
        return 'You talk shop until their ride shows up. The kid’s mother posts about it that night.';
      }),
      opt('sign', 'Sign it and go', (f) => {
        f.followers(0.01);
        return 'A quick signature and a smile. It is something. You just wish you had time for more.';
      }),
      opt('leave', 'Keep walking', (f) => {
        f.rep(-1);
        return 'You are tired and you have somewhere to be. Somebody saw, though.';
      }),
    ],
  },
  {
    id: 'prank',
    icon: '😂',
    title: 'The team has a plan',
    tone: 'odd',
    levels: ALL,
    weight: 0.9,
    need: ['teammate'],
    text: (c) => `The guys have cooked up a prank for the whole locker room involving a rubber snake and ${first(c.teammate)}'s bag. They want you in on it.`,
    options: (c) => [
      opt('join', 'Count me in', (f) => {
        f.chem(3);
        f.rel(c.teammate, 'affinity', 5);
        f.morale(3);
        if (f.rng.chance(0.2)) {
          f.coach(-1);
          return 'It works, and the screaming can be heard in the hallway. Coach is not amused.';
        }
        return 'The scream is legendary. The whole team is in tears. Best day of the season.';
      }),
      opt('warn', `Warn ${first(c.teammate)}`, (f) => {
        f.chem(1);
        f.rel(c.teammate, 'trust', 6);
        f.morale(1);
        return 'You give them a quiet heads-up. They pull off the best fake-out reaction ever. You are in on a bigger joke now.';
      }),
      opt('stop', 'Tell Coach', (f) => {
        f.chem(-2);
        f.coach(1, 2);
        f.rel(c.teammate, 'affinity', -6);
        return 'The prank is shut down. Coach is grateful. The locker room is a little colder toward you.';
      }),
    ],
  },
  {
    id: 'scout_note',
    icon: '🧭',
    title: 'Someone wrote about you',
    tone: 'good',
    levels: AMATEUR,
    weight: 1,
    when: (c) => c.s.player.reputation >= 5 && (c.level === 'college' || c.s.career.year >= 2),
    text: (c) => `${c.level === 'hs' ? 'A recruiting analyst' : 'A draft analyst'} posted a piece with your name in it: "A name to know. Needs to prove it consistently."`,
    options: () => [
      opt('share', 'Share it', (f) => {
        f.followers(0.06);
        f.rep(1);
        return 'Your phone lights up. A few more eyes are on you now.';
      }),
      opt('work', 'Use "prove it" as fuel', (f) => {
        f.energy(-5);
        f.morale(2);
        f.progress('shooting', 0.5);
        f.progress('finishing', 0.3);
        return 'You print the line and tape it inside your locker. You are in the gym an hour early all week.';
      }),
      opt('ignore', 'Ignore it', () => 'You are not here for the likes. Not much changes, and that is fine.'),
    ],
  },
  {
    id: 'ankle_scare',
    icon: '🦶',
    title: 'You land awkwardly',
    tone: 'bad',
    levels: ALL,
    weight: 0.9,
    when: (c) => healthy(c) && inSeason(c),
    text: () => 'In a drill you come down on somebody’s foot. Your ankle rolls and you feel a hot flash. It could be nothing. It could be something.',
    options: () => [
      opt('tell', 'Tell the trainer right away', (f) => {
        f.injury('rolled ankle', 1);
        f.coach(1);
        f.morale(-2);
        return 'The trainer tapes it and keeps you out a week. Annoying, but smart.';
      }),
      opt('shake', 'Shake it off', (f) => {
        if (f.rng.chance(0.55)) {
          f.coach(0, 2);
          return 'You walk it off and finish practice. Coach nods. The ankle holds up, this time.';
        }
        f.injury('tweaked ankle', 2);
        f.morale(-3);
        return 'By the end of practice you cannot put weight on it. You should have said something.';
      }, { hint: 'Gamble on your body' }),
    ],
  },
  {
    id: 'exam_crunch',
    icon: '📝',
    title: 'A paper is due tomorrow',
    tone: 'bad',
    levels: AMATEUR,
    weight: 1.2,
    text: () => 'A big paper is due in the morning and you have not written a word. The gym keeps pulling you, and so does your bed.',
    options: (c) => [
      opt('all', 'Pull an all-nighter', (f) => {
        f.energy(-18);
        f.gpa(0.12);
        return 'Cold coffee, a mountain of notes, and a paper that actually holds together. You feel like a zombie in the morning.';
      }),
      opt('tutor', 'Pay for help', (f) => {
        f.energy(-4);
        f.gpa(0.1);
        return 'A tutor walks you through it in two hours. You learn something and sleep fine.';
      }, { cost: c.$(60, 400, 0) }),
      opt('skip', 'Turn in whatever you have', (f) => {
        f.gpa(-0.12);
        f.morale(2);
        return 'You get your sleep. You also get the grade you probably expected.';
      }),
    ],
  },
  {
    id: 'family_money',
    icon: '🏠',
    title: 'Trouble at home',
    tone: 'money',
    levels: ALL,
    weight: 1.1,
    need: ['family'],
    text: (c) => `${first(c.family)} is quiet at dinner. The bills are stacked up and something in the house broke that nobody can afford to fix. Nobody asks you for anything, which is how you know.`,
    options: (c) => [
      opt('help', 'Cover it', (f) => {
        f.rel(c.family, 'affinity', 8);
        f.rel(c.family, 'trust', 6);
        f.morale(2);
        f.memory(c.family, `You stepped in when money got tight at home.`);
        return `${first(c.family)} tries to refuse and then cannot. It is the first time in a while they have cried in front of you, in a good way.`;
      }, { cost: c.$(120, 1500, 60000) }),
      opt('listen', 'Just be there', (f) => {
        f.rel(c.family, 'affinity', 3);
        f.energy(-3);
        return 'You cannot fix it, but you stay at the table until late. It matters more than you think.';
      }),
      opt('brush', '"That is not my problem"', (f) => {
        f.rel(c.family, 'affinity', -6);
        f.rel(c.family, 'trust', -4);
        f.morale(-3);
        return 'The words come out meaner than you meant. The house is very quiet after.';
      }),
    ],
  },
  {
    id: 'crush_text',
    icon: '💬',
    title: 'A text you were hoping for',
    tone: 'good',
    levels: AMATEUR,
    weight: 1,
    need: ['love'],
    text: (c) => `${first(c.love)} texts you late: "Hey. Are you free to talk?" Your phone is in your hand and your heart is somewhere near your throat.`,
    options: (c) => [
      opt('reply', 'Reply right away', (f) => {
        f.rel(c.love, 'romance', 6);
        f.rel(c.love, 'affinity', 4);
        f.energy(-3);
        return 'You talk until 1 a.m. You do not remember what about, just that you did not want it to end.';
      }),
      opt('later', 'Wait a bit', (f) => {
        f.rel(c.love, 'romance', 1);
        return 'You reply in the morning like it is nothing. Smooth, or maybe too cool.';
      }),
      opt('ignore', 'Leave it on read', (f) => {
        f.rel(c.love, 'romance', -2);
        f.rel(c.love, 'affinity', -3);
        return 'You are not sure what to say, so you say nothing. It sits there all day.';
      }),
    ],
  },
  {
    id: 'party_invite',
    icon: '🎉',
    title: 'The night before',
    tone: 'odd',
    levels: AMATEUR,
    weight: 1.1,
    need: ['friend'],
    text: (c) => `${first(c.friend)} is putting together a big night out, and it is the night before ${c.s.career.phase === 'offseason' ? 'a workout' : 'a game'}. "One night. You never come out anymore."`,
    options: (c) => [
      opt('go', 'Go for a while', (f) => {
        f.chem(2);
        f.rel(c.friend, 'affinity', 7);
        f.morale(4);
        f.energy(-12);
        if (f.rng.chance(0.25)) {
          f.coach(-2);
          return 'You have the time of your life. Somebody posts a photo, and word reaches Coach by morning.';
        }
        return 'Best night you have had in months. You are dragging in the morning, but you would do it again.';
      }),
      opt('gym', 'Drag them to the gym instead', (f) => {
        f.rel(c.friend, 'trust', 5);
        f.rel(c.friend, 'affinity', 2);
        f.energy(-6);
        f.progress('handles', 0.4);
        return 'You shoot around until the lights shut off. It is not a party, but you leave closer than before.';
      }),
      opt('stay', 'Stay in', (f) => {
        f.rel(c.friend, 'affinity', -3);
        f.energy(6);
        f.coach(0, 1);
        return 'You pass. It is the right move for your body, even if the group chat has jokes.';
      }),
    ],
  },
  {
    id: 'investment_pitch',
    icon: '📈',
    title: 'A "sure thing"',
    tone: 'money',
    levels: UP,
    weight: 1,
    when: (c) => c.s.player.money >= c.$(0, 1500, 150000),
    text: (c) => `${c.friend ? first(c.friend) : 'A cousin'} corners you with a business plan: ${c.pick(['a restaurant', 'a sneaker resale shop', 'a car wash chain', 'a streaming startup'])}. "I just need somebody to believe in me."`,
    options: (c) => {
      const stake = c.$(0, 1500, 150000);
      const roll = (f: Fx, cost: number) => {
        const r = f.rng.next();
        if (r < 0.3) {
          f.money(cost * 3);
          f.rep(1);
          return 'Against the odds, it takes off. You are suddenly a smart investor.';
        }
        if (r < 0.7) {
          f.money(cost);
          return 'It limps along and you get your money back in the end. Nobody gets rich.';
        }
        f.morale(-3);
        return 'The business folds in a few months. Your money goes with it.';
      };
      return [
        opt('all', 'Go all in', (f) => roll(f, stake), { cost: stake, hint: 'Could triple. Could vanish.' }),
        opt('half', 'Put in half', (f) => roll(f, Math.round(stake / 2)), { cost: Math.round(stake / 2) }),
        opt('pass', 'Pass politely', (f) => {
          f.rel(c.friend, 'affinity', -2);
          return 'You tell them you are not in a position to do it. They say they understand.';
        }),
      ];
    },
  },
  {
    id: 'gear_failure',
    icon: '👟',
    title: 'Your shoes blow out',
    tone: 'bad',
    levels: ALL,
    weight: 1,
    when: inSeason,
    text: () => 'In warmups your sole peels clean off. A game is minutes away and your bag has nothing in your size.',
    options: (c) => [
      opt('buy', 'Buy a new pair', (f) => {
        f.morale(2);
        return 'You send someone out and have a fresh pair in time. They feel a little stiff, but they are yours.';
      }, { cost: c.$(90, 200, 1500) }),
      opt('tape', 'Tape them up', (f) => {
        f.morale(-3);
        f.energy(-2);
        if (f.rng.chance(0.25)) {
          f.injury('a sore foot', 1);
          return 'The tape peels off in the second quarter and your foot pays for it.';
        }
        return 'Ugly, but it holds. You play on tape and a prayer.';
      }),
      opt('borrow', 'Borrow a pair', (f) => {
        f.morale(-1);
        return 'A teammate hands over a half-size-too-big pair. You do what you can.';
      }),
    ],
  },
  {
    id: 'tax_bill',
    icon: '🧾',
    title: 'A letter from the tax office',
    tone: 'money',
    levels: PRO,
    weight: 0.9,
    text: () => 'Your accountant calls with a headache. A return was filed wrong and the tax office wants the difference, plus a penalty.',
    options: (c) => {
      const owed = c.$(0, 0, 150000);
      return [
        opt('pay', 'Pay it and move on', (f) => {
          f.morale(-2);
          return 'You write the check. Annoying, but it is over.';
        }, { cost: owed }),
        opt('fight', 'Fight it', (f) => {
          if (f.rng.chance(0.55)) {
            f.money(-Math.round(owed / 2));
            return 'Your lawyer gets it cut in half. A rare win against the system.';
          }
          f.money(-Math.round(owed * 1.4));
          f.morale(-4);
          return 'You lose, and the penalty grows. It costs you a lot more than if you had just paid.';
        }, { hint: 'Could halve it. Could cost more.' }),
      ];
    },
  },
  {
    id: 'charity_gala',
    icon: '🥂',
    title: 'A charity gala wants you',
    tone: 'money',
    levels: PRO,
    weight: 0.9,
    when: (c) => c.s.player.reputation >= 20,
    text: () => 'The city’s biggest charity night is on Thursday. Everyone who matters will be there, and the organizers want you at a table.',
    options: (c) => [
      opt('attend', 'Buy a seat', (f) => {
        f.rep(3);
        f.followers(0.04);
        f.morale(2);
        f.energy(-4);
        return 'A great night for a great cause. Your photo is in every recap.';
      }, { cost: c.$(0, 0, 30000) }),
      opt('table', 'Sponsor a table', (f) => {
        f.rep(5);
        f.followers(0.07);
        f.morale(3);
        f.energy(-4);
        return 'You fill a table with your people, and the organizers thank you from the stage.';
      }, { cost: c.$(0, 0, 80000) }),
      opt('skip', 'Send regrets', () => 'You send a polite note. The night goes on without you.'),
    ],
  },
  {
    id: 'booster_offer',
    icon: '🤫',
    title: 'A booster wants to help',
    tone: 'money',
    levels: COLLEGE,
    weight: 0.9,
    text: (c) => `A well-connected booster catches you outside the facility and presses a "welcome gift" into your hand: $${c.$(0, 2500, 0).toLocaleString()}. "Nobody needs to know."`,
    options: (c) => [
      opt('take', 'Take it', (f) => {
        f.money(c.$(0, 2500, 0));
        if (f.rng.chance(0.3)) {
          f.rep(-4);
          f.coach(-4, -3);
          f.injury('a suspension', 1);
          f.news(`${c.me.last} is held out as the program reviews contact with a booster.`);
          return 'It does not stay quiet. You sit while the compliance office works through it.';
        }
        return 'You keep the money and the secret. It sits heavy, but nothing happens.';
      }, { hint: 'Money now, trouble maybe' }),
      opt('refuse', 'Turn it down', (f) => {
        f.rep(1);
        f.coach(1, 2);
        f.morale(1);
        return 'You hand it back. The booster smiles like they expected it, and walks away.';
      }),
      opt('report', 'Report it', (f) => {
        f.coach(4, 3);
        f.rep(1);
        return 'The athletic director thanks you personally. A booster is no longer welcome in the building.';
      }),
    ],
  },
  {
    id: 'skills_camp',
    icon: '⛺',
    title: 'One spot left at an elite camp',
    tone: 'money',
    levels: AMATEUR,
    weight: 0.9,
    text: (c) => `A skills camp with the best trainers around has one opening, and it is yours if you can cover the $${c.$(200, 1500, 0).toLocaleString()} fee. The kind of week that changes a game.`,
    options: (c) => [
      opt('shoot', 'Shooting camp', (f) => {
        f.energy(-6);
        f.progress('shooting', 1.2);
        f.progress('handles', 0.3);
        return 'A week of form shooting and a trainer who will not let a bad rep slide. Your shot feels different.';
      }, { cost: c.$(200, 1500, 0) }),
      opt('athletic', 'Athletic camp', (f) => {
        f.energy(-8);
        f.progress('athleticism', 1.2);
        f.progress('stamina', 0.4);
        return 'Sprints, jumps and a lot of vomiting in a bucket. You come out faster.';
      }, { cost: c.$(200, 1500, 0) }),
      opt('skip', 'Not this time', () => 'You pass. Maybe next year the money or the timing works out.'),
    ],
  },
  {
    id: 'trade_rumor',
    icon: '📰',
    title: 'Trade rumors',
    tone: 'odd',
    levels: PRO,
    weight: 1,
    text: () => 'A column names you in a trade rumor and the beat reporters will not stop asking. Nobody has told you anything.',
    options: () => [
      opt('gm', 'Ask the GM straight up', (f) => {
        if (f.rng.chance(0.5)) {
          f.coach(3);
          f.morale(2);
          return '"You are part of what we are building." For now, you believe it.';
        }
        f.morale(-3);
        return 'The GM gives you a lot of words and no answer. That is an answer, you think.';
      }),
      opt('agent', 'Tell your agent to listen', (f) => {
        f.flag('trade_interest', f.s.career.season);
        f.morale(1);
        return 'Your agent says teams are quietly interested. If you ask for a move this season, the front office will be more willing to talk.';
      }, { hint: 'Makes a trade request more likely to work' }),
      opt('ignore', 'Keep your head down', (f) => {
        f.energy(-2);
        return 'You do your job and refuse every question. It blows over, mostly.';
      }),
    ],
  },
  {
    id: 'vet_mentor',
    icon: '🧓',
    title: 'A veteran wants to teach you',
    tone: 'good',
    levels: UP,
    weight: 1,
    need: ['teammate'],
    text: (c) => `${first(c.teammate)} has been watching you in drills. After practice: "Stay late. I will show you a few things nobody showed me until I was thirty."`,
    options: (c) => [
      opt('yes', 'Stay late', (f) => {
        f.energy(-6);
        f.progress('iq', 0.8);
        f.progress('defense', 0.3);
        f.rel(c.teammate, 'trust', 6);
        f.rel(c.teammate, 'affinity', 5);
        return 'Two hours of footwork, angles and tricks of the trade. You feel like you skipped a year of learning.';
      }),
      opt('no', 'Thanks, not today', (f) => {
        f.rel(c.teammate, 'respect', -2);
        f.rel(c.teammate, 'affinity', -2);
        return 'You say you are beat. They shrug, but the offer will not stay open forever.';
      }),
    ],
  },
  {
    id: 'growth_spurt',
    icon: '📏',
    title: 'You grew',
    tone: 'good',
    levels: HS,
    weight: 0.9,
    when: (c) => c.s.athletes[c.s.player.athleteId].age <= 17 && Number(c.s.story.flags.growth_n ?? 0) < 2,
    text: () => 'Your pants are short again and the door frame says you are taller. You hit another growth spurt over the break.',
    options: () => [
      opt('ok', 'Nice', (f) => {
        const me = f.s.athletes[f.s.player.athleteId];
        me.heightIn = Math.min(84, me.heightIn + 1);
        f.flag('growth_n', Number(f.s.story.flags.growth_n ?? 0) + 1);
        f.progress('rebounding', 0.5);
        f.note('Height +1 in');
        return 'An inch taller. Things look a little different from up here.';
      }),
    ],
  },
  {
    id: 'free_gear',
    icon: '🎁',
    title: 'A box shows up',
    tone: 'good',
    levels: ALL,
    weight: 0.9,
    when: (c) => c.s.player.followers >= 200,
    text: () => 'A local shop sends a box of free gear to the gym with a handwritten note: "Rep us. No strings."',
    options: () => [
      opt('wear', 'Wear it and post', (f) => {
        f.followers(0.02);
        f.morale(3);
        return 'You look good and the shop is thrilled. A small win.';
      }),
      opt('team', 'Share it with the team', (f) => {
        f.coach(0, 2);
        f.morale(3);
        f.rep(1);
        return 'You hand it out in the locker room. For one day everybody is wearing something new.';
      }),
    ],
  },
  {
    id: 'homecoming',
    icon: '💃',
    title: 'Homecoming',
    tone: 'odd',
    levels: HS,
    weight: 0.9,
    need: ['love'],
    text: (c) => `Homecoming falls on the night before a game, and ${first(c.love)} just asked if you are going. Coach has told everyone to be home by nine.`,
    options: (c) => [
      opt('go', 'Go all night', (f) => {
        f.energy(-8);
        f.morale(5);
        f.rel(c.love, 'romance', 7);
        f.rel(c.love, 'affinity', 5);
        f.coach(-1);
        return 'You dance until your feet hurt. It is the kind of night you remember. Coach does not need to know.';
      }),
      opt('short', 'Go for an hour', (f) => {
        f.energy(-3);
        f.rel(c.love, 'romance', 3);
        f.morale(2);
        return 'You show up, get a dance, and slip out early. Not perfect, but not nothing.';
      }),
      opt('skip', 'Skip it', (f) => {
        f.energy(4);
        f.rel(c.love, 'romance', -3);
        f.rel(c.love, 'affinity', -5);
        return 'You stay home to be ready for the game. It is the responsible choice, and it hurts a little.';
      }),
    ],
  },
  {
    id: 'rival_press',
    icon: '🗞️',
    title: 'Everybody is comparing you',
    tone: 'odd',
    levels: ALL,
    weight: 1,
    need: ['rival'],
    text: (c) => {
      const st = c.rival ? athleteStatus(c.s, c.rival) : null;
      const line = st?.line ? `${c.rival?.name} is putting up ${Math.round(st.line.ppg * 10) / 10} a game${st.teamName ? ` for ${st.teamName}` : ''}` : `${c.rival?.name} is getting a lot of attention`;
      return `${line}, and every piece of coverage ends up comparing the two of you. It feels like there is only room for one name.`;
    },
    options: (c) => [
      opt('congrats', 'Congratulate them', (f) => {
        f.rel(c.rival, 'respect', 5);
        f.rel(c.rival, 'affinity', 3);
        f.rel(c.rival, 'rivalry', -4);
        return 'You send a short, genuine message. They reply with one word: "Thanks." It is the most civil you have been.';
      }),
      opt('fuel', 'Let it drive you', (f) => {
        f.morale(2);
        f.energy(-4);
        f.rel(c.rival, 'rivalry', 5);
        f.progress('shooting', 0.3);
        f.progress('defense', 0.3);
        return 'You stay late at the gym and think of nothing else. Competition is a hell of a drug.';
      }),
      opt('dismiss', 'Ignore the noise', (f) => {
        f.morale(-1);
        return 'You close the tabs and go for a walk. The comparison does not go away.';
      }),
    ],
  },
  {
    id: 'friend_slump',
    icon: '😞',
    title: 'Your friend is struggling',
    tone: 'bad',
    levels: ALL,
    weight: 1.1,
    need: ['friend'],
    when: (c) => {
      const st = c.friend ? athleteStatus(c.s, c.friend) : null;
      return !!st && (st.rank >= 6 || (!!st.line && st.line.mpg < 12));
    },
    text: (c) => `${c.friend?.name} has barely played lately and it is eating at them. They have stopped answering texts as fast. You can tell something is off.`,
    options: (c) => [
      opt('gym', 'Take them to the gym', (f) => {
        f.energy(-8);
        f.rel(c.friend, 'trust', 8);
        f.rel(c.friend, 'affinity', 6);
        f.memory(c.friend, 'You got them out of a dark stretch when no one else did.');
        return 'You do not say much. You just rebound for them for two hours. By the end they are laughing.';
      }),
      opt('talk', 'Talk it out', (f) => {
        f.rel(c.friend, 'affinity', 3);
        f.rel(c.friend, 'trust', 3);
        f.morale(1);
        return 'You listen. It does not change the lineup, but it helps to say it out loud.';
      }),
      opt('self', 'Focus on yourself', (f) => {
        f.rel(c.friend, 'affinity', -5);
        f.rel(c.friend, 'trust', -3);
        return 'You have your own stuff to worry about. They notice, and they say nothing.';
      }),
    ],
  },
  {
    id: 'traded_away',
    icon: '📦',
    title: 'The call you were afraid of',
    tone: 'bad',
    levels: PRO,
    weight: 0.35,
    when: (c) => c.s.career.phase === 'regular' && c.s.career.week <= tradeDeadlineWeek(c.s) && c.s.career.week >= 2,
    text: () => 'The GM asks you to come up to the office, and your agent is already there. "We just got off the phone. You have been traded."',
    options: () => [
      opt('go', 'Pack your things', (f) => {
        const r = forceTrade(f.s, f.rng);
        if (!r) return 'The deal falls through at the last minute. You are staying, but nobody will meet your eyes.';
        f.lines.push(...r.lines);
        return `You are headed to ${r.to}. You say goodbyes in the parking lot and drive to a city you barely know.`;
      }),
    ],
  },
  {
    id: 'coach_fired',
    icon: '🪧',
    title: 'The coach is out',
    tone: 'bad',
    levels: ALL,
    weight: 0.3,
    need: ['coach'],
    when: (c) => c.s.career.phase !== 'preseason',
    text: (c) => `The team announces that Coach ${c.coach?.name} has been let go. A new head coach will take over, and nobody knows anything about them.`,
    options: () => [
      opt('go', 'Meet the new coach', (f) => {
        const r = replaceCoach(f.s, f.rng);
        f.morale(-2);
        if (!r) return 'The announcement is made, and that is all anyone knows.';
        return `${r.newName} takes over. The first meeting is polite and cold. They tell the room that everyone starts from zero.`;
      }),
    ],
  },
  {
    id: 'snow_day',
    icon: '❄️',
    title: 'Snowed in',
    tone: 'odd',
    levels: AMATEUR,
    weight: 0.8,
    when: inSeason,
    text: () => 'A blizzard shuts everything down. Practice is off, roads are gone, and the whole day is yours.',
    options: () => [
      opt('shoot', 'Shovel the court and shoot', (f) => {
        f.energy(-5);
        f.morale(3);
        f.progress('shooting', 0.6);
        return 'You clear the outdoor court by hand and shoot in a puffy coat. Your fingers freeze and your touch gets better.';
      }),
      opt('hang', 'Hang out with friends', (f) => {
        f.morale(4);
        f.energy(4);
        return 'Hot chocolate, a loud board game, and no one has to be anywhere. A good day.';
      }),
      opt('sleep', 'Sleep all day', (f) => {
        f.energy(18);
        return 'You wake up with a crease on your face and the best legs you have had in weeks.';
      }),
    ],
  },
  {
    id: 'media_bait',
    icon: '🎙️',
    title: 'A reporter is fishing',
    tone: 'odd',
    levels: UP,
    weight: 1,
    when: (c) => c.s.player.reputation >= 10,
    text: (c) => `A reporter pulls you aside and asks about ${c.coach ? `Coach ${first(c.coach)}'s rotations` : 'the team’s chemistry'}. "Just between us." The recorder is on.`,
    options: () => [
      opt('deflect', 'Deflect', (f) => {
        f.coach(0, 1);
        return '"Whatever helps us win." The reporter writes it down and looks disappointed.';
      }),
      opt('honest', 'Say what you think', (f) => {
        if (f.rng.chance(0.5)) {
          f.followers(0.06);
          f.rep(1);
          return 'It is refreshing and it goes everywhere. People love a straight answer.';
        }
        f.coach(-3);
        f.rep(-2);
        return 'It gets clipped, taken out of context, and put in a headline. Coach asks to see you.';
      }, { hint: 'Coin flip' }),
      opt('walk', 'Walk away', () => 'You keep walking. The reporter shrugs and finds someone else.'),
    ],
  },
  {
    id: 'viral_fail',
    icon: '🤦',
    title: 'You trip in warmups',
    tone: 'odd',
    levels: ALL,
    weight: 0.8,
    when: (c) => c.s.player.followers >= 150,
    text: () => 'Right in front of the cameras you catch your own foot and go down in warmups. Somebody has already posted it with a laughing emoji.',
    options: () => [
      opt('laugh', 'Laugh along', (f) => {
        f.followers(0.04);
        f.morale(2);
        return 'You post a joke about it. Everybody is on your side, and you are weirdly more popular.';
      }),
      opt('delete', 'Ask for it to come down', (f) => {
        f.morale(-2);
        f.followers(-0.01);
        return 'It is already everywhere. Asking only makes more people share it.';
      }),
    ],
  },
  {
    id: 'team_dinner',
    icon: '🍽️',
    title: 'Dinner with the vets',
    tone: 'money',
    levels: PRO,
    weight: 0.9,
    need: ['teammate'],
    text: (c) => `${first(c.teammate)} takes you and the other young guys to the city's priciest steakhouse. The check arrives, and everyone looks at you. "You are the one with the sneaker deal."`,
    options: (c) => [
      opt('pay', 'Pick up the check', (f) => {
        f.chem(3);
        f.rel(c.teammate, 'affinity', 6);
        f.rep(1);
        f.morale(2);
        return 'You hand over a card and act like it is nothing. It earns more respect than any pass you made this month.';
      }, { cost: c.$(0, 0, 9000) }),
      opt('split', 'Split it', (f) => {
        f.rel(c.teammate, 'affinity', -3);
        f.rel(c.teammate, 'respect', -1);
        return 'Everyone pays for their own. Nobody says anything, but you notice a few raised eyebrows.';
      }),
    ],
  },
];

const BY_ID = Object.fromEntries(DEFS.map((d) => [d.id, d])) as Record<string, Def>;
/** Moments that come when the time is right, in the order a life tends to go. */
const MILESTONES = ['make_official', 'getting_serious', 'proposal', 'wedding', 'baby'];
export const LIFE_EVENT_IDS = DEFS.map((d) => d.id);

/* ───────────────────────── Context ───────────────────────── */

const SCALE: Record<Level, 0 | 1 | 2> = { hs: 0, college: 1, pro: 2 };

function buildCtx(state: GameState, refs: Record<string, string>, seed: number): Ctx {
  const level = state.career.level;
  const rng = new RNG(seed || 1);
  const a = state.athletes[state.player.athleteId];
  const npc = (k: string) => (refs[k] ? state.npcs[refs[k]] : undefined);
  return {
    s: state,
    rng,
    level,
    me: { first: a.firstName, last: a.lastName, ovr: overall(a.ratings), pos: a.position },
    coach: npc('coach'),
    friend: npc('friend'),
    rival: npc('rival'),
    teammate: npc('teammate'),
    family: npc('family'),
    love: npc('love'),
    $: (hs, college, pro) => [hs, college, pro][SCALE[level]],
    pick: (xs) => xs[Math.floor(rng.next() * xs.length)],
  };
}

function gatherRefs(state: GameState): Record<string, string> {
  const live = Object.values(state.npcs).filter((n) => n.active && !n.estranged);
  const refs: Record<string, string> = {};
  const coach = coachOf(state);
  if (coach) refs.coach = coach.id;
  const find = (role: string, extra?: (n: Npc) => boolean) => live.find((n) => n.role === role && (!extra || extra(n)));
  const friend = find('friend');
  if (friend) refs.friend = friend.id;
  const rival = find('rival', (n) => !!n.athleteId && !!state.athletes[n.athleteId]);
  if (rival) refs.rival = rival.id;
  const mate = find('teammate', (n) => !!n.athleteId && state.athletes[n.athleteId]?.teamId === state.career.teamId);
  if (mate) refs.teammate = mate.id;
  const fam = find('family');
  if (fam) refs.family = fam.id;
  const love = find('love_interest');
  if (love) refs.love = love.id;
  return refs;
}

/* ───────────────────────── Rolling ───────────────────────── */

const comebackDue = (state: GameState) => Number(state.story.flags.comeback_due) > 0 && ['regular', 'playoffs', 'preseason'].includes(state.career.phase);

/** Preseason of a season where you have standing in the room and have not been asked yet. */
export function captainVoteDue(state: GameState): boolean {
  const c = state.career;
  if (c.phase !== 'preseason' || state.story.flags.captain_asked === c.season) return false;
  const veteran = c.level === 'pro' ? c.year >= 2 : c.year >= 2;
  return veteran && state.player.reputation >= 8 && !!state.athletes[state.player.athleteId];
}

/** How likely a random moment is this week. Quiet stretches make one more likely. */
export function lifeChance(state: GameState): number {
  const c = state.career;
  if (c.lifeEvent) return 0;
  const base = c.phase === 'offseason' || c.phase === 'preseason' ? 0.55 : c.phase === 'playoffs' ? 0.2 : 0.36;
  return clamp(base + Math.min(0.15, Math.max(0, c.weeksSinceLife - 2) * 0.05), 0, 0.65);
}

/** Called once as each new week begins. Returns true if something happened. */
export function rollLifeEvent(state: GameState, rng: RNG): boolean {
  const c = state.career;
  c.weeksSinceLife++;
  // some moments are not left to chance: a long injury ends, or the captain vote comes round
  let forced = c.lifeEvent ? null : comebackDue(state) ? 'comeback' : captainVoteDue(state) ? 'captain_vote' : null;
  // relationship milestones are not left to the luck of the draw once everything is in place
  if (!forced && !c.lifeEvent && c.weeksSinceLife >= 2 && (c.phase === 'regular' || c.phase === 'preseason' || c.phase === 'offseason')) {
    const refs = gatherRefs(state);
    const probe = buildCtx(state, refs, 1);
    const m = MILESTONES.find((id) => {
      const d = BY_ID[id];
      return d.levels.includes(c.level) && (d.need ?? []).every((r) => refs[r]) && (!d.when || d.when(probe));
    });
    if (m && rng.chance(0.3)) forced = m;
  }
  if (forced) {
    c.lifeEvent = { id: forced, seed: rng.int(1, 2 ** 30), refs: gatherRefs(state) };
    c.weeksSinceLife = 0;
    return true;
  }
  if (c.lifeEvent || c.weeksSinceLife < 2) return false;
  if (c.phase !== 'preseason' && c.phase !== 'regular' && c.phase !== 'playoffs' && c.phase !== 'offseason') return false;
  if (!rng.chance(lifeChance(state))) return false;
  const refs = gatherRefs(state);
  const probe = buildCtx(state, refs, 1);
  const pool = DEFS.filter((d) => d.levels.includes(c.level) && (d.need ?? []).every((r) => refs[r]) && (!d.when || d.when(probe)));
  if (!pool.length) return false;
  const def = rng.weighted(pool, (d) => d.weight * (c.recentLife.includes(d.id) ? 0.05 : 1));
  const used: Record<string, string> = {};
  for (const r of ['coach', 'friend', 'rival', 'teammate', 'family', 'love'] as Role[]) if (refs[r]) used[r] = refs[r];
  c.lifeEvent = { id: def.id, seed: rng.int(1, 2 ** 30), refs: used };
  c.recentLife = [...c.recentLife, def.id].slice(-10);
  c.weeksSinceLife = 0;
  return true;
}

/** What the player sees for the waiting moment. */
export function lifeEventView(state: GameState): LifeEventView | null {
  const p: LifeEventPending | null = state.career.lifeEvent;
  const def = p ? BY_ID[p.id] : undefined;
  if (!p || !def) return null;
  const ctx = buildCtx(state, p.refs, p.seed);
  const text = def.text(ctx);
  const options = def.options(ctx);
  return {
    id: def.id,
    icon: def.icon,
    title: def.title,
    tone: def.tone,
    text,
    options: options.map(({ run: _run, ...o }) => {
      void _run;
      return { ...o, affordable: !o.cost || state.player.money >= o.cost };
    }),
  };
}

/** Make a choice. Returns what happened, or null if the choice is not possible. */
export function resolveLifeEvent(state: GameState, rng: RNG, optionId: string): LifeOutcome | null {
  const p = state.career.lifeEvent;
  const def = p ? BY_ID[p.id] : undefined;
  if (!p || !def) return null;
  const ctx = buildCtx(state, p.refs, p.seed);
  const o = def.options(ctx).find((x) => x.id === optionId);
  if (!o) return null;
  if (o.cost && !spend(state, o.cost)) return null;
  const f = new Fx(state, rng);
  if (o.cost) f.lines.push(`Money −$${o.cost.toLocaleString()}`);
  const text = o.run(f, ctx);
  state.career.lifeEvent = null;
  state.career.weeksSinceLife = 0;
  state.story.log.push({ season: state.career.season, week: state.career.week, phase: state.career.phase, kind: 'life', title: def.title, summary: `${o.label}. ${text}`.slice(0, 280) });
  if (state.story.log.length > 200) state.story.log.splice(0, state.story.log.length - 200);
  return { id: def.id, icon: def.icon, title: def.title, choice: o.label, text, lines: f.lines };
}

/** Test and tooling hook: every event with its options, for a given set of people. */
export function lifeEventDefs() {
  return DEFS;
}
export { buildCtx as lifeContext, gatherRefs as lifeRefs };
