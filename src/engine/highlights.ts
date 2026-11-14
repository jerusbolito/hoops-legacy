import type { PlayEvent, Side } from './gameSim';

export interface Highlight {
  tag: string;
  text: string;
  quarter: number;
  clock: number;
  home: number;
  away: number;
  pts: number;
  event: PlayEvent;
}

const DEFENSE = /swats|SENDS IT BACK|jumps the passing lane|picks off/;

/**
 * Picks the user's best play from a game's play-by-play for the postgame "play
 * of the game" card. Pure: derives point values from the running score.
 */
export function pickHighlight(feed: PlayEvent[], userShort: string, userSide: Side): Highlight | null {
  let prevTotal = 0;
  let best: { score: number; h: Highlight } | null = null;

  for (const e of feed) {
    const total = e.home + e.away;
    const delta = total - prevTotal;
    prevTotal = total;
    if (!e.user) continue;

    const byUser = e.text.startsWith(userShort);
    let base = 0;
    let tag = 'PLAY OF THE GAME';
    let pts = 0;

    if (e.scoring && e.shot?.user && e.side === userSide && delta >= 2) {
      pts = delta;
      base = delta >= 3 ? 4 : 3;
      if (/and one/i.test(e.text)) base += 1.5;
      if (delta >= 3) tag = 'FROM DOWNTOWN';
      if (/throws it down/.test(e.text)) tag = 'THROWN DOWN';
    } else if (e.scoring && !byUser && e.text.includes(`(${userShort} ast)`)) {
      pts = delta;
      base = 2.2;
      tag = 'DIME';
    } else if (!e.scoring && byUser && DEFENSE.test(e.text)) {
      base = 3;
      tag = 'LOCKDOWN';
    } else continue;

    const late = e.quarter >= 4 && e.clock <= 180;
    const close = Math.abs(e.home - e.away) <= 6;
    if (late) base += 2;
    if (late && close) {
      base += 2;
      tag = 'CLUTCH';
    }
    if (e.quarter >= 4) base += 0.5;

    if (!best || base >= best.score) {
      best = { score: base, h: { tag, text: e.text, quarter: e.quarter, clock: e.clock, home: e.home, away: e.away, pts, event: e } };
    }
  }
  return best?.h ?? null;
}

/** Trailing run: consecutive points by one side with no answer, plus a short-term momentum value in -1..1 (home positive). */
export function currentRun(feed: PlayEvent[]): { side: Side | null; pts: number; momentum: number } {
  const scores: { side: Side; pts: number }[] = [];
  let prev = { home: 0, away: 0 };
  for (const e of feed) {
    if (e.scoring) {
      const d = e.side === 'home' ? e.home - prev.home : e.away - prev.away;
      if (d > 0) scores.push({ side: e.side, pts: d });
    }
    prev = { home: e.home, away: e.away };
  }
  if (!scores.length) return { side: null, pts: 0, momentum: 0 };
  const side = scores[scores.length - 1].side;
  let pts = 0;
  for (let i = scores.length - 1; i >= 0 && scores[i].side === side; i--) pts += scores[i].pts;
  const recent = scores.slice(-8);
  const net = recent.reduce((n, s) => n + (s.side === 'home' ? s.pts : -s.pts), 0);
  return { side, pts, momentum: Math.max(-1, Math.min(1, net / 14)) };
}
