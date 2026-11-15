import type { Athlete, GameState, Npc, RecruitTarget, Team } from '../state/schemas';
import { bumpChemistry } from './chemistry';
import { coachOf } from './coach';
import { makeNpc } from './generate';
import { replaceCoach } from './moves';
import { NameBook } from './nameBook';
import { logTransaction } from './news';
import { recruitWinner } from './recruiting';
import { overall } from './ratings';
import { MIN_SALARY, askingPrice, capSpace } from './contracts';
import { RNG, clamp } from './rng';
import { lockedAthleteIds as storyIds, refreshStoryTitles } from './storyAthletes';

/**
 * A league that keeps moving: in high school and college players transfer for minutes or a bigger stage, and in the
 * pros teams trade and sign each other's players. Rivals and friends are part of it. Every move is logged and
 * headlined, and every roster stays whole.
 */

const GRADUATION_AGE = { hs: 18, college: 22, pro: 99 } as const;

export { logTransaction };

const roster = (state: GameState, t: Team): Athlete[] => t.rosterIds.map((id) => state.athletes[id]).filter(Boolean);
const first = (a: Athlete) => `${a.firstName} ${a.lastName}`;

/** Put `a` on `to`, and send `back` the other way so both rosters keep their size. */
function swap(state: GameState, a: Athlete, to: Team, back?: Athlete) {
  const from = state.teams[a.teamId!];
  from.rosterIds = from.rosterIds.filter((id) => id !== a.id);
  to.rosterIds.push(a.id);
  a.teamId = to.id;
  if (back) {
    to.rosterIds = to.rosterIds.filter((id) => id !== back.id);
    from.rosterIds.push(back.id);
    back.teamId = from.id;
  }
}

/** The weakest ordinary player on a team: the one who makes room. */
function makesRoom(state: GameState, t: Team, protectedIds: Set<string>): Athlete | undefined {
  return roster(state, t)
    .filter((a) => !protectedIds.has(a.id) && !a.persistent)
    .sort((a, b) => overall(a.ratings) - overall(b.ratings))[0];
}

function npcOf(state: GameState, athleteId: string): Npc | undefined {
  return Object.values(state.npcs).find((n) => n.active && n.athleteId === athleteId);
}

function remember(n: Npc | undefined, text: string) {
  if (!n) return;
  n.memories.push(text);
  if (n.memories.length > 8) n.memories.shift();
}

/* ───────────────────────── High school and college: the offseason portal ───────────────────────── */

function offseasonTransfers(state: GameState, rng: RNG) {
  resolveRecruits(state, rng);
  const level = state.career.level;
  const teams = state.league.teamIds.map((id) => state.teams[id]);
  const locked = storyIds(state);
  const count = rng.int(2, 4);
  let done = 0;
  for (let tries = 0; tries < 30 && done < count; tries++) {
    const from = rng.pick(teams);
    const r = roster(state, from)
      .filter((a) => !locked.has(a.id) && !a.persistent && a.age < GRADUATION_AGE[level])
      .sort((a, b) => overall(b.ratings) - overall(a.ratings));
    if (r.length < 6) continue;
    // bench players leave for minutes, standouts at weak programs leave for a bigger stage
    const idx = rng.weighted(r.map((_, i) => i), (i) => (i >= 5 ? 1.2 : i <= 1 && from.prestige < 60 ? 0.9 : 0.3));
    const mover = r[idx];
    const star = idx <= 1;
    const dests = teams.filter((t) => t.id !== from.id);
    const dest = rng.weighted(dests, (t) => (star ? 0.4 + Math.max(0, t.prestige - from.prestige) / 15 : 0.6 + Math.max(0, from.prestige - t.prestige) / 25));
    const back = makesRoom(state, dest, locked);
    if (!back) continue;
    swap(state, mover, dest, back);
    done++;
    const why = star ? 'for a bigger stage' : 'looking for more minutes';
    logTransaction(state, 'transfer', `${first(mover)} transfers from ${from.name} to ${dest.name}, ${why}.`);
  }
  storyTransfers(state, rng);
}

