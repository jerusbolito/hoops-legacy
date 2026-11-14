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
  if (!detailed) return s;
  s += `\n    personality: ${n.personality.join(', ')} | affinity ${r.affinity}, respect ${r.respect}, trust ${r.trust}, rivalry ${r.rivalry}${r.romance ? `, romance ${r.romance}` : ''}`;
  if (n.memories.length) s += `\n    remembers: ${n.memories.slice(-4).join(' / ')}`;
  return s;
}

export function castBlock(state: GameState, focusIds: string[]): string {
  const active = Object.values(state.npcs).filter((n) => n.active);
  const focus = active.filter((n) => focusIds.includes(n.id));
  const others = active.filter((n) => !focusIds.includes(n.id));
  const parts = ['FEATURED CHARACTERS (use their ids in effects):', ...focus.map((n) => npcLine(state, n, true))];
  if (others.length) parts.push('OTHER KNOWN CHARACTERS (may be mentioned):', ...others.map((n) => npcLine(state, n, false)));
  return parts.join('\n');
}

export function storyBlock(state: GameState): string {
  const parts: string[] = [];
  const summaries = state.story.seasonSummaries.slice(-3);
  if (summaries.length) parts.push('PAST SEASONS:', ...summaries.map((s) => `- Season ${s.season}: ${s.text}`));
  const recent = state.story.log.slice(-8);
  if (recent.length) parts.push('RECENT STORY BEATS (oldest first):', ...recent.map((e) => `- [S${e.season} W${e.week}] ${e.title}: ${e.summary}`));
  const arcs = state.story.arcs.filter((a) => a.status === 'open');
  if (arcs.length) parts.push('OPEN STORYLINES:', ...arcs.map((a) => `- id=${a.id} "${a.title}": ${a.stakes}`));
  const flags = Object.entries(state.story.flags).filter(([k]) => !k.startsWith('declared') && k !== 'retiring');
  if (flags.length) parts.push(`STORY FLAGS: ${flags.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  const news = state.news.slice(-4);
  if (news.length) parts.push('RECENT HEADLINES:', ...news.map((n) => `- ${n.text}`));
  return parts.join('\n') || 'This is the very beginning of the story.';
}

export function fullContext(state: GameState, focusIds: string[]): string {
  return [playerBlock(state), seasonBlock(state), castBlock(state, focusIds), storyBlock(state)].join('\n\n');
}

export function userTeamName(state: GameState) {
  const t = userTeam(state);
  return `${t.name} ${t.mascot}`;
}
