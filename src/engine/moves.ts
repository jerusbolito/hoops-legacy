import type { Athlete, GameState, MoveOffer, Npc } from '../state/schemas';
import { roleLabel, coachOf, coachStanding } from './coach';
import { bumpChemistry, chemistryNewTeam } from './chemistry';
import { addRipple } from './consequences';
import { receive } from './finance';
import { makeNpc } from './generate';
import { teamRoster } from './league';
import { NameBook } from './nameBook';
import { modsOf } from './origin';
import { addNews } from './news';
import { logTransaction } from './news';
import { overall } from './ratings';
import { RNG, clamp } from './rng';
import { promoteTeammate, refreshStoryTitles } from './storyAthletes';

/**
 * Leaving: the transfer portal in high school and college, and trade requests in the pros. The engine decides who wants
 * you, what role you would have there, whether the front office says yes, and what you leave behind.
 */

export type MoveKind = 'transfer' | 'trade';

export const tradeDeadlineWeek = (state: GameState): number => Math.floor(state.league.regularWeeks * 0.65);

export interface MoveStatus {
  kind: MoveKind;
  can: boolean;
  /** Why not, or what to expect. */
  reason: string;
  title: string;
  blurb: string;
}

export function moveStatus(state: GameState): MoveStatus | null {
  const c = state.career;
  if (c.phase === 'recruiting' || c.phase === 'draft' || c.phase === 'free_agency' || c.phase === 'retired') return null;
  const asked = c.moveSeason === c.season;
  if (c.level === 'pro') {
    const base = { kind: 'trade' as const, title: 'Request a trade', blurb: 'Tell the front office you want out. They may say no, and your coach will know you asked.' };
    if (c.pendingMove) return { ...base, can: false, reason: 'Teams are waiting on your answer.' };
    if (asked) return { ...base, can: false, reason: 'You already pushed for a move this season.' };
    if (c.phase === 'playoffs') return { ...base, can: false, reason: 'No trades during the playoffs.' };
    if (c.phase === 'regular' && c.week > tradeDeadlineWeek(state)) return { ...base, can: false, reason: `The trade deadline passed after week ${tradeDeadlineWeek(state)}.` };
    return { ...base, can: true, reason: c.phase === 'regular' ? `Trade deadline: week ${tradeDeadlineWeek(state)}.` : 'The front office is open to talks.' };
  }
  const word = c.level === 'hs' ? 'school' : 'program';
  const base = { kind: 'transfer' as const, title: c.level === 'hs' ? 'Transfer schools' : 'Enter the transfer portal', blurb: `Look for a new ${word}. Your coach and teammates will notice, and a fresh start means earning trust all over again.` };
  if (c.pendingMove) return { ...base, can: false, reason: 'Schools are waiting on your answer.' };
  if (c.phase !== 'offseason') return { ...base, can: false, reason: 'Transfers open once the season is over.' };
  if (c.year >= 4) return { ...base, can: false, reason: c.level === 'hs' ? 'You are a senior. Your next move is college.' : 'You are out of eligibility. Your next move is the draft.' };
  if (c.level === 'college' && state.story.flags.declared_for_draft === true) return { ...base, can: false, reason: 'You declared for the draft.' };
  if (asked) return { ...base, can: false, reason: 'You already looked around this year.' };
  return { ...base, can: true, reason: 'The window is open until you start next season.' };
}

/* ───────────────────────── Who wants you ───────────────────────── */

const weakestNonStar = (state: GameState, t: { rosterIds: string[] }): Athlete | undefined =>
  t.rosterIds
    .map((id) => state.athletes[id])
    .filter((a) => a && !a.persistent && a.id !== state.player.athleteId)
    .sort((a, b) => overall(a.ratings) - overall(b.ratings))[0];