/** Your rival and best friend can leave too. A friend stuck on the bench is the likeliest to go. */
function storyTransfers(state: GameState, rng: RNG) {
  const level = state.career.level;
  const teams = state.league.teamIds.map((id) => state.teams[id]);
  const locked = storyIds(state);
  for (const n of Object.values(state.npcs)) {
    if (!n.active || !n.athleteId || (n.role !== 'rival' && n.role !== 'friend')) continue;
    const a = state.athletes[n.athleteId];
    if (!a || !a.teamId || a.age >= GRADUATION_AGE[level] - 1) continue;
    const from = state.teams[a.teamId];
    const rank = [...roster(state, from)].sort((x, y) => overall(y.ratings) - overall(x.ratings)).findIndex((x) => x.id === a.id) + 1;
    let p = 0.06;
    if (n.role === 'friend' && a.teamId === state.career.teamId && rank >= 6) p = 0.45;
    if (n.role === 'rival' && rank >= 4) p = 0.3;
    if (n.role === 'friend' && n.relationship.affinity < -20) p = Math.max(p, 0.3);
    if (!rng.chance(p)) continue;
    const dests = teams.filter((t) => t.id !== from.id && !(n.role === 'rival' && t.id === state.career.teamId));
    const dest = rng.weighted(dests, (t) => 0.5 + (n.role === 'rival' ? Math.max(0, t.prestige - from.prestige) / 12 : 0.5));
    const back = makesRoom(state, dest, locked);
    if (!back) continue;
    swap(state, a, dest, back);
    const wasMine = from.id === state.career.teamId;
    logTransaction(state, 'transfer', `${first(a)} transfers from ${from.name} to ${dest.name}${n.role === 'rival' ? ', and your rivalry just got a new address' : wasMine ? ' after losing playing time' : ''}.`);
    remember(n, `Left ${from.name} for ${dest.name} in season ${state.career.season}.`);
    if (n.role === 'friend' && wasMine) {
      n.relationship.affinity = clamp(n.relationship.affinity - 3, -100, 100);
      remember(n, 'Left your team. It was hard to watch them go.');
    }
    if (n.role === 'rival') n.relationship.rivalry = clamp(n.relationship.rivalry + 4, 0, 100);
  }
}

/* ───────────────────────── Pros: trades and signings ───────────────────────── */

function proTrades(state: GameState, rng: RNG, count: number, kind: 'trade' | 'signing' = 'trade') {
  const teams = state.league.teamIds.map((id) => state.teams[id]);
  // the player and the story's own teammates stay put; a rival or a friend is fair game
  const movable = (a: Athlete) => a.id !== state.player.athleteId && !(npcOf(state, a.id) && !['rival', 'friend'].includes(npcOf(state, a.id)!.role));
  let done = 0;
  for (let tries = 0; tries < 40 && done < count; tries++) {
    const A = rng.pick(teams);
    const B = rng.pick(teams.filter((t) => t.id !== A.id));
    const pa = roster(state, A).filter(movable);
    const pb = roster(state, B).filter(movable);
    if (!pa.length || !pb.length) continue;
    const a = rng.pick(pa);
    if (a.age >= 36) continue;
    // a fair swap: similar quality, and the other team gives up someone who is not their best
    const candidates = pb.filter((b) => Math.abs(overall(b.ratings) - overall(a.ratings)) <= 5);
    const b = candidates.length ? rng.pick(candidates) : undefined;
    if (!b) continue;
    swap(state, a, B, b);
    done++;
    if (kind === 'trade') logTransaction(state, 'trade', `${A.name} trade ${first(a)} to ${B.name} for ${first(b)}.`);
    else logTransaction(state, 'signing', `${first(a)} signs with ${B.name}; ${A.name} add ${first(b)} in the shuffle.`);
    for (const x of [a, b]) {
      const n = npcOf(state, x.id);
      if (n) remember(n, `Moved to ${state.teams[x.teamId!].name} in season ${state.career.season}.`);
    }
  }
}

