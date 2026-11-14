import { nextOpponent } from '../engine/career';
import { RNG } from '../engine/rng';
import type { GameState, Level, Npc, NpcRole } from '../state/schemas';

export interface ScenePlan {
  kind: string;
  /** Short brief for the LLM about what this scene is. */
  brief: string;
  castIds: string[];
}

interface SceneDef {
  kind: string;
  brief: string;
  roles: NpcRole[];
  levels: Level[];
  weight: number;
  when?: (s: GameState) => boolean;
}

const ALL: Level[] = ['hs', 'college', 'pro'];

const POOL: SceneDef[] = [
  { kind: 'practice', brief: 'A tense or revealing moment at practice. Minutes, roles and respect are on the line.', roles: ['coach', 'teammate'], levels: ALL, weight: 3 },
  { kind: 'locker_room', brief: 'Locker room talk — team chemistry, gossip, or a conflict brewing.', roles: ['teammate', 'friend'], levels: ALL, weight: 2 },
  { kind: 'school', brief: 'A school-day scene: class, hallway, cafeteria. Life beyond basketball.', roles: ['love_interest', 'friend'], levels: ['hs'], weight: 2 },
  { kind: 'family', brief: 'Time at home with family. Pressure, support, or money worries.', roles: ['family'], levels: ALL, weight: 1.5 },
  { kind: 'social', brief: 'A weekend hangout, party, or night out. Temptation and loyalty.', roles: ['friend', 'love_interest'], levels: ['hs', 'college'], weight: 1.5 },
  { kind: 'rival_encounter', brief: 'You run into your rival away from the game — open gym, social media beef, or a chance meeting.', roles: ['rival'], levels: ALL, weight: 1.2 },
  { kind: 'campus', brief: 'Campus life: classes, eligibility, dorm drama, the weight of being a known athlete.', roles: ['friend', 'love_interest', 'teammate'], levels: ['college'], weight: 2 },
  { kind: 'nil_deal', brief: 'A name-image-likeness opportunity appears. Is it legit? What does it cost you?', roles: ['media', 'family'], levels: ['college'], weight: 1 },
  { kind: 'media', brief: 'An interview or press moment where what you say will be quoted.', roles: ['media', 'coach'], levels: ['college', 'pro'], weight: 1.2 },
  { kind: 'agent_meeting', brief: 'Your agent brings you news: endorsements, contract talk, or a warning.', roles: ['agent'], levels: ['pro'], weight: 1.2 },
  { kind: 'team_drama', brief: 'A veteran or teammate creates drama — touches, leadership, or a leaked quote.', roles: ['teammate', 'coach'], levels: ['pro'], weight: 1.5 },
  { kind: 'city_life', brief: 'Life as a pro in the city: fame, fans, a charity event, or something going wrong.', roles: ['friend', 'love_interest', 'family'], levels: ['pro'], weight: 1.2 },
  { kind: 'mentor', brief: 'Advice from an old coach or mentor at a crossroads.', roles: ['mentor'], levels: ['college', 'pro'], weight: 0.8 },
  { kind: 'scout_visit', brief: 'A college recruiter watches you, calls, or makes a pitch.', roles: ['scout'], levels: ['hs'], weight: 1.4, when: (s) => s.career.year >= 3 },
  { kind: 'date', brief: 'A date or a meaningful moment with someone you are getting close to.', roles: ['love_interest'], levels: ALL, weight: 1.2, when: (s) => Object.values(s.npcs).some((n) => n.role === 'love_interest' && n.active && n.relationship.romance >= 15) },
];

function npcsWithRole(state: GameState, role: NpcRole): Npc[] {
  return Object.values(state.npcs).filter((n) => n.active && n.role === role);
}

function castFor(state: GameState, rng: RNG, roles: NpcRole[]): string[] {
  const ids: string[] = [];
  for (const role of roles) {
    const opts = npcsWithRole(state, role).filter((n) => !ids.includes(n.id));
    if (opts.length) ids.push(rng.pick(opts).id);
  }
  return ids;
}

/** Engine-side scene choice: deterministic given the RNG, driven by calendar and relationships. */
export function pickScene(state: GameState, rng: RNG): ScenePlan {
  const c = state.career;
  const lastKinds = state.story.log.slice(-3).map((e) => e.kind);

  if (c.phase === 'preseason') {
    const brief =
      c.season === 1
        ? 'Opening scene of the whole story: your first day at high school tryouts/practice. Introduce your best friend, the coach, and the senior who plays your position. Mention the cross-town rival.'
        : c.year === 1
          ? `First day at a new level (${c.level === 'college' ? 'college' : 'the pros'}). Meet the coach and the team leader. Establish the new stakes.`
          : 'First practice of a new season. Expectations have changed since last year. Last year\'s departed teammates (see NO LONGER PART OF YOUR DAILY LIFE) are gone and the roster has new faces; acknowledge the empty spot they left rather than pretending they are still here.';
    return { kind: 'season_opener', brief, castIds: castFor(state, rng, c.season === 1 ? ['coach', 'friend', 'teammate'] : ['coach', 'teammate', 'friend']) };
  }

  if (c.phase === 'offseason') {
    const kind = rng.pick(['summer_workouts', 'aau_tournament', 'summer_break']);
    const brief =
      kind === 'aau_tournament' && c.level === 'hs'
        ? 'A summer AAU/showcase tournament with scouts in the stands. Your rival is there too.'
        : kind === 'summer_workouts'
          ? 'Summer workouts: who you train with and what you sacrifice to get better.'
          : 'Summer break: family, friends, relationships, and reflection on the season that just ended.';
    return { kind, brief, castIds: castFor(state, rng, kind === 'aau_tournament' ? ['rival', 'friend'] : ['friend', 'family', 'love_interest']) };
  }

  if (state.player.injury) {
    return { kind: 'injury', brief: `You are injured (${state.player.injury.desc}) and sitting out. Frustration, rehab, and who shows up for you.`, castIds: castFor(state, rng, ['family', 'friend', 'coach']) };
  }

  // Rival on next opponent → rivalry week
  const next = nextOpponent(state);
  const rival = next ? Object.values(state.npcs).find((n) => n.active && n.role === 'rival' && n.athleteId && state.athletes[n.athleteId]?.teamId === next.opp.id) : undefined;
  if (rival && !lastKinds.includes('rivalry_week') && rng.chance(0.85)) {
    return {
      kind: 'rivalry_week',
      brief: `Rivalry week: you face ${rival.name} and ${next!.opp.name} this week. Trash talk, hype, nerves.`,
      castIds: [rival.id, ...castFor(state, rng, ['friend', 'coach'])],
    };
  }

  if (state.player.morale < 30 && !lastKinds.includes('low_point')) {
    return { kind: 'low_point', brief: 'You are in a slump and your confidence is low. Someone reaches out — or doesn’t.', castIds: castFor(state, rng, ['family', 'friend', 'mentor']) };
  }

  if (c.phase === 'playoffs') {
    return { kind: 'playoff_pressure', brief: 'Playoff week. Win or go home. The pressure and the spotlight are bigger than ever.', castIds: castFor(state, rng, ['coach', 'friend', 'teammate']) };
  }

  const candidates = POOL.filter(
    (d) => d.levels.includes(c.level) && (!d.when || d.when(state)) && d.roles.some((r) => npcsWithRole(state, r).length > 0),
  );
  const def = rng.weighted(candidates, (d) => d.weight * (lastKinds.includes(d.kind) ? 0.15 : 1));
  return { kind: def.kind, brief: def.brief, castIds: castFor(state, rng, def.roles) };
}
