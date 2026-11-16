import { useState } from 'react';
import { userAthlete } from '../../engine/career';
import { RATING_INFO } from '../../engine/ratings';
import { SPILLOVER, TRAINING_OPTIONS } from '../../engine/progression';
import { RATING_KEYS, RATING_LABELS, type RatingKey } from '../../state/schemas';
import { useStore } from '../../state/store';
import { Button, Panel, cx } from '../components/ui';

export function TrainingPanel() {
  const game = useStore((s) => s.game)!;
  const train = useStore((s) => s.train);
  const a = userAthlete(game);
  const p = game.player;
  const options = TRAINING_OPTIONS.filter((o) => (o.id !== 'study' || game.career.level !== 'pro') && (o.id !== 'rehab' || !!p.injury));

  return (
    <Panel title="Training — how do you spend this week?" right={<span className="text-xs text-ink-400">Energy {p.energy}</span>}>
      {p.injury && <p className="mb-3 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">You are injured. Rehab can shave weeks off it, and film study and books are smart choices. A long layoff ends with a comeback of its own.</p>}
      {game.career.level !== 'pro' && p.academics < 2.3 && <p className="mb-3 rounded-md bg-gold/10 px-3 py-2 text-sm text-gold">Your GPA ({p.academics.toFixed(2)}) is low. Top programs will not take you below 2.3.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {options.map((o) => {
          const isRating = (RATING_KEYS as readonly string[]).includes(o.id);
          const tooTired = o.energy < 0 && p.energy + o.energy < 0;
          return (
            <button
              key={o.id}
              disabled={tooTired}
              onClick={() => train(o.id)}
              className="group rounded-lg border border-court-600 bg-court-800/50 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-hoop-500 disabled:opacity-40"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{o.label}</span>
                {isRating && <span className="font-mono text-xs text-ink-400">{a.ratings[o.id as RatingKey]}</span>}
              </div>
              <div className="mt-1 text-xs text-ink-400">{o.desc}</div>
              <div className={cx('mt-2 font-mono text-[11px]', o.energy >= 0 ? 'text-win' : 'text-ink-500')}>
                {o.energy >= 0 ? '+' : ''}
                {o.energy} energy
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

export function SummerPanel() {
  const game = useStore((s) => s.game)!;
  const summerTrain = useStore((s) => s.summerTrain);
  const a = userAthlete(game);
  const [picks, setPicks] = useState<RatingKey[]>([]);
  const toggle = (k: RatingKey) => setPicks((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < 2 ? [...p, k] : p));
  return (
    <Panel title="Summer development — choose two focus areas">
      <p className="mb-4 text-sm text-ink-300">The offseason is where players are made. Pick two skills to grind all summer. You also grow naturally (or start to age) each year.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {RATING_KEYS.map((k) => {
          const on = picks.includes(k);
          const side = SPILLOVER[k];
          return (
            <button key={k} onClick={() => toggle(k)} aria-pressed={on} className={cx('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors', on ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 hover:border-court-500')}>
              <div className="w-14 shrink-0 text-center">
                <div className="text-[10px] font-semibold tracking-widest text-ink-400">{RATING_LABELS[k]}</div>
                <div className="font-display text-3xl leading-none">{a.ratings[k]}</div>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-100">{RATING_INFO[k].name}</div>
                <div className="mt-0.5 text-xs text-ink-400">{RATING_INFO[k].what}</div>
                {side && <div className="mt-1 text-[11px] text-ink-500">Also lifts {RATING_INFO[side].name.toLowerCase()} a little.</div>}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-500">{picks.length}/2 chosen{picks.length ? ': ' + picks.map((k) => RATING_INFO[k].name).join(' and ') : ''}. Skills further below your potential grow faster, and so do younger players.</p>
      <div className="mt-4 flex justify-end">
        <Button disabled={picks.length !== 2} onClick={() => summerTrain(picks)}>
          Grind all summer →
        </Button>
      </div>
    </Panel>
  );
}