/* ───────────────────────── Hooks ───────────────────────── */

/** Called once at the turn of each season, before rosters turn over. */
export function leagueOffseasonMoves(state: GameState, rng: RNG) {
  coachCarousel(state, rng);
  if (state.career.level === 'pro') freeAgencyMarket(state, rng);
  else offseasonTransfers(state, rng);
  refreshStoryTitles(state);
}

/** The week the pros trade among themselves: a little way into the season. */
export const tradeWeek = (state: GameState): number => Math.max(2, Math.floor(state.league.regularWeeks * 0.4));

/** Called as the regular season passes `tradeWeek`. Pros only. */
export function leagueInSeasonTrades(state: GameState, rng: RNG) {
  if (state.career.level !== 'pro' || state.career.week !== tradeWeek(state)) return;
  proTrades(state, rng, rng.int(1, 3), 'trade');
  refreshStoryTitles(state);
}

/* ───────────────────────── Free agency ───────────────────────── */

const ROSTER_SIZE_PRO = 12;

/** Players whose deals run out this offseason (everyone but you and the story's teammates). Sets a length the first time. */
function expiring(state: GameState, rng: RNG): Athlete[] {
  const keep = storyIds(state);
  for (const n of Object.values(state.npcs)) if (n.athleteId && (n.role === 'rival' || n.role === 'friend')) keep.delete(n.athleteId);
  const out: Athlete[] = [];
  for (const id of state.league.teamIds) {
    for (const a of roster(state, state.teams[id])) {
      if (a.id === state.player.athleteId) continue;
      a.contractYears ??= rng.int(1, 4);
      a.salary ??= Math.max(MIN_SALARY, Math.round((askingPrice(a) * rng.range(0.85, 1.15)) / 100_000) * 100_000);
      a.contractYears -= 1;
      if (a.contractYears <= 0 && !(keep.has(a.id) && !a.persistent)) out.push(a);
    }
  }
  return out;
}

export { askingPrice };

export interface MarketPlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  ovr: number;
  team: string;
  asking: number;
}

/** Who else is about to hit the market: the best players whose deals are up, for the player's own free agency. */
export function marketPreview(state: GameState, max = 6): MarketPlayer[] {
  const keep = storyIds(state);
  const out: MarketPlayer[] = [];
  for (const id of state.league.teamIds) {
    for (const a of roster(state, state.teams[id])) {
      if (a.id === state.player.athleteId || (keep.has(a.id) && !a.persistent)) continue;
      if ((a.contractYears ?? 2) <= 1) out.push({ id: a.id, name: first(a), position: a.position, age: a.age, ovr: overall(a.ratings), team: state.teams[id].name, asking: askingPrice(a) });
    }
  }
  return out.sort((x, y) => y.ovr - x.ovr).slice(0, max);
}

/**
 * Contracts run out, players hit the market, and teams with open spots sign the best ones. Better teams get first pick
 * more often, and whoever nobody wants quietly leaves the league (except your rival and friend, who always land somewhere).
 */