/** Where you would slot on a roster once the weakest regular makes room. */
function projectedRank(state: GameState, teamId: string): number {
  const me = overall(state.athletes[state.player.athleteId].ratings);
  const roster = teamRoster(state, teamId).filter((a) => a.id !== state.player.athleteId);
  const cut = weakestNonStar(state, state.teams[teamId]);
  return 1 + roster.filter((a) => a.id !== cut?.id && overall(a.ratings) > me).length;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** What a college collective would put up to land you. Zero outside college. */
export function nilBonus(state: GameState, prestige: number): number {
  if (state.career.level !== 'college') return 0;
  const p = state.player;
  return Math.max(500, roundTo((1000 + p.reputation * 70 + Math.min(40_000, p.followers * 0.12) + Math.max(0, prestige - 50) * 120) * modsOf(state).nilMul, 100));
}

function pitchFor(state: GameState, prestige: number, rank: number, mine: number): string {
  const level = state.career.level;
  if (rank <= 1) return `They would build the offense around you. You would be their best player.`;
  if (prestige >= mine + 12) return level === 'pro' ? 'A real contender. You would fight for your place, but the stakes are higher.' : 'A bigger stage and tougher competition. You would have to earn your minutes.';
  if (rank <= 3) return 'A featured role from day one on a team that needs scoring.';
  if (rank <= 5) return 'A starting spot is waiting if you can hold it.';
  return 'They like your game, but you would start out in the rotation.';
}

/** Up to three teams that would take you: the biggest step up, the most playing time, and one wildcard. */
export function buildOffers(state: GameState, rng: RNG): MoveOffer[] {
  const c = state.career;
  const mine = state.teams[c.teamId];
  const maxRank = c.level === 'pro' ? 8 : 7;
  const all = state.league.teamIds
    .filter((id) => id !== c.teamId)
    .map((id) => ({ t: state.teams[id], rank: projectedRank(state, id) }));
  const wanted = all.filter((x) => x.rank <= maxRank);
  const pool = wanted.length ? wanted : [...all].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const picked: typeof pool = [];
  const take = (x?: (typeof pool)[number]) => x && !picked.includes(x) && picked.push(x);
  take([...pool].filter((x) => x.t.prestige > mine.prestige).sort((a, b) => b.t.prestige - a.t.prestige)[0] ?? [...pool].sort((a, b) => b.t.prestige - a.t.prestige)[0]);
  take([...pool].filter((x) => !picked.includes(x)).sort((a, b) => a.rank - b.rank || a.t.prestige - b.t.prestige)[0]);
  const rest = pool.filter((x) => !picked.includes(x));
  if (rest.length) take(rng.pick(rest));
  return picked.map(({ t, rank }) => ({
    teamId: t.id,
    name: t.name,
    mascot: t.mascot,
    abbrev: t.abbrev,
    colors: t.colors,
    prestige: t.prestige,
    coachName: t.coachName,
    rank,
    role: roleLabel(rank),
    nil: nilBonus(state, t.prestige),
    pitch: pitchFor(state, t.prestige, rank, mine.prestige),
  }));
}

/* ───────────────────────── Asking ───────────────────────── */

/** How the front office feels about a trade request, 0 to 1. */
export function tradeOdds(state: GameState): number {
  const cs = coachStanding(state);
  const k = state.player.contract;
  let p = 0.4;
  if (cs.rank > 5) p += 0.2;
  else if (cs.rank <= 2) p -= 0.25;
  if (cs.score < -0.2) p += 0.15;
  else if (cs.score > 0.4) p -= 0.1;
  if (state.story.flags.trade_interest === state.career.season) p += 0.2;
  if (k && k.yearsLeft <= 1) p += 0.1;
  return clamp(p, 0.1, 0.9);
}

export const oddsLabel = (p: number): string => (p >= 0.65 ? 'Good' : p >= 0.4 ? 'Fair' : 'Slim');

export interface StartMoveResult {
  ok: boolean;
  message: string;
}

/** Open the portal, or ask for a trade. One try a season. */
export function startMove(state: GameState, rng: RNG): StartMoveResult {
  const st = moveStatus(state);
  if (!st || !st.can) return { ok: false, message: st?.reason ?? 'That is not possible right now.' };
  const c = state.career;
  const coach = coachOf(state);
  const me = state.athletes[state.player.athleteId];
  c.moveSeason = c.season;

  if (st.kind === 'transfer') {
    const offers = buildOffers(state, rng);
    if (coach) coach.relationship.trust = clamp(coach.relationship.trust - 2, 0, 100);
    if (!offers.length) return { ok: false, message: 'Nobody bit. Word got back to your coach that you were shopping around.' };
    c.pendingMove = { kind: 'transfer', offers, headline: c.level === 'hs' ? `${offers.length} schools heard you might be looking.` : `${offers.length} programs reached out the moment you entered the portal.` };
    addNews(state, `${me.lastName} ${c.level === 'hs' ? 'is looking at a transfer' : 'enters the transfer portal'}.`);
    return { ok: true, message: c.pendingMove.headline };
  }

  // a trade request: the front office decides
  const granted = rng.chance(tradeOdds(state));
  if (coach) coach.relationship.respect = clamp(coach.relationship.respect - 1, 0, 100);
  const offers = granted ? buildOffers(state, rng) : [];
  if (!granted || !offers.length) {
    if (coach) coach.relationship.trust = clamp(coach.relationship.trust - 3, 0, 100);
    state.player.morale = clamp(state.player.morale - 5, 0, 100);
    addNews(state, `${state.teams[c.teamId].name} turn down ${me.lastName}'s trade request.`);
    return { ok: false, message: granted ? 'No team wanted to make the deal.' : 'The front office said no. You are staying, and everyone knows you wanted out.' };
  }
  c.pendingMove = { kind: 'trade', offers, headline: `The front office listened. ${offers.length} team${offers.length > 1 ? 's' : ''} will make a deal.` };
  addNews(state, `${me.lastName} has asked for a trade.`);
  return { ok: true, message: c.pendingMove.headline };
}

/** Decide to stay after all. */
export function stayPut(state: GameState) {
  const pm = state.career.pendingMove;
  if (!pm) return;
  const coach = coachOf(state);
  if (coach) coach.relationship.trust = clamp(coach.relationship.trust - (pm.kind === 'trade' ? 2 : 1), 0, 100);
  state.career.pendingMove = null;
  addNews(state, `${state.athletes[state.player.athleteId].lastName} decides to stay with ${state.teams[state.career.teamId].name}.`);
}

/* ───────────────────────── Leaving ───────────────────────── */

export interface MoveResult {
  kind: MoveKind;
  from: string;
  to: string;
  lines: string[];
  headline: string;
  /** The move told as a short scene, when the narrator is on. */
  story?: string;
}

function swapRosters(state: GameState, target: { id: string; rosterIds: string[] }) {
  const c = state.career;
  const old = state.teams[c.teamId];
  const uid = state.player.athleteId;
  old.rosterIds = old.rosterIds.filter((id) => id !== uid);
  const weakest = weakestNonStar(state, target);
  if (weakest) {
    target.rosterIds = target.rosterIds.filter((id) => id !== weakest.id);
    old.rosterIds.push(weakest.id);
    weakest.teamId = old.id;
  }
  target.rosterIds.push(uid);
  state.athletes[uid].teamId = target.id;
  c.teamId = target.id;
}

/**
 * A team's head coach becomes a character in your story. If that person is already in it (a coach you used to play for
 * who has been hired away), they are the same person, back in charge: you keep your history and the reunion is a story.
 */
export function adoptCoach(state: GameState, rng: RNG, name: string, teamName: string, rel: { respect: number; trust: number }): Npc {
  const existing = Object.values(state.npcs).find((n) => n.name === name);
  if (existing) {
    existing.role = 'coach';
    existing.active = true;
    existing.estranged = false;
    existing.title = `Head coach, ${teamName}`;
    existing.memories.push(`Now coaching ${teamName}. You are playing for them again.`);
    if (existing.memories.length > 8) existing.memories.shift();
    return existing;
  }
  const coach = makeNpc(rng, { name, role: 'coach', title: `Head coach, ${teamName}`, season: state.career.season, rel });
  state.npcs[coach.id] = coach;
  return coach;
}

/** Everything that changes when you put on a different uniform. */
export function moveUser(state: GameState, rng: RNG, teamId: string, kind: MoveKind, opts: { nil?: number; forced?: boolean } = {}): MoveResult | null {
  const c = state.career;
  const old = state.teams[c.teamId];
  const target = state.teams[teamId];
  if (!target || target.id === old.id) return null;
  const me = state.athletes[state.player.athleteId];
  const p = state.player;
  const lines: string[] = [];

  const oldCoach = coachOf(state);
  swapRosters(state, target);
  if (c.level === 'college') p.collegeId = target.id;
  if (p.contract) p.contract.teamId = target.id;
  c.plan = null;

  // the coach you leave
  if (oldCoach) {
    oldCoach.role = 'mentor';
    oldCoach.title = `Your former coach at ${old.name}`;
    const hurt = kind === 'transfer' ? 8 : opts.forced ? 0 : 3;
    oldCoach.relationship.trust = clamp(oldCoach.relationship.trust - hurt, 0, 100);
    if (kind === 'transfer') oldCoach.relationship.affinity = clamp(oldCoach.relationship.affinity - 6, -100, 100);
    oldCoach.memories.push(`You left ${old.name} for ${target.name}.`);
  }
  // the coach who takes you in does not know you yet
  const fresh = kind === 'transfer' ? { respect: 35, trust: 30 } : opts.forced ? { respect: 30, trust: 25 } : { respect: 28, trust: 25 };
  adoptCoach(state, rng, target.coachName, target.name, fresh);
  lines.push(`New coach: ${target.coachName}`);

  // teammates you leave behind stop being part of your daily life
  for (const n of Object.values(state.npcs)) {
    if (n.role === 'teammate' && n.active && n.athleteId && state.athletes[n.athleteId]?.teamId !== target.id) {
      n.active = false;
      n.athleteId = undefined;
      n.title = `Former teammate at ${old.name}`;
      n.memories.push(`You left ${old.name}.`);
    }
  }
  // your best friend feels it when you go (but not when the league sends you away)
  let friend: Npc | undefined;
  for (const n of Object.values(state.npcs)) {
    if (n.role === 'friend' && n.active && n.athleteId && state.athletes[n.athleteId]?.teamId === old.id) {
      friend = n;
      if (c.level !== 'pro' && !opts.forced) {
        n.relationship.affinity = clamp(n.relationship.affinity - 6, -100, 100);
        n.relationship.trust = clamp(n.relationship.trust - 4, 0, 100);
        lines.push(`${n.name}: affinity −6, trust −4`);
      }
      n.memories.push(`You left ${old.name} for ${target.name}.`);
    }
  }
  promoteTeammate(state, rng);

  // money, mood and name
  if (opts.nil && opts.nil > 0) {
    receive(state, opts.nil);
    lines.push(`Signing package +$${opts.nil.toLocaleString()}`);
  }
  // someone loyal feels it when they walk away from a team (but not when the league sends them away)
  const morale = (opts.forced ? -4 : kind === 'transfer' ? 4 : 3) + (opts.forced ? 0 : modsOf(state).leaveMorale);
  p.morale = clamp(p.morale + morale, 0, 100);
  lines.push(`Morale ${morale > 0 ? '+' : '−'}${Math.abs(morale)}`);
  if (kind === 'transfer') {
    p.reputation = clamp(p.reputation - 1, 0, 100);
    lines.push('Reputation −1');
  }
  addRipple(state, { text: `You left ${old.name} for ${target.name}. The people you left behind have not forgotten how it went.`, seasons: 1, npcId: (friend ?? oldCoach)?.id });

  c.moveSeason = c.season;
  c.pendingMove = null;
  chemistryNewTeam(state, !!opts.forced);
  const headline =
    kind === 'transfer'
      ? `${me.firstName} ${me.lastName} transfers from ${old.name} to ${target.name}.`
      : opts.forced
        ? `${old.name} trade ${me.lastName} to ${target.name}.`
        : `${old.name} grant ${me.lastName}'s request and trade them to ${target.name}.`;
  logTransaction(state, kind, headline);
  state.story.log.push({ season: c.season, week: c.week, phase: c.phase, kind, title: kind === 'transfer' ? `Transferred to ${target.name}` : `Traded to ${target.name}`, summary: headline.replace(/\.$/, '') + (opts.forced ? ' It was not their choice.' : '.') });
  refreshStoryTitles(state);
  return { kind, from: old.name, to: target.name, lines, headline };
}

/** Pick the team you want from the ones that came calling. */
export function executeMove(state: GameState, rng: RNG, teamId: string): MoveResult | null {
  const pm = state.career.pendingMove;
  const offer = pm?.offers.find((o) => o.teamId === teamId);
  if (!pm || !offer) return null;
  return moveUser(state, rng, teamId, pm.kind, { nil: offer.nil });
}

/** The front office makes the call for you. */
export function forceTrade(state: GameState, rng: RNG): MoveResult | null {
  const offers = buildOffers(state, rng);
  if (!offers.length) return null;
  const pick = rng.pick(offers);
  return moveUser(state, rng, pick.teamId, 'trade', { forced: true });
}

/** The head coach is let go and a new one takes over (the team stays the same). */
export function replaceCoach(state: GameState, rng: RNG): { oldName: string; newName: string } | null {
  const team = state.teams[state.career.teamId];
  const old = coachOf(state);
  if (!old) return null;
  const newName = NameBook.fromState(state).draw(rng, { gender: 'any' }).full;
  const oldName = old.name;
  old.role = 'mentor';
  old.title = `Your former coach at ${team.name}`;
  old.memories.push('Was let go and left the program.');
  team.coachName = newName;
  bumpChemistry(state, -8); // a new coach unsettles the room
  const coach = makeNpc(rng, { name: newName, role: 'coach', title: `Head coach, ${team.name}`, season: state.career.season, rel: { respect: 30, trust: 25 } });
  state.npcs[coach.id] = coach;
  logTransaction(state, 'coach', `${team.name} replace ${oldName} with ${newName} as head coach.`);
  return { oldName, newName };
}
