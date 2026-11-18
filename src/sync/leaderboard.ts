import type { SupabaseClient } from '@supabase/supabase-js';
import { challengeScore } from '../engine/challenges';
import type { Legend } from '../state/schemas';
import { useAccount } from './account';
import { supabase } from './supabase';

export interface ScoreRow {
  playerName: string;
  score: number;
  tierLabel: string;
  titles: number;
  seasons: number;
  mine: boolean;
}

export type BoardResult = { ok: true; rows: ScoreRow[] } | { ok: false; reason: 'signed_out' | 'not_set_up' | 'error' };

/** Top scores for one challenge. Needs an account; says why when it cannot show anything. */
export async function topScores(challengeId: string, limit = 20, sb: SupabaseClient | null = supabase()): Promise<BoardResult> {
  const user = useAccount.getState().user;
  if (!sb) return { ok: false, reason: 'not_set_up' };
  if (!user) return { ok: false, reason: 'signed_out' };
  const { data, error } = await sb.from('challenge_scores').select('user_id, player_name, score, tier_label, titles, seasons').eq('challenge_id', challengeId).order('score', { ascending: false }).limit(limit);
  if (error) return { ok: false, reason: /does not exist|schema cache/i.test(error.message) ? 'not_set_up' : 'error' };
  return {
    ok: true,
    rows: (data ?? []).map((r) => ({ playerName: r.player_name as string, score: Number(r.score), tierLabel: r.tier_label as string, titles: r.titles as number, seasons: r.seasons as number, mine: r.user_id === user.id })),
  };
}

/** Files a finished challenge run if it beats the player's best there. Quiet when signed out or offline. */
export async function submitChallengeScore(l: Legend, sb: SupabaseClient | null = supabase()): Promise<'submitted' | 'not_better' | 'skipped'> {
  const user = useAccount.getState().user;
  if (!sb || !user || !l.challenge) return 'skipped';
  const score = challengeScore(l);
  try {
    const { data: prev, error: e1 } = await sb.from('challenge_scores').select('score').eq('challenge_id', l.challenge).eq('user_id', user.id).maybeSingle();
    if (e1) return 'skipped';
    if (prev && Number(prev.score) >= score) return 'not_better';
    const { error } = await sb.from('challenge_scores').upsert({ user_id: user.id, challenge_id: l.challenge, player_name: l.name.slice(0, 40), score, tier_label: l.tierLabel, titles: l.titles, seasons: l.seasons, updated_at: new Date().toISOString() });
    return error ? 'skipped' : 'submitted';
  } catch {
    return 'skipped';
  }
}