function freeAgencyMarket(state: GameState, rng: RNG) {
  const all = expiring(state, rng);
  const recruitedBy: Athlete[] = [];
  // players past their years retire instead of hitting the market
  for (const a of all.filter((x) => x.age >= 37 && !npcOf(state, x.id))) {
    const t = state.teams[a.teamId!];
    t.rosterIds = t.rosterIds.filter((id) => id !== a.id);
    delete state.athletes[a.id];
  }
  const pool = all.filter((a) => state.athletes[a.id]);
  const everyone = state.league.teamIds.map((id) => state.teams[id]);
  const ids = new Set(pool.map((a) => a.id));
  const wasOn = new Map<string, Team>();
  for (const a of pool) {
    const t = state.teams[a.teamId!];
    wasOn.set(a.id, t);
    t.rosterIds = t.rosterIds.filter((id) => id !== a.id);
    a.teamId = null;
  }
  // players you have been recruiting decide before the open market does
  resolveProRecruits(state, rng, pool, ids, wasOn, recruitedBy);
  // the teams that came up short go shopping, in a random order each round
  const headlines: { a: Athlete; team: Team; years: number; from: Team }[] = [];
  for (let round = 0; round < 6 && pool.some((a) => ids.has(a.id)); round++) {
    for (const t of rng.shuffle(everyone.filter((x) => x.rosterIds.length < ROSTER_SIZE_PRO))) {
      const left = pool.filter((a) => ids.has(a.id));
      const open = left.sort((a, b) => overall(b.ratings) - overall(a.ratings)).slice(0, 5);
      if (!open.length) break;
      // a team can only sign who it can afford; with no room it takes the cheapest at the minimum
      const room = capSpace(state, t);
      const affordable = open.filter((a) => askingPrice(a) <= room);
      const pick = affordable.length
        ? rng.weighted(affordable, (a) => (overall(a.ratings) / 20) ** 3 * (0.5 + t.prestige / 100) * (wasOn.get(a.id)?.id === t.id ? 1.6 : 1))
        : [...left].sort((a, b) => askingPrice(a) - askingPrice(b))[0];
      pick.salary = affordable.length ? Math.max(MIN_SALARY, Math.round((askingPrice(pick) * rng.range(0.92, 1.08)) / 100_000) * 100_000) : MIN_SALARY;
      ids.delete(pick.id);
      const years = pick.age >= 32 ? rng.int(1, 2) : rng.int(2, 4);
      pick.contractYears = years;
      pick.teamId = t.id;
      t.rosterIds.push(pick.id);
      headlines.push({ a: pick, team: t, years, from: wasOn.get(pick.id)! });
    }
  }
  // anyone left: the story's athletes get a seat somewhere, the rest leave the league
  for (const a of pool.filter((x) => ids.has(x.id))) {
    const n = npcOf(state, a.id);
    const t = n ? [...everyone].filter((x) => x.rosterIds.length < ROSTER_SIZE_PRO + 1).sort((x, y) => x.rosterIds.length - y.rosterIds.length)[0] : undefined;
    if (n && t) {
      a.teamId = t.id;
      a.contractYears = 1;
      a.salary = MIN_SALARY;
      t.rosterIds.push(a.id);
      headlines.push({ a, team: t, years: 1, from: wasOn.get(a.id)! });
    } else if (!n) delete state.athletes[a.id];
  }
  const stars = headlines.sort((x, y) => overall(y.a.ratings) - overall(x.a.ratings));
  const loud = stars.filter((h, i) => i < 4 || npcOf(state, h.a.id));
  for (const h of loud) {
    const moved = h.team.id !== h.from.id;
    logTransaction(state, 'signing', moved ? `${first(h.a)} leaves ${h.from.name} and signs a ${h.years}-year deal with ${h.team.name}.` : `${first(h.a)} re-signs with ${h.team.name} for ${h.years} year${h.years > 1 ? 's' : ''}.`);
    const n = npcOf(state, h.a.id);
    if (n && moved) remember(n, `Signed with ${h.team.name} as a free agent in season ${state.career.season}.`);
  }
}

/* ───────────────────────── Recruiting results ───────────────────────── */

function closeArc(state: GameState, arcId: string | undefined, outcome: string) {
  const arc = arcId ? state.story.arcs.find((x) => x.id === arcId && x.status === 'open') : undefined;
  if (arc) {
    arc.status = 'resolved';
    arc.outcome = outcome.slice(0, 200);
  }
}

function record(state: GameState, t: RecruitTarget, outcome: 'signed' | 'lost' | 'stayed', team: string, text: string) {
  state.recruiting.history.push({ season: state.career.season, name: t.name, outcome, team, text });
  if (state.recruiting.history.length > 12) state.recruiting.history.splice(0, state.recruiting.history.length - 12);
  closeArc(state, t.arcId, text);
  // only the ones you actually worked on are part of your story
  if (t.contacts > 0) state.story.log.push({ season: state.career.season, week: state.career.week, phase: state.career.phase, kind: 'recruiting', title: outcome === 'signed' ? `Landed ${t.name}` : outcome === 'lost' ? `Lost ${t.name}` : `${t.name} stayed`, summary: text });
}

