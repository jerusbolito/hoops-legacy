import type { Deal, GameState, Offer, Press } from '../state/schemas';
import { coachOf } from './coach';
import { addNews } from './news';
import { overall } from './ratings';
import { RNG, clamp } from './rng';

/**
 * The world outside the gym: what fans and reporters say about you, the brands that want your name, and the
 * questions you have to answer. Everything is built from real numbers: scores, stat lines, your followers.
 */

/* ───────────────────────── Social feed ───────────────────────── */

const MAX_FEED = 80;

export function addPost(state: GameState, rng: RNG, p: { kind: string; author: string; handle: string; text: string; likeScale?: number }) {
  const base = Math.max(8, state.player.followers);
  const likes = Math.round(base * rng.range(0.01, 0.07) * (p.likeScale ?? 1)) + rng.int(0, 12);
  const id = state.feed.length ? state.feed[state.feed.length - 1].id + 1 : 1;
  state.feed.push({ id, season: state.career.season, week: state.career.week, kind: p.kind, author: p.author, handle: p.handle, text: p.text, likes });
  if (state.feed.length > MAX_FEED) state.feed.splice(0, state.feed.length - MAX_FEED);
}

const FAN_NAMES = ['Hoop Junkie', 'Courtside Carla', 'Dre From Section 9', 'The Bench Mob', 'Fastbreak Fred', 'Buckets Daily'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export interface GameFacts {
  won: boolean;
  teamScore: number;
  oppScore: number;
  oppId: string;
  playoff: boolean;
  line: { sec: number; pts: number; fgm: number; fga: number; tpm: number; orb: number; drb: number; ast: number; stl: number; blk: number; tov: number } | null;
  gameScore: number;
  clutchHeroics: boolean;
}

/** A few posts about last night, built only from what really happened. */
export function postGamePosts(state: GameState, rng: RNG, f: GameFacts) {
  const me = state.athletes[state.player.athleteId];
  const opp = state.teams[f.oppId];
  const team = state.teams[state.career.teamId];
  const l = f.line;
  const reb = l ? l.orb + l.drb : 0;
  const fan = () => {
    const name = rng.pick(FAN_NAMES);
    return { author: name, handle: `@${slug(name)}` };
  };
  const media = { author: `${state.league.name} Report`, handle: `@${slug(state.league.name)}report` };
  const verdict = f.won ? 'beat' : 'fell to';
  const score = `${Math.max(f.teamScore, f.oppScore)}-${Math.min(f.teamScore, f.oppScore)}`;

  if (!l || l.sec < 120) {
    if (rng.chance(0.5)) addPost(state, rng, { kind: 'fans', ...fan(), text: `${team.name} ${verdict} ${opp.name}, ${score}. Wish ${me.lastName} was out there.` });
    return;
  }
  if (f.gameScore >= 20 || l.pts >= 28) {
    addPost(state, rng, { kind: 'media', ...media, text: `${me.lastName} finishes with ${l.pts} points, ${reb} rebounds and ${l.ast} assists as ${team.name} ${verdict} ${opp.name}, ${score}.`, likeScale: 1.4 });
    addPost(state, rng, { kind: 'fans', ...fan(), text: `${me.lastName} dropped ${l.pts} on ${opp.name}. Different class tonight. 🔥`, likeScale: 1.6 });
  } else if (f.gameScore <= 2 && l.sec >= 720) {
    addPost(state, rng, { kind: 'haters', ...fan(), text: `${me.lastName}: ${l.pts} points on ${l.fgm}-${l.fga} shooting. Somebody explain the minutes.`, likeScale: 1.1 });
  } else if (rng.chance(0.55)) {
    addPost(state, rng, { kind: 'fans', ...fan(), text: `${team.name} ${verdict} ${opp.name}, ${score}. ${me.lastName} had ${l.pts} points and ${l.ast} assists.` });
  }
  if (f.clutchHeroics) addPost(state, rng, { kind: 'fans', ...fan(), text: `Did you see ${me.lastName} in the clutch?! Ice in the veins. 🧊`, likeScale: 1.8 });
  if (f.playoff && f.won) addPost(state, rng, { kind: 'media', ...media, text: `${team.name} advance. ${me.lastName} played ${Math.round(l.sec / 60)} minutes and scored ${l.pts}.`, likeScale: 1.3 });
  const rival = Object.values(state.npcs).find((n) => n.active && n.role === 'rival' && n.athleteId && state.athletes[n.athleteId]?.teamId === f.oppId);
  if (rival && rival.relationship.rivalry >= 40) {
    const first = rival.name.split(' ')[0];
    addPost(state, rng, { kind: 'rival', author: rival.name, handle: `@${slug(rival.name)}`, text: f.won ? `Good game ${me.lastName}. Enjoy it while it lasts.` : `${me.lastName}? Nobody was worried. Told you, ${first} runs this.`, likeScale: 1.5 });
  }
  const parent = Object.values(state.npcs).find((n) => n.active && n.role === 'family');
  if (parent && (l.pts >= 20 || f.playoff) && rng.chance(0.6)) addPost(state, rng, { kind: 'family', author: parent.name, handle: `@${slug(parent.name)}`, text: `So proud of you. ${l.pts} points! Now eat something. ❤️`, likeScale: 0.6 });
}

/** One-off post for awards, deals and the like. */
export function systemPost(state: GameState, rng: RNG, kind: 'media' | 'brand', text: string, author?: { name: string; handle: string }) {
  const media = { author: `${state.league.name} Report`, handle: `@${slug(state.league.name)}report` };
  addPost(state, rng, { kind, author: author?.name ?? media.author, handle: author?.handle ?? media.handle, text, likeScale: 1.3 });
}

/* ───────────────────────── Endorsements ───────────────────────── */

interface Category {
  id: string;
  label: string;
  brands: string[];
  energy: number;
  sketchy?: boolean;
}

const CATEGORIES: Category[] = [
  { id: 'shoes', label: 'Footwear', brands: ['Stride', 'Apex Footwear', 'Northline', 'Vector Kicks'], energy: 1 },
  { id: 'apparel', label: 'Apparel', brands: ['Threadline', 'Court & Co.', 'Alder Athletics'], energy: 1 },
  { id: 'drinks', label: 'Beverages', brands: ['Hydra', 'Peak Sparkling', 'Zest Zero'], energy: 1 },
  { id: 'tech', label: 'Tech', brands: ['Pulse Audio', 'Nova Mobile', 'Orbit Earbuds'], energy: 0 },
  { id: 'local', label: 'Local business', brands: ["Marty's Auto Group", 'Riverside Dental', "Big Tony's Pizza"], energy: 2 },
  { id: 'gaming', label: 'Gaming', brands: ['Pixel Arena', 'Nexus Gaming'], energy: 0 },
  { id: 'crypto', label: 'Crypto', brands: ['Rocket Coin', 'MoonLedger'], energy: 0, sketchy: true },
  { id: 'supplements', label: 'Supplements', brands: ['Zap Max Energy Shots', 'TitanBurn Pro'], energy: 1, sketchy: true },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])) as Record<string, string>;

