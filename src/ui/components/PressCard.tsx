import { AnimatePresence, motion } from 'framer-motion';
import { PRESS_OPTIONS } from '../../engine/media';
import { useStore } from '../../state/store';
import { Button, Pill } from './ui';

/** A reporter wants a word. Shows the question, or what your answer did. */
export function PressCard() {
  const press = useStore((s) => s.game?.career.press);
  const outcome = useStore((s) => s.pressOutcome);
  const answer = useStore((s) => s.answerPress);
  const dismiss = useStore((s) => s.dismissPress);

  return (
    <AnimatePresence mode="wait">
      {press ? (
        <motion.section key="q" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-sky-400/40 bg-sky-400/5 p-4" aria-label="Press question">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xl">🎙️</span>
            <Pill color="#38bdf8">Press</Pill>
            <span className="text-xs text-ink-500">{press.context}</span>
          </div>
          <p className="font-display text-lg leading-snug">"{press.question}"</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {PRESS_OPTIONS.map((o) => (
              <button key={o.id} onClick={() => answer(o.id)} className="rounded-lg border border-court-600 bg-court-800/50 p-3 text-left transition-colors hover:border-hoop-500">
                <div className="text-sm font-semibold">{o.label}</div>
                <div className="mt-0.5 text-xs text-ink-400">{o.blurb}</div>
              </button>
            ))}
          </div>
        </motion.section>
      ) : outcome ? (
        <motion.section key="a" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-court-600 bg-court-850/80 p-4" aria-live="polite">
          <div className="mb-1 text-xs font-semibold tracking-widest text-ink-500 uppercase">You said</div>
          <p className="font-display text-lg">"{outcome.quote}"</p>
          <p className="mt-1 text-sm text-ink-300">{outcome.summary}</p>
          {outcome.lines.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {outcome.lines.map((l) => (
                <span key={l} className="rounded-md border border-court-600 px-2 py-0.5 text-xs text-ink-300">
                  {l}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" onClick={dismiss}>
              OK
            </Button>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
