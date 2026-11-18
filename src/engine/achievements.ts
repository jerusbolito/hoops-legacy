import type { Legend } from '../state/schemas';

/**
 * Account-wide achievements. They are worked out from the Hall of Fame, which already follows the account
 * between devices, so nothing new is stored or synced and old careers count the moment they are filed.
 */

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  /** Progress toward it across every career: have / need. */
  progress: (l: Legend[]) => { have: number; need: number };
}

const best = (l: Legend[], f: (x: Legend) => number) => l.reduce((m, x) => Math.max(m, f(x)), 0);
const one = (ok: boolean) => ({ have: ok ? 1 : 0, need: 1 });
const atLeast = (have: number, need: number) => ({ have: Math.min(have, need), need });

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_legend', name: 'First Chapter', icon: '📖', blurb: 'Finish a career and enter the Hall of Fame.', progress: (l) => atLeast(l.length, 1) },
  { id: 'collector', name: 'Collector', icon: '🗂️', blurb: 'Finish ten careers.', progress: (l) => atLeast(l.length, 10) },
  { id: 'ring', name: 'Ring Chaser', icon: '💍', blurb: 'Win 3 titles in one career.', progress: (l) => atLeast(best(l, (x) => x.titles), 3) },
  { id: 'dynasty', name: 'Dynasty', icon: '🏆', blurb: 'Win 7 titles in one career.', progress: (l) => atLeast(best(l, (x) => x.titles), 7) },
  { id: 'mvp', name: 'Most Valuable', icon: '🥇', blurb: 'Win an MVP.', progress: (l) => atLeast(best(l, (x) => x.mvps), 1) },
  { id: 'mvp3', name: 'Three-Peat', icon: '👑', blurb: 'Win 3 MVPs in one career.', progress: (l) => atLeast(best(l, (x) => x.mvps), 3) },
  { id: 'all_star', name: 'Fan Vote', icon: '⭐', blurb: 'Make 10 All-Star games in one career.', progress: (l) => atLeast(best(l, (x) => x.allStars), 10) },
  { id: 'fan_favorite', name: 'Fan Favorite', icon: '📣', blurb: 'Finish a career as a Fan Favorite or better.', progress: (l) => one(l.some((x) => x.tier >= 2)) },
  { id: 'hof', name: 'Hall of Famer', icon: '🏛️', blurb: 'Finish a career as a Hall of Famer.', progress: (l) => one(l.some((x) => x.tier >= 4)) },
  { id: 'immortal', name: 'Immortal', icon: '🌟', blurb: 'Finish a career as an Immortal.', progress: (l) => one(l.some((x) => x.tier >= 5)) },
  { id: 'scorer', name: 'Bucket Getter', icon: '🔥', blurb: 'Average 25 points a game over a whole career.', progress: (l) => atLeast(Math.floor(best(l, (x) => x.ppg)), 25) },
  { id: 'first_pick', name: 'Number One', icon: '1️⃣', blurb: 'Go first overall in the draft.', progress: (l) => one(l.some((x) => x.draftPick === 1)) },
  { id: 'undrafted', name: 'Nobody Believed', icon: '🚪', blurb: 'Go undrafted, then become an All-Time Great or better.', progress: (l) => one(l.some((x) => x.draftPick == null && x.tier >= 3)) },
  { id: 'rich', name: 'Generational Wealth', icon: '💰', blurb: 'Earn $500M in one career.', progress: (l) => atLeast(Math.floor(best(l, (x) => x.earnings) / 1e6), 500) },
  { id: 'iron', name: 'Iron Man', icon: '🦾', blurb: 'Play 18 seasons in one career.', progress: (l) => atLeast(best(l, (x) => x.seasons), 18) },
  { id: 'journeyman', name: 'Journeyman', icon: '🧳', blurb: 'Play for 6 pro teams in one career.', progress: (l) => atLeast(best(l, (x) => x.teams.length), 6) },
  { id: 'family', name: 'Family Man', icon: '👨‍👩‍👧‍👦', blurb: 'Marry and raise 3 kids in one career.', progress: (l) => atLeast(Math.max(0, ...l.filter((x) => x.married).map((x) => x.kids)), 3) },
  { id: 'heir', name: 'Passing the Torch', icon: '🔥', blurb: 'Continue a legacy as a second generation.', progress: (l) => one(l.some((x) => x.generation >= 2)) },
  { id: 'line', name: 'A Whole Line', icon: '🌳', blurb: 'Reach the third generation of one family.', progress: (l) => one(l.some((x) => x.generation >= 3)) },
  { id: 'goals', name: 'Everything on the List', icon: '✅', blurb: 'Reach every goal in a career.', progress: (l) => one(l.some((x) => x.goalsTotal > 0 && x.goalsDone >= x.goalsTotal)) },
  { id: 'range', name: 'Full Range', icon: '🎚️', blurb: 'File careers in three different tiers.', progress: (l) => atLeast(new Set(l.map((x) => x.tier)).size, 3) },
  { id: 'badges', name: 'Decked Out', icon: '🎖️', blurb: 'Earn 8 badges in one career.', progress: (l) => atLeast(best(l, (x) => x.badges), 8) },
];

export interface AchievementStatus extends Achievement {
  have: number;
  need: number;
  done: boolean;
}

export function achievementStatus(legends: Legend[]): AchievementStatus[] {
  return ACHIEVEMENTS.map((a) => {
    const { have, need } = a.progress(legends);
    return { ...a, have, need, done: have >= need };
  });
}