/** Players in high school cannot take endorsement money. */
export function dealsAllowed(state: GameState): boolean {
  return state.career.level !== 'hs';
}

const agentOf = (state: GameState) => Object.values(state.npcs).find((n) => n.active && n.role === 'agent') ?? null;
const familyOf = (state: GameState) => Object.values(state.npcs).find((n) => n.active && n.role === 'family') ?? null;

/** What a pro of this rating is worth on the market (same curve as free agency, kept here to avoid a circular import). */
const marketValueFor = (ovr: number) => Math.max(1.1, (Math.max(0, ovr - 62) / 26) ** 2.2 * 45) * 1_000_000;

/** Most deals you can have at once. */
export const MAX_DEALS = 4;

/** Rough yearly worth of your name for one deal. Tied to how good you are, so endorsements never dwarf a salary. */
export function nameValue(state: GameState): number {
  const ovr = overall(state.athletes[state.player.athleteId].ratings);
  const p = state.player;
  if (state.career.level === 'college') return Math.min(150_000, 600 + p.followers * 0.4 + p.reputation * 90 + Math.max(0, ovr - 55) * 250);
  return Math.max(150_000, marketValueFor(ovr) * 0.22 + p.followers * 1.2 + p.reputation * 6_000);
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Weekly chance of a new offer, rising with your profile. */
export function offerChance(state: GameState): number {
  if (!dealsAllowed(state)) return 0;
  if (state.offers.length >= 3 || state.player.deals.length >= MAX_DEALS) return 0;
  const p = state.player;
  return clamp(0.02 + p.reputation / 800 + Math.min(0.06, p.followers / 400_000), 0, 0.14);
}

export function maybeOffer(state: GameState, rng: RNG): Offer | null {
  if (!rng.chance(offerChance(state))) return null;
  const taken = new Set([...state.player.deals.map((d) => d.category), ...state.offers.map((o) => o.category)]);
  const options = CATEGORIES.filter((c) => !taken.has(c.id) && (!c.sketchy || state.player.reputation >= 15));
  if (!options.length) return null;
  const cat = rng.weighted(options, (c) => (c.sketchy ? 0.5 : 1));
  const brand = rng.pick(cat.brands);
  const sketchy = !!cat.sketchy;
  const step = state.career.level === 'college' ? 100 : 50_000;
  // each deal you already have makes the next one worth less: there is only so much attention to sell
  const crowded = 0.8 ** state.player.deals.length;
  const perSeason = Math.max(step, roundTo(nameValue(state) * crowded * rng.range(0.55, 1.2) * (sketchy ? 1.45 : 1), step));
  const years = rng.int(1, 3);
  const agent = state.career.level === 'pro' ? agentOf(state) : null;
  const commission = agent ? 0.1 : 0;
  const adviser = agent ?? familyOf(state);
  const fair = perSeason >= nameValue(state) * 0.9;
  let advice: string;
  if (agent) {
    advice = sketchy ? `${agent.name}: "Take it. Big money, and nobody remembers the brand in two years. I get ten percent either way."` : fair ? `${agent.name}: "Fair money from a solid brand. I would sign." (Takes ${Math.round(commission * 100)}%.)` : `${agent.name}: "You can do better. Let me shop it." (Takes ${Math.round(commission * 100)}% of whatever you sign.)`;
  } else if (adviser) {
    advice = sketchy ? `${adviser.name}: "That is a lot of money for a company I have never heard of. Be careful."` : `${adviser.name}: "${fair ? 'That seems fair. Just do not let it cost you your focus.' : 'Maybe wait for something better.'}"`;
  } else {
    advice = 'No one is advising you on this one.';
  }
  const offer: Offer = {
    id: rng.id('offer'),
    brand,
    category: cat.id,
    perSeason,
    years,
    energy: cat.energy,
    sketchy,
    commission,
    pitch: sketchy ? `${brand} wants a young face with a big following. Their products are new and the claims are bold.` : `${brand} wants you as the face of their ${cat.label.toLowerCase()} line for ${years} season${years > 1 ? 's' : ''}.`,
    advice,
    expiresSeason: state.career.season,
    expiresWeek: state.career.week + 3,
  };
  state.offers.push(offer);
  return offer;
}

export function expireOffers(state: GameState) {
  state.offers = state.offers.filter((o) => o.expiresSeason > state.career.season || (o.expiresSeason === state.career.season && o.expiresWeek >= state.career.week));
}

export function acceptOffer(state: GameState, rng: RNG, id: string): Deal | null {
  const o = state.offers.find((x) => x.id === id);
  if (!o) return null;
  if (state.player.deals.some((d) => d.category === o.category)) return null;
  const deal: Deal = { id: o.id, brand: o.brand, category: o.category, perSeason: o.perSeason, yearsLeft: o.years, energy: o.energy, sketchy: o.sketchy, commission: o.commission, signedSeason: state.career.season };
  state.player.deals.push(deal);
  state.offers = state.offers.filter((x) => x.id !== id);
  const me = state.athletes[state.player.athleteId];
  state.player.followers += Math.round(state.player.followers * (o.sketchy ? 0.02 : 0.04));
  addNews(state, `${me.lastName} signs with ${o.brand}.`);
  systemPost(state, rng, 'brand', `Proud to welcome ${me.firstName} ${me.lastName} to the ${o.brand} family.`, { name: o.brand, handle: `@${slug(o.brand)}` });
  return deal;
}

export function declineOffer(state: GameState, id: string) {
  state.offers = state.offers.filter((x) => x.id !== id);
}

/** Energy appearances cost every week. */
export function weeklyDealEnergy(state: GameState): number {
  return state.player.deals.reduce((a, d) => a + d.energy, 0);
}

export interface Settlement {
  income: number;
  lines: string[];
}

/** Season end: pay out, retire finished deals, and see whether a shady one blew up. */
export function settleDeals(state: GameState, rng: RNG): Settlement {
  const out: Settlement = { income: 0, lines: [] };
  const me = state.athletes[state.player.athleteId];
  const keep: Deal[] = [];
  for (const d of state.player.deals) {
    const pay = Math.round(d.perSeason * (1 - d.commission));
    out.income += pay;
    out.lines.push(`${d.brand}: $${pay.toLocaleString()}`);
    if (d.sketchy && rng.chance(0.35)) {
      state.player.followers = Math.round(state.player.followers * 0.9);
      state.player.reputation = clamp(state.player.reputation - 4, 0, 100);
      addNews(state, `${d.brand} is under fire and ${me.lastName} is caught up in it.`);
      out.lines.push(`${d.brand} blew up: followers −10%, reputation −4`);
      continue; // the brand drops you
    }
    d.yearsLeft--;
    if (d.yearsLeft > 0) keep.push(d);
    else out.lines.push(`${d.brand} deal ended`);
  }
  state.player.deals = keep;
  state.player.money += out.income;
  return out;
}

/* ───────────────────────── Press ───────────────────────── */

export type PressOptionId = 'humble' | 'bold' | 'deflect';

export const PRESS_OPTIONS: { id: PressOptionId; label: string; blurb: string }[] = [
  { id: 'humble', label: 'Credit the team', blurb: 'Safe. Your coach likes it, your rival does not care.' },
  { id: 'bold', label: 'Say what you really think', blurb: 'Big upside with fans. It can also backfire on you.' },
  { id: 'deflect', label: 'Keep it short', blurb: 'Give them nothing. Nothing happens.' },
];

export interface PressFacts {
  line: GameFacts['line'];
  gameScore: number;
  won: boolean;
  playoff: boolean;
  teamScore: number;
  oppScore: number;
  oppId: string;
  roundName?: string;
}

/** Sometimes a reporter wants a word after the game. Rare, and always about something that actually happened. */
export function maybePress(state: GameState, rng: RNG, f: PressFacts): Press | null {
  const c = state.career;
  if (!f.line || f.line.sec < 600 || c.gamesSincePress < 3 || c.press) return null;
  const opp = state.teams[f.oppId];
  const rival = Object.values(state.npcs).find((n) => n.active && n.role === 'rival' && n.relationship.rivalry >= 40 && n.athleteId && state.athletes[n.athleteId]?.teamId === f.oppId);
  const l = f.line;
  let kind: string | null = null;
  let question = '';
  let context = '';
  if (rival) {
    kind = 'rival';
    question = `${rival.name} told reporters you are overrated. What is your response?`;
    context = `${f.won ? 'Win' : 'Loss'} ${f.teamScore}-${f.oppScore} vs ${opp.name}. You had ${l.pts} points.`;
  } else if (f.gameScore >= 24) {
    kind = 'big_game';
    question = `${l.pts} points against ${opp.name}. How does a night like that happen?`;
    context = `${l.pts} pts, ${l.orb + l.drb} reb, ${l.ast} ast, ${f.won ? 'a win' : 'a loss'}, ${f.teamScore}-${f.oppScore}.`;
  } else if (!f.won && f.playoff) {
    kind = 'tough_loss';
    question = `That ${f.teamScore}-${f.oppScore} loss${f.roundName ? ` in the ${f.roundName.toLowerCase()}` : ''} hurts. What went wrong?`;
    context = `Playoff loss to ${opp.name}. You had ${l.pts} points.`;
  } else if (!f.won && f.gameScore <= 1) {
    kind = 'bad_game';
    question = `${l.pts} points on ${l.fgm}-${l.fga} shooting. Is your confidence shaken?`;
    context = `${f.teamScore}-${f.oppScore} loss to ${opp.name}.`;
  }
  if (!kind || !rng.chance(0.6)) return null;
  return { id: rng.id('press'), kind, question, context, rival: kind === 'rival' };
}

const QUOTES: Record<PressOptionId, Record<string, string>> = {
  humble: {
    rival: 'I do not worry about what anyone says. I worry about my team.',
    big_game: 'It was all the guys around me. They got me good looks.',
    tough_loss: 'That one is on all of us. We will learn from it.',
    bad_game: 'I will watch the film and be better.',
  },
  bold: {
    rival: 'He can say whatever he wants. Watch the next one.',
    big_game: 'I told you I was ready. I am just getting started.',
    tough_loss: 'We are better than that and everyone knows it. This is not over.',
    bad_game: 'One bad night does not change who I am. Do not count me out.',
  },
  deflect: {
    rival: 'No comment on that.',
    big_game: 'We got the win. That is what matters.',
    tough_loss: 'Credit to them. On to the next one.',
    bad_game: 'Next question.',
  },
};

export interface PressOutcome {
  quote: string;
  summary: string;
  lines: string[];
}

/** Answer a press question. The bold answer is a real gamble. */
export function answerPress(state: GameState, rng: RNG, id: PressOptionId): PressOutcome | null {
  const press = state.career.press;
  if (!press) return null;
  const p = state.player;
  const me = state.athletes[p.athleteId];
  const coach = coachOf(state);
  const quote = QUOTES[id][press.kind] ?? QUOTES[id].big_game;
  const lines: string[] = [];
  let summary = '';
  const grow = (pct: number) => {
    const n = Math.round(p.followers * pct);
    p.followers += n;
    if (n) lines.push(`Followers ${n > 0 ? '+' : ''}${n.toLocaleString()}`);
  };
  const rep = (n: number) => {
    p.reputation = clamp(p.reputation + n, 0, 100);
    if (n) lines.push(`Reputation ${n > 0 ? '+' : ''}${n}`);
  };
  const rivalNpc = press.rival ? Object.values(state.npcs).find((n) => n.active && n.role === 'rival') : undefined;

  if (id === 'humble') {
    if (coach) {
      coach.relationship.respect = clamp(coach.relationship.respect + 2, 0, 100);
      coach.relationship.trust = clamp(coach.relationship.trust + 1, 0, 100);
      lines.push('Coach: respect +2, trust +1');
    }
    grow(0.01);
    summary = `${me.lastName} stays humble.`;
  } else if (id === 'bold') {
    if (rng.chance(0.65)) {
      grow(0.06);
      rep(1);
      if (rivalNpc) {
        rivalNpc.relationship.rivalry = clamp(rivalNpc.relationship.rivalry + 6, 0, 100);
        lines.push(`${rivalNpc.name}: rivalry +6`);
      }
      summary = `${me.lastName} talks big and the fans love it.`;
    } else {
      rep(-2);
      grow(0.01);
      if (coach) {
        coach.relationship.trust = clamp(coach.relationship.trust - 2, 0, 100);
        lines.push('Coach: trust −2 (that did not go over well)');
      }
      summary = `${me.lastName}'s comments backfire.`;
    }
  } else {
    grow(0.005);
    summary = `${me.lastName} keeps it short.`;
  }
  addNews(state, `${summary} "${quote}"`);
  addPost(state, rng, { kind: 'media', author: `${state.league.name} Report`, handle: `@${slug(state.league.name)}report`, text: `${me.lastName}: "${quote}"`, likeScale: id === 'bold' ? 1.8 : 1 });
  state.career.press = null;
  state.career.gamesSincePress = 0;
  return { quote, summary, lines };
}
