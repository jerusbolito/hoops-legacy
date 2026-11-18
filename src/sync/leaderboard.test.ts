import { beforeEach, describe, expect, it } from 'vitest';
import { LegendSchema } from '../state/schemas';
import { useAccount } from './account';
import { submitChallengeScore, topScores } from './leaderboard';

const legend = (o: Record<string, unknown> = {}) => LegendSchema.parse({ id: 'a:1', saveId: 'a', name: 'Jay Walker', firstName: 'Jay', lastName: 'Walker', challenge: 'weekly-2026-47', score: 88.46, tier: 3, tierLabel: 'All-Time Great', titles: 2, seasons: 12, ...o });

/** A tiny stand-in for the Supabase client, holding one table. */
function fakeSb(rows: Record<string, unknown>[] = [], err: string | null = null) {
  const calls: { upsert?: Record<string, unknown> } = {};
  const q = (data: () => unknown) => {
    const b: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'order', 'limit']) b[k] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(err ? { data: null, error: { message: err } } : { data: data(), error: null }).then(res);
    return b;
  };
  return { calls, sb: { from: () => ({ ...q(() => rows), upsert: (v: Record<string, unknown>) => ((calls.upsert = v), Promise.resolve({ error: null })) }) } as never };
}

beforeEach(() => useAccount.setState({ user: null }));

describe('challenge leaderboard', () => {
  it('says why it cannot show a board', async () => {
    expect(await topScores('x', 10, null)).toEqual({ ok: false, reason: 'not_set_up' });
    expect(await topScores('x', 10, fakeSb().sb)).toEqual({ ok: false, reason: 'signed_out' });
    useAccount.setState({ user: { id: 'u1', email: 'e' } });
    expect(await topScores('x', 10, fakeSb([], 'relation "challenge_scores" does not exist').sb)).toEqual({ ok: false, reason: 'not_set_up' });
    expect(await topScores('x', 10, fakeSb([], 'boom').sb)).toEqual({ ok: false, reason: 'error' });
  });

  it('lists rows and marks your own', async () => {
    useAccount.setState({ user: { id: 'u1', email: 'e' } });
    const r = await topScores('x', 10, fakeSb([{ user_id: 'u1', player_name: 'Me', score: '90.5', tier_label: 'Hall of Famer', titles: 3, seasons: 14 }, { user_id: 'u2', player_name: 'Them', score: 70, tier_label: '', titles: 0, seasons: 9 }]).sb);
    expect(r.ok && r.rows.map((x) => [x.playerName, x.score, x.mine])).toEqual([['Me', 90.5, true], ['Them', 70, false]]);
  });

  it('only submits a signed-in challenge run that beats the old best', async () => {
    const f = fakeSb();
    expect(await submitChallengeScore(legend(), f.sb)).toBe('skipped'); // signed out
    useAccount.setState({ user: { id: 'u1', email: 'e' } });
    expect(await submitChallengeScore(legend({ challenge: '' }), f.sb)).toBe('skipped'); // not a challenge
    expect(await submitChallengeScore(legend(), f.sb)).toBe('submitted');
    expect(f.calls.upsert).toMatchObject({ user_id: 'u1', challenge_id: 'weekly-2026-47', player_name: 'Jay Walker', score: 88.5 });
    expect(JSON.stringify(f.calls.upsert)).not.toMatch(/e@|email/);
    expect(await submitChallengeScore(legend(), fakeSb([{ score: 95 }]).sb)).toBe('not_better');
    expect(await submitChallengeScore(legend(), fakeSb([{ score: 50 }]).sb)).toBe('submitted');
  });
});
