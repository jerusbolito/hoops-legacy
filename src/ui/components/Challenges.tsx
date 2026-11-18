import { useEffect, useState } from 'react';
import { allChallenges, challengeInput, personalBests, type Challenge } from '../../engine/challenges';
import { DIFFICULTY_BY_ID } from '../../engine/difficulty';
import { listLegends } from '../../state/persistence';
import type { Legend } from '../../state/schemas';
import { useStore } from '../../state/store';
import { useAccount } from '../../sync/account';
import { topScores, type BoardResult } from '../../sync/leaderboard';
import { Button, Panel, Pill, cx } from './ui';

function Board({ id }: { id: string }) {
  const [res, setRes] = useState<BoardResult | null>(null);
  const user = useAccount((s) => s.user);
  useEffect(() => {
    let live = true;
    setRes(null);
    void topScores(id).then((r) => live && setRes(r));
    return () => {
      live = false;
    };
  }, [id, user?.id]);
  if (!res) return <p className="text-xs text-ink-500">Loading the leaderboard…</p>;
  if (!res.ok) {
    const msg = { signed_out: 'Sign in to see the leaderboard and post your score.', not_set_up: 'The leaderboard is not set up on this server yet.', error: 'Could not load the leaderboard right now.' }[res.reason];
    return <p className="text-xs text-ink-500">{msg}</p>;
  }
  if (!res.rows.length) return <p className="text-xs text-ink-500">No scores yet. Finish a run to be the first.</p>;
  return (
    <>
      <ol className="space-y-1 text-sm">
        {res.rows.map((r, i) => (
          <li key={i} className={cx('flex items-baseline gap-2 rounded px-2 py-1', r.mine && 'bg-hoop-500/10')}>
            <span className="w-6 text-right font-mono text-xs text-ink-500">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{r.playerName || 'Unknown'}{r.mine && <span className="ml-2 text-[10px] uppercase tracking-widest text-hoop-400">you</span>}</span>
            <span className="hidden text-xs text-ink-500 sm:inline">{r.tierLabel} · {r.titles} title{r.titles === 1 ? '' : 's'}</span>
            <span className="font-mono">{r.score.toFixed(1)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-ink-500">Scores are sent by each player's game and are not checked by the server. Treat it as friendly competition.</p>
    </>
  );
}

function ChallengeCard({ c, best }: { c: Challenge; best?: Legend }) {
  const newCareer = useStore((s) => s.newCareer);
  const [open, setOpen] = useState<'none' | 'start' | 'board'>('none');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    await newCareer(challengeInput(c, { firstName: first, lastName: last }));
  };
  const diff = DIFFICULTY_BY_ID[c.difficulty];
  return (
    <li className="rounded-lg border border-court-700 bg-court-900/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-base font-semibold">{c.title}</span>
        {c.kind === 'weekly' && <Pill>This week</Pill>}
        <span className="text-[10px] uppercase tracking-widest text-ink-500">{diff.label}</span>
        {best && <span className="ml-auto font-mono text-xs text-ink-400">Your best {best.score.toFixed(1)} · {best.tierLabel}</span>}
      </div>
      <p className="mt-1 text-xs text-ink-400">{c.blurb}</p>
      <div className="mt-2 flex gap-2">
        <Button variant="outline" onClick={() => setOpen(open === 'start' ? 'none' : 'start')}>{best ? 'Play again' : 'Start'}</Button>
        <Button variant="ghost" onClick={() => setOpen(open === 'board' ? 'none' : 'board')}>Leaderboard</Button>
      </div>
      {open === 'start' && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void go();
          }}
        >
          <label className="text-xs text-ink-400">First name<input className="mt-1 block w-32 rounded-md border border-court-600 bg-court-900 px-2 py-1 text-sm text-ink-100" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={20} /></label>
          <label className="text-xs text-ink-400">Last name<input className="mt-1 block w-32 rounded-md border border-court-600 bg-court-900 px-2 py-1 text-sm text-ink-100" value={last} onChange={(e) => setLast(e.target.value)} maxLength={20} /></label>
          <Button type="submit" disabled={busy}>{busy ? 'Starting…' : 'Begin'}</Button>
        </form>
      )}
      {open === 'board' && <div className="mt-3"><Board id={c.id} /></div>}
    </li>
  );
}

/** A fixed start everyone shares, so careers can be compared. */
export function Challenges() {
  const [legends, setLegends] = useState<Legend[]>([]);
  useEffect(() => {
    void listLegends().then(setLegends).catch(() => undefined);
  }, []);
  const bests = personalBests(legends);
  return (
    <Panel title="Challenges" right={<span className="text-xs text-ink-500">Same start for everyone</span>} className="mt-6">
      <ul className="space-y-2">
        {allChallenges().map((c) => (
          <ChallengeCard key={c.id} c={c} best={bests[c.id]} />
        ))}
      </ul>
    </Panel>
  );
}