/** The recruit joins your story as a teammate who remembers how you won them over. */
function welcome(state: GameState, rng: RNG, a: Athlete, t: RecruitTarget) {
  const team = state.teams[state.career.teamId];
  const n = makeNpc(rng, {
    name: first(a),
    role: 'teammate',
    title: `Recruit you convinced to join ${team.name}`,
    season: state.career.season,
    athleteId: a.id,
    rel: { affinity: Math.round(10 + t.pull / 6), trust: Math.round(15 + t.pull / 5), respect: 30, rivalry: roleRiskRivalry(state, a) },
    memories: [`You recruited them away from ${t.fromTeam} with ${t.contacts} conversation${t.contacts === 1 ? '' : 's'}.`],
  });
  state.npcs[n.id] = n;
  // a better player at your spot stirs things up; anyone else is a fresh face worth getting excited about
  bumpChemistry(state, roleRiskRivalry(state, a) > 0 ? -3 : 2);
}

/** A recruit who is better than you at your own spot is a friendly competitor. */
function roleRiskRivalry(state: GameState, a: Athlete): number {
  const me = state.athletes[state.player.athleteId];
  return a.position === me.position && overall(a.ratings) > overall(me.ratings) ? 18 : 0;
}

/** HS and college: at the turn of the season each target decides. */
function resolveRecruits(state: GameState, rng: RNG) {
  const locked = storyIds(state);
  const mine = state.teams[state.career.teamId];
  for (const t of state.recruiting.targets) {
    const a = state.athletes[t.athleteId];
    if (!a || !a.teamId) continue;
    const w = recruitWinner(state, rng, t);
    if (w === 'user') {
      const back = makesRoom(state, mine, locked);
      if (back && a.teamId !== mine.id) {
        const from = state.teams[a.teamId];
        swap(state, a, mine, back);
        welcome(state, rng, a, t);
        const text = `${first(a)} turns down ${t.rivals.length ? 'other offers' : 'a bigger role'} and transfers from ${from.name} to ${mine.name}. You made the difference.`;
        logTransaction(state, 'recruit', text);
        record(state, t, 'signed', mine.name, text);
        continue;
      }
    } else if (w !== 'stay') {
      const to = state.teams[w];
      const back = makesRoom(state, to, locked);
      if (back) {
        const from = state.teams[a.teamId];
        swap(state, a, to, back);
        const text = `${first(a)} picks ${to.name} over ${mine.name}${t.contacts ? '. You will have to beat them next time' : ''}.`;
        logTransaction(state, 'recruit', `${first(a)} transfers from ${from.name} to ${to.name}${t.contacts ? ` after a recruiting battle with ${mine.name}` : ''}.`);
        record(state, t, 'lost', to.name, text);
        continue;
      }
    }
    record(state, t, 'stayed', state.teams[a.teamId].name, `${first(a)} stays at ${state.teams[a.teamId].name}.`);
  }
  state.recruiting.targets = [];
}

