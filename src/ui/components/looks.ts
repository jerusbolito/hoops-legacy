import type { GameState, Npc } from '../../state/schemas';
import type { Mood } from './Portrait';

/** Jersey colors (if they play for a team) and an expression reflecting how they feel about the player. */
export function npcLook(game: GameState, npc: Npc): { colors?: [string, string]; mood: Mood } {
  const ath = npc.athleteId ? game.athletes[npc.athleteId] : undefined;
  const colors = ath?.teamId ? game.teams[ath.teamId]?.colors : undefined;
  const r = npc.relationship;
  const mood: Mood = r.rivalry >= 55 || r.affinity <= -30 ? 'angry' : r.affinity <= -12 ? 'sad' : r.affinity >= 25 || r.romance >= 25 ? 'happy' : 'neutral';
  return { colors, mood };
}
