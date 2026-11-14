import type { PlayEvent } from './gameSim';

export interface Callout {
  text: string;
  tone: 'gold' | 'good' | 'bad';
}

/**
 * Big on-screen label for a play the user was clearly part of, or null for routine plays.
 * Only matches text the simulator writes for the user so it never celebrates the wrong player.
 */
export function calloutFor(e: PlayEvent): Callout | null {
  if (!e.user) return null;
  if (/jumps the passing lane — steal!/.test(e.text)) return { text: 'STEAL!', tone: 'good' };
  if (/SENDS IT BACK/.test(e.text)) return { text: 'REJECTED!', tone: 'good' };
  if (e.shot?.user && e.shot.made) {
    if (/and one/i.test(e.text)) return { text: 'AND ONE!', tone: 'gold' };
    if (/throws it down/.test(e.text)) return { text: 'THROWN DOWN!', tone: 'gold' };
    if (/drills a three/.test(e.text)) return { text: 'FROM DEEP!', tone: 'gold' };
  }
  return null;
}

export interface LineScore {
  /** Quarter labels, e.g. 1, 2, 3, 4, 5 (5 = OT1). */
  quarters: number[];
  home: number[];
  away: number[];
}

/** Points per quarter for each side, from the running score in the play-by-play. */
export function lineScore(feed: PlayEvent[]): LineScore {
  const home = new Map<number, number>();
  const away = new Map<number, number>();
  let ph = 0;
  let pa = 0;
  for (const e of feed) {
    const dh = e.home - ph;
    const da = e.away - pa;
    if (dh > 0) home.set(e.quarter, (home.get(e.quarter) ?? 0) + dh);
    if (da > 0) away.set(e.quarter, (away.get(e.quarter) ?? 0) + da);
    ph = e.home;
    pa = e.away;
  }
  const quarters = [...new Set(feed.map((e) => e.quarter))].sort((a, b) => a - b);
  return { quarters, home: quarters.map((q) => home.get(q) ?? 0), away: quarters.map((q) => away.get(q) ?? 0) };
}

export type Streak = 'hot' | 'cold' | null;

/** The user's shooting touch right now: "hot" after three makes in a row, "cold" after four misses in a row. */
export function userStreak(feed: PlayEvent[]): Streak {
  const mine = feed.filter((e) => e.shot?.user).map((e) => e.shot!.made);
  const last3 = mine.slice(-3);
  const last4 = mine.slice(-4);
  if (last3.length === 3 && last3.every(Boolean)) return 'hot';
  if (last4.length === 4 && last4.every((m) => !m)) return 'cold';
  return null;
}
