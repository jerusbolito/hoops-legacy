import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../../state/store';
import { cx } from './ui';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            onClick={() => dismiss(t.id)}
            className={cx(
              'pointer-events-auto rounded-lg border px-3 py-2 text-left text-sm shadow-xl backdrop-blur',
              t.kind === 'good' && 'border-win/40 bg-court-800/95 text-win',
              t.kind === 'bad' && 'border-loss/40 bg-court-800/95 text-loss',
              t.kind === 'award' && 'border-gold/60 bg-gradient-to-r from-gold/20 to-court-800/95 font-semibold text-gold',
              t.kind === 'levelup' && 'border-hoop-400/70 bg-gradient-to-r from-hoop-500/30 to-court-800/95 font-semibold text-hoop-400 shadow-[0_0_24px_rgba(249,115,22,0.35)]',
              t.kind === 'info' && 'border-court-600 bg-court-800/95 text-ink-100',
            )}
          >
            {t.kind === 'award' ? '🏆 ' : t.kind === 'levelup' ? '⬆ ' : ''}
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
