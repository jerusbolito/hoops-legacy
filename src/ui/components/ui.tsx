import { motion } from 'framer-motion';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Team } from '../../state/schemas';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Panel({ children, className, title, right }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <section className={cx('rounded-xl border border-court-700 bg-court-850/80 backdrop-blur-sm', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-court-700 px-4 py-2.5">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-300">{title}</h3>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'outline' | 'danger';

export function Button({ variant = 'primary', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-hoop-500 text-white hover:bg-hoop-400 disabled:bg-court-600 disabled:text-ink-500 shadow-lg shadow-hoop-500/20',
    ghost: 'text-ink-300 hover:bg-court-700 hover:text-ink-100',
    outline: 'border border-court-600 text-ink-100 hover:border-hoop-500 hover:text-hoop-400',
    danger: 'border border-loss/40 text-loss hover:bg-loss/10',
  };
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed', styles[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Meter({ value, max = 100, color = 'var(--color-hoop-500)', label, showValue = true, className }: { value: number; max?: number; color?: string; label?: string; showValue?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-ink-400">
          <span>{label}</span>
          {showValue && <span className="font-mono text-ink-300">{Math.round(value)}</span>}
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-court-700">
        <motion.div className="h-full rounded-full" style={{ background: color }} initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
    </div>
  );
}

/** Bidirectional meter for -100..100 values (affinity). */
export function SignedMeter({ value, label }: { value: number; label: string }) {
  const pct = Math.min(50, Math.abs(value) / 2);
  const pos = value >= 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-ink-400">
        <span>{label}</span>
        <span className={cx('font-mono', pos ? 'text-win' : 'text-loss')}>{value > 0 ? `+${value}` : value}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-court-700">
        <div className="absolute top-0 left-1/2 h-full w-px bg-court-500" />
        <motion.div
          className="absolute top-0 h-full rounded-full"
          style={{ background: pos ? 'var(--color-win)' : 'var(--color-loss)' }}
          initial={false}
          animate={{ left: pos ? '50%' : `${50 - pct}%`, width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Pill({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', className)}
      style={{ borderColor: color ? `${color}66` : 'var(--color-court-600)', color: color ?? 'var(--color-ink-300)', background: color ? `${color}14` : undefined }}
    >
      {children}
    </span>
  );
}

function hashColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(h) % 360} 55% 45%)`;
}

export function Avatar({ name, size = 40, ring }: { name: string; size?: number; ring?: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${hashColor(name)}, #0f1420)`, fontSize: size * 0.38, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
    >
      {initials}
    </div>
  );
}

export function TeamBadge({ team, size = 36 }: { team: Pick<Team, 'abbrev' | 'colors'>; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg font-display font-bold tracking-tight"
      style={{ width: size, height: size, background: team.colors[0], color: team.colors[1], fontSize: size * 0.32, boxShadow: `inset 0 -3px 0 ${team.colors[1]}55` }}
    >
      {team.abbrev}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{label}</div>
      <div className="font-display text-2xl leading-tight font-semibold text-ink-100">{value}</div>
      {sub && <div className="text-xs text-ink-400">{sub}</div>}
    </div>
  );
}

export function EffectChips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => {
        const neg = /[-−]\d/.test(t) && !/\+/.test(t);
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className={cx('rounded-md border px-2 py-1 text-xs font-medium', neg ? 'border-loss/30 bg-loss/10 text-loss' : 'border-win/30 bg-win/10 text-win')}
          >
            {t}
          </motion.span>
        );
      })}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-400">
      <motion.span className="inline-block text-xl" animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 0.7, ease: 'easeInOut' }}>
        🏀
      </motion.span>
      {label}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-court-600 bg-court-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-hoop-500 focus:outline-none';