/** Pros: a target whose deal is up chooses among you, a rival team and re-signing. */
function resolveProRecruits(state: GameState, rng: RNG, pool: Athlete[], ids: Set<string>, wasOn: Map<string, Team>, signedByUs: Athlete[]) {
  const locked = storyIds(state);
  const mine = state.teams[state.career.teamId];
  const sign = (a: Athlete, team: Team) => {
    if (team.rosterIds.length >= ROSTER_SIZE_PRO) {
      const cut = makesRoom(state, team, locked);
      if (cut) {
        team.rosterIds = team.rosterIds.filter((id) => id !== cut.id);
        cut.teamId = null;
        wasOn.set(cut.id, team);
        pool.push(cut);
        ids.add(cut.id);
      }
    }
    ids.delete(a.id);
    a.salary = askingPrice(a);
    a.contractYears = a.age >= 32 ? rng.int(1, 2) : rng.int(2, 4);
    a.teamId = team.id;
    team.rosterIds.push(a.id);
  };
  for (const t of state.recruiting.targets) {
    const a = state.athletes[t.athleteId];
    if (!a || !ids.has(a.id)) {
      if (a) record(state, t, 'stayed', a.teamId ? state.teams[a.teamId].name : '', `${first(a)} never reached the market.`);
      continue;
    }
    const w = recruitWinner(state, rng, t, true);
    const from = wasOn.get(a.id)!;
    if (w === 'user') {
      sign(a, mine);
      signedByUs.push(a);
      welcome(state, rng, a, t);
      const text = `${first(a)} hits free agency and signs with ${mine.name}. The calls and the visits worked.`;
      logTransaction(state, 'recruit', text);
      record(state, t, 'signed', mine.name, text);
    } else if (w === 'stay') {
      sign(a, from);
      record(state, t, 'stayed', from.name, `${first(a)} re-signs with ${from.name}.`);
    } else {
      const to = state.teams[w];
      sign(a, to);
      const text = `${first(a)} signs with ${to.name} instead of ${mine.name}.`;
      logTransaction(state, 'recruit', `${first(a)} leaves ${from.name} and signs with ${to.name} after a recruiting battle with ${mine.name}.`);
      record(state, t, 'lost', to.name, text);
    }
  }
  state.recruiting.targets = [];
}

/* ───────────────────────── Coach carousel ───────────────────────── */

/**
 * Losing programs fire their coaches. Fired coaches often get hired somewhere else, which can put a coach you used to
 * play for on the other bench. If it is your own coach who goes, a new one takes over and trust starts over.
 */
function coachCarousel(state: GameState, rng: RNG) {
  const fired: { team: Team; name: string }[] = [];
  for (const id of state.league.teamIds) {
    const t = state.teams[id];
    const s = state.league.standings[id];
    if (!s || s.w + s.l < 4) continue;
    const pct = s.w / (s.w + s.l);
    const p = (pct < 0.3 ? 0.4 : pct < 0.45 ? 0.15 : 0.03) * (t.prestige >= 75 ? 0.6 : 1);
    if (fired.length < 3 && rng.chance(p)) fired.push({ team: t, name: t.coachName });
  }
  const available = fired.map((f) => f.name);
  const names = NameBook.fromState(state);
  for (const f of fired) {
    const mine = f.team.id === state.career.teamId;
    // someone else's cast-off, or a fresh face
    // a character in your story is one person: your own team never "rehires" a name that is already someone in it
    const pool = available.filter((n) => n !== f.name && !(mine && Object.values(state.npcs).some((x) => x.name === n)));
    const rehire = pool.length > 0 && rng.chance(0.55);
    const hire = rehire ? rng.pick(pool) : names.draw(rng, { gender: 'any' }).full;
    if (rehire) available.splice(available.indexOf(hire), 1);
    if (mine && coachOf(state)) {
      replaceCoach(state, rng);
      // replaceCoach picks its own name; keep the one this carousel chose
      const c = coachOf(state);
      if (c) {
        c.name = hire;
        c.title = `Head coach, ${f.team.name}`;
        state.teams[f.team.id].coachName = hire;
      }
    } else {
      f.team.coachName = hire;
    }
    logTransaction(state, 'coach', `${f.team.name} fire ${f.name}${rehire ? `; ${hire}, let go elsewhere, takes over` : ` and hire ${hire}`}.`);
  }
  // a coach you played for who lands a new job is a story: they show up on the other bench
  const landed = new Map(state.league.teamIds.map((id) => [state.teams[id].coachName, state.teams[id].name]));
  for (const n of Object.values(state.npcs)) {
    if (n.role === 'mentor' && n.active && landed.has(n.name) && state.teams[state.career.teamId].coachName !== n.name) {
      n.title = `Your former coach, now head coach at ${landed.get(n.name)}`;
      n.memories.push(`Landed the head coaching job at ${landed.get(n.name)}.`);
    }
  }
}
