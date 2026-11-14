import { motion, useReducedMotion } from 'framer-motion';
import { ratingTier } from '../../engine/ratings';
import type { TrainingResult } from '../../engine/progression';
import { RATING_LABELS, type Ratings } from '../../state/schemas';
import { Panel, Pill } from '../components/ui';

/** What this week's training (or summer) did: animated bars from the old value to the new one. */
export function TrainingResultCard({ result, ratings }: { result: TrainingResult; ratings: Ratings }) {
  const reduce = useReducedMotion();
  const { gains } = result;
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <Panel title="Training report" right={<span className="text-xs text-ink-400">{result.energyDelta ? `Energy ${result.energyDelta > 0 ? '+' : ''}${result.energyDelta}` : ''}{result.academicsDelta ? ` · GPA +${result.academicsDelta.toFixed(2)}` : ''}</span>}>
        <p className="text-sm text-ink-300">{result.text}</p>
        {gains.length > 0 && (
          <ul className="mt-3 space-y-2.5">
            {gains.map((g, i) => {
              const now = ratings[g.key];
              const was = now - g.delta;
              const tierUp = ratingTier(now).index > ratingTier(was).index;
              const up = g.delta > 0;
              return (
                <li key={g.key} className="flex items-center gap-3">
                  <span className="w-9 text-xs font-semibold tracking-widest text-ink-400">{RATING_LABELS[g.key]}</span>
                  <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-court-700">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-court-500" style={{ width: `${(Math.min(was, now) / 99) * 100}%` }} />
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ background: up ? 'linear-gradient(90deg, var(--color-hoop-600), var(--color-hoop-400))' : 'var(--color-loss)' }}
                      initial={{ width: `${(was / 99) * 100}%` }}
                      animate={{ width: `${(now / 99) * 100}%` }}
                      transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.2 + i * 0.15, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="w-20 text-right font-mono text-sm">
                    {was}→<span className={up ? 'text-hoop-400' : 'text-loss'}>{now}</span>
                  </span>
                  <motion.span initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: reduce ? 0 : 0.9 + i * 0.15, type: 'spring', stiffness: 300 }} className={`w-9 text-right font-mono text-sm font-bold ${up ? 'text-win' : 'text-loss'}`}>
                    {up ? '+' : ''}
                    {g.delta}
                  </motion.span>
                  {tierUp && <Pill color="#fbbf24">⬆ {ratingTier(now).name}</Pill>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </motion.div>
  );
}
