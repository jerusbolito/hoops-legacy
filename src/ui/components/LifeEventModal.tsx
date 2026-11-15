import { AnimatePresence, motion } from 'framer-motion';
import { lifeEventView, type LifeEventView, type LifeOutcome, type Tone } from '../../engine/lifeEvents';
import { useStore } from '../../state/store';
import { Button, EffectChips, Pill, cx } from './ui';

const TONE: Record<Tone, { label: string; color: string; border: string }> = {
  good: { label: 'Good news', color: '#22c55e', border: 'border-win/40' },
  bad: { label: 'Trouble', color: '#ef4444', border: 'border-loss/40' },
  odd: { label: 'Out of nowhere', color: '#a78bfa', border: 'border-violet-400/40' },
  money: { label: 'Money', color: '#fbbf24', border: 'border-gold/40' },
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * Something just happened. It cannot be closed without a decision, because life does not wait. The view and the outcome
 * come in as props so the fade-out never draws from a store that has already moved on.
 */
function Moment({ view, outcome }: { view: LifeEventView | null; outcome: LifeOutcome | null }) {
  const answer = useStore((s) => s.answerLife);
  const done = useStore((s) => s.dismissLifeOutcome);
  const shown = outcome ?? view;
  if (!shown) return null;
  const tone = view ? TONE[view.tone] : TONE.odd;
  return (
    <motion.div role="dialog" aria-modal="true" aria-label={shown.title} className="fixed inset-0 z-[52] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className={cx('my-auto w-full max-w-xl rounded-2xl border bg-court-850 shadow-2xl', outcome ? 'border-court-600' : tone.border)}>
        <div className="flex items-center gap-3 border-b border-court-700 px-5 py-3">
          <span className="text-2xl">{shown.icon}</span>
          <h2 className="flex-1 font-display text-lg font-semibold">{shown.title}</h2>
          {!outcome && <Pill color={tone.color}>{tone.label}</Pill>}
        </div>
        <div className="space-y-4 p-5">
          {outcome ? (
            <>
              <div className="text-[11px] font-semibold tracking-widest text-ink-500 uppercase">You chose: {outcome.choice}</div>
              <p className="text-[15px] leading-relaxed text-ink-100">{outcome.text}</p>
              <EffectChips items={outcome.lines} />
              <div className="flex justify-end">
                <Button onClick={done}>Continue →</Button>
              </div>
            </>
          ) : (
            view && (
              <>
                <p className="text-[15px] leading-relaxed text-ink-100">{view.text}</p>
                <div className="grid gap-2">
                  {view.options.map((o) => (
                    <button
                      key={o.id}
                      disabled={!o.affordable}
                      onClick={() => answer(o.id)}
                      className={cx('flex items-start justify-between gap-3 rounded-lg border border-court-600 bg-court-800/50 p-3 text-left transition-colors', o.affordable ? 'hover:border-hoop-500' : 'cursor-not-allowed opacity-45')}
                    >
                      <div>
                        <div className="font-semibold">{o.label}</div>
                        {o.hint && <div className="mt-0.5 text-xs text-ink-400">{o.hint}</div>}
                      </div>
                      {o.cost ? (
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-sm text-gold">{money(o.cost)}</div>
                          {!o.affordable && <div className="text-[10px] text-loss uppercase">Cannot afford</div>}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </>
            )
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Mounted once in the game shell. Waits for any full-screen reveal (awards, draft night) to finish first. */
export function LifeEventModal() {
  const game = useStore((s) => s.game);
  const outcome = useStore((s) => s.lifeOutcome);
  const blocked = useStore((s) => s.reveals.length > 0 || !!s.live);
  const view = game ? lifeEventView(game) : null;
  const open = !blocked && (!!view || !!outcome);
  return <AnimatePresence>{open ? <Moment key={outcome ? `out-${outcome.id}` : `ev-${view?.id}`} view={outcome ? null : view} outcome={outcome} /> : null}</AnimatePresence>;
}
