import { LEVEL_CONFIG, yearLabel } from '../data/teams';
import { nextOpponent, standingsRows, userAthlete, userRole, userTeam } from '../engine/career';
import { ARCHETYPE_INFO, formatHeight, overall } from '../engine/ratings';
import { fmt1, lineSummary, seasonAverages } from '../engine/stats';
import type { GameState, Npc } from '../state/schemas';
import { RATING_KEYS, RATING_LABELS } from '../state/schemas';

export function teamLabel(state: GameState, teamId: string): string {
  const t = state.teams[teamId];
  return t ? `${t.name} ${t.mascot}` : 'Unknown';
}

export function playerBlock(state: GameState): string {
  const a = userAthlete(state);
  const p = state.player;
  const c = state.career;
  const role = userRole(state);
  const lines = [
    `PLAYER (the "you" of the story): ${a.firstName} ${a.lastName}, age ${a.age}, ${a.position} (${ARCHETYPE_INFO[a.archetype].label}), ${formatHeight(a.heightIn)}, from ${p.hometown}.`,
    `${c.level === 'pro' ? '' : `${yearLabel(c.level, c.year)} at `}${teamLabel(state, c.teamId)} (${LEVEL_CONFIG[c.level].label}${c.level === 'pro' ? `, ${yearLabel('pro', c.year)}` : ''}). Role: ${role.label} (#${role.rank} on roster). Overall ${overall(a.ratings)}.`,
    `Ratings: ${RATING_KEYS.map((k) => `${RATING_LABELS[k]} ${a.ratings[k]}`).join(', ')}.`,
    `Status: morale ${p.morale}/100, energy ${p.energy}/100${c.level !== 'pro' ? `, GPA ${p.academics.toFixed(2)}` : ''}, reputation ${p.reputation}/100, ${p.followers.toLocaleString()} followers${p.money ? `, $${p.money.toLocaleString()} in the bank` : ''}${p.contract ? `, contract $${(p.contract.salary / 1e6).toFixed(1)}M/yr (${p.contract.yearsLeft} yrs left)` : ''}.`,
    `Injury: ${p.injury ? `${p.injury.desc} (${p.injury.weeks} wk)` : 'healthy'}. Traits: ${p.traits.join(', ') || 'none'}.`,
  ];
  if (p.awards.length) lines.push(`Awards: ${p.awards.map((x) => `${x.name} (S${x.season})`).join('; ')}.`);
  return lines.join('\n');
}

export function seasonBlock(state: GameState): string {
  const c = state.career;
  const rows = standingsRows(state);
  const mine = rows.find((r) => r.team.id === c.teamId);
  const avg = seasonAverages(state.gameLog, c.season);
  const out: string[] = [];
  const phaseTxt =
    c.phase === 'regular'
      ? `Week ${c.week} of ${state.league.regularWeeks} (regular season)`
      : c.phase === 'playoffs'
        ? 'Playoffs'
        : c.phase === 'preseason'
          ? 'Preseason — first week with the team'
          : c.phase === 'offseason'
            ? 'Offseason / summer'
            : c.phase;
  out.push(`SEASON ${c.season} (${c.calendarYear}-${String((c.calendarYear + 1) % 100).padStart(2, '0')}): ${phaseTxt}.`);
  if (mine && mine.w + mine.l > 0) out.push(`Team record ${mine.w}-${mine.l}, ${ordinal(mine.rank)} of ${rows.length} in the ${state.league.name}.`);
  if (avg.gp > 0) out.push(`Your season averages: ${fmt1(avg.ppg)} ppg, ${fmt1(avg.rpg)} rpg, ${fmt1(avg.apg)} apg in ${fmt1(avg.mpg)} mpg over ${avg.gp} games.`);
  const last = state.gameLog[state.gameLog.length - 1];
  if (last && last.season === c.season) {
    out.push(`Last game: ${last.teamScore > last.oppScore ? 'W' : 'L'} ${last.teamScore}-${last.oppScore} vs ${teamLabel(state, last.oppId)}. You: ${lineSummary(last.line)}.`);
  }
  const next = nextOpponent(state);
  if (next) out.push(`Next game: ${next.home ? 'vs' : 'at'} ${next.opp.name} ${next.opp.mascot}.`);
  if (state.league.champion) out.push(`Champion: ${teamLabel(state, state.league.champion)}.`);
  return out.join('\n');
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function npcLine(state: GameState, n: Npc, detailed: boolean): string {
  const r = n.relationship;
  let s = `- id=${n.id} | ${n.name} | ${n.role} | ${n.title}`;
  if (n.athleteId && state.athletes[n.athleteId]) {
    const a = state.athletes[n.athleteId];
    s += ` | plays ${a.position} for ${a.teamId ? teamLabel(state, a.teamId) : 'nobody'} (OVR ${overall(a.ratings)})`;
  }
  if (!detailed) {
    // one line of history so a character who wasn't cast still has a past
    const best = pinnedMemories(n, 1)[0];
    return best ? `${s} | remembers: ${best.slice(0, 90)}` : s;
  }
  s += `\n    personality: ${n.personality.join(', ')} | affinity ${r.affinity}, respect ${r.respect}, trust ${r.trust}, rivalry ${r.rivalry}${r.romance ? `, romance ${r.romance}` : ''}`;
  const mems = pinnedMemories(n, MEMORY_WINDOWS.pinnedMemories);
  if (mems.length) s += `\n    remembers: ${mems.join(' / ')}`;
  return s;
}

/** Pinned (defining) memories first, then the most recent ones, oldest first, without repeats. */
export function pinnedMemories(n: Npc, max: number): string[] {
  // keep room for at least 2 recent memories when there is space for more than 2
  const key = (n.keyMemories ?? []).slice(-(max > 2 ? max - 2 : max));
  const recent = n.memories.filter((m) => !key.includes(m)).slice(-(max - key.length) || undefined);
  return max - key.length > 0 ? [...key, ...recent] : key;
}

export function castBlock(state: GameState, focusIds: string[]): string {
  // A teammate/friend whose athlete is gone (graduated, left, cut) is not part of the current cast, even in older saves.
  const gone = (n: Npc) => !!n.athleteId && !state.athletes[n.athleteId] && (n.role === 'teammate' || n.role === 'friend');
  const active = Object.values(state.npcs).filter((n) => n.active && !gone(n));
  const former = Object.values(state.npcs).filter((n) => !n.active || gone(n));
  const focus = active.filter((n) => focusIds.includes(n.id));
  const others = active.filter((n) => !focusIds.includes(n.id));
  const parts = ['FEATURED CHARACTERS (use their ids in effects):', ...focus.map((n) => npcLine(state, n, true))];
  if (others.length) parts.push('OTHER KNOWN CHARACTERS (may be mentioned):', ...others.map((n) => npcLine(state, n, false)));
  if (former.length) {
    parts.push(
      'NO LONGER PART OF YOUR DAILY LIFE (graduated, left, or moved on). They are NOT at practice, in the locker room, or on the bench. Mention only as a memory, a text, a call, or a brief cameo that fits their departure:',
      ...former.slice(-8).map((n) => `- ${n.name} | ${n.title}`),
    );
  }
  return parts.join('\n');
}

/** How much history each part of the narrator's context can hold. Exported so the Memory page can show what is forgotten. */
export const MEMORY_WINDOWS = { beats: 8, headlines: 4, seasonsWithCareer: 2, seasonsWithout: 5, pinnedMemories: 5 } as const;

export interface ContextSection {
  id: string;
  label: string;
  text: string;
}

/** The story memory, split into labeled sections (what the AI is actually told). */
export function storySections(state: GameState): ContextSection[] {
  const out: ContextSection[] = [];
  const st = state.story;
  const add = (id: string, label: string, lines: string[]) => lines.length && out.push({ id, label, text: lines.join('\n') });
  if (st.careerSummary) add('career', 'Career so far', ['CAREER SO FAR (the long view; stay consistent with it):', st.careerSummary]);
  // with a rolling career summary, only the two latest seasons need their own detail; without one, show more
  const summaries = st.seasonSummaries.slice(st.careerSummary ? -MEMORY_WINDOWS.seasonsWithCareer : -MEMORY_WINDOWS.seasonsWithout);
  add('seasons', 'Recent seasons', summaries.length ? ['RECENT SEASONS:', ...summaries.map((s) => `- Season ${s.season}: ${s.text}`)] : []);
  add('defining', 'Defining moments', st.defining?.length ? ['DEFINING MOMENTS (permanent history; never contradict, call back when natural):', ...st.defining.map((d) => `- [S${d.season}] ${d.text}`)] : []);
  add('threads', 'Threads to pay off', st.threads?.length ? ['THREADS TO PAY OFF (left hanging by recent scenes; resolve or advance one if it fits):', ...st.threads.map((t) => `- ${t}`)] : []);
  const recent = st.log.slice(-MEMORY_WINDOWS.beats);
  add('beats', 'Recent story beats', recent.length ? ['RECENT STORY BEATS (oldest first):', ...recent.map((e) => `- [S${e.season} W${e.week}] ${e.title}: ${e.summary}`)] : []);
  const arcs = st.arcs.filter((a) => a.status === 'open');
  add('arcs', 'Open storylines', arcs.length ? ['OPEN STORYLINES:', ...arcs.map((a) => `- id=${a.id} "${a.title}": ${a.stakes}`)] : []);
  const flags = Object.entries(st.flags).filter(([k]) => !k.startsWith('declared') && k !== 'retiring');
  add('flags', 'Story flags', flags.length ? [`STORY FLAGS: ${flags.map(([k, v]) => `${k}=${v}`).join(', ')}`] : []);
  const news = state.news.slice(-MEMORY_WINDOWS.headlines);
  add('news', 'Headlines', news.length ? ['RECENT HEADLINES:', ...news.map((n) => `- ${n.text}`)] : []);
  return out;
}

export function storyBlock(state: GameState): string {
  return storySections(state).map((s) => s.text).join('\n') || 'This is the very beginning of the story.';
}

/** Everything the narrator is told, section by section, in prompt order. */
export function contextSections(state: GameState, focusIds: string[]): ContextSection[] {
  const story = storySections(state);
  return [
    { id: 'player', label: 'Player', text: playerBlock(state) },
    { id: 'season', label: 'Season', text: seasonBlock(state) },
    { id: 'cast', label: 'Characters', text: castBlock(state, focusIds) },
    ...(story.length ? story : [{ id: 'start', label: 'Story', text: 'This is the very beginning of the story.' }]),
  ];
}

export function fullContext(state: GameState, focusIds: string[]): string {
  return [playerBlock(state), seasonBlock(state), castBlock(state, focusIds), storyBlock(state)].join('\n\n');
}

export function userTeamName(state: GameState) {
  const t = userTeam(state);
  return `${t.name} ${t.mascot}`;
}
