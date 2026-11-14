import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { LEVEL_CONFIG } from '../../data/teams';
import type { SeasonReview } from '../../engine/seasonReview';
import type { Reveal } from '../../state/reveals';
import { usePrefs } from '../../state/prefs';
import { useStore } from '../../state/store';
import { alpha, buttonColors, safeId, shade } from './color';
import { sfx } from '../sfx';
import { Confetti } from './Confetti';
import { Portrait } from './Portrait';
import { SeasonStoryCard } from './SeasonStoryCard';
import { Typewriter } from './Typewriter';
import { Button, TeamBadge, cx } from './ui';

const fmtMoney = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}K`);

/** Counts from `from` to `to`; shows the final value immediately for reduced-motion users. */
function CountUp({ to, from = 0, ms = 1100, decimals = 0, delay = 0 }: { to: number; from?: number; ms?: number; decimals?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : from);
  useEffect(() => {
    if (reduce) {
      setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - t0) / ms));
      const e = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, from, ms, delay, reduce]);
  return <>{v.toFixed(decimals)}</>;
}

function Trophy({ size = 150, color = '#fbbf24' }: { size?: number; color?: string }) {
  const id = safeId(useId());
  return (
    <div className="relative" style={{ width: size, height: size * 1.1 }}>
      <svg viewBox="0 0 100 110" width={size} height={size * 1.1} aria-hidden overflow="visible">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={shade(color, 0.45)} />
            <stop offset="0.5" stopColor={color} />
            <stop offset="1" stopColor={shade(color, -0.35)} />
          </linearGradient>
        </defs>
        <path d="M26 8 H74 V38 C74 60 62 70 50 72 C38 70 26 60 26 38Z" fill={`url(#g${id})`} />
        <path d="M26 16 H13 C13 38 21 46 31 48 M74 16 H87 C87 38 79 46 69 48" fill="none" stroke={`url(#g${id})`} strokeWidth={6} strokeLinecap="round" />
        <rect x={44} y={72} width={12} height={18} fill={`url(#g${id})`} />
        <path d="M30 90 H70 L75 104 H25Z" fill={shade(color, -0.45)} />
        <path d="M50 20 l4.2 8.6 9.4 1.3 -6.8 6.6 1.6 9.4 -8.4 -4.4 -8.4 4.4 1.6 -9.4 -6.8 -6.6 9.4 -1.3Z" fill="#fff" opacity={0.85} />
        {[
          [14, 12, 0],
          [88, 24, 0.7],
          [78, 70, 1.4],
          [24, 64, 2.1],
        ].map(([x, y, d]) => (
          <motion.path
            key={`${x}${y}`}
            d={`M${x} ${y - 7} Q${x} ${y} ${x + 7} ${y} Q${x} ${y} ${x} ${y + 7} Q${x} ${y} ${x - 7} ${y} Q${x} ${y} ${x} ${y - 7}Z`}
            fill="#fff"
            style={{ transformOrigin: `${x}px ${y}px`, transformBox: 'fill-box' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1, 0], opacity: [0, 1, 0], rotate: [0, 45, 90] }}
            transition={{ duration: 1.8, delay: 0.6 + d, repeat: Infinity, repeatDelay: 0.8 }}
          />
        ))}
      </svg>
    </div>
  );
}

function Frame({ colors, children, confetti, onClose, label }: { colors: [string, string]; children: ReactNode; confetti?: 'top' | 'center' | 'both'; onClose: () => void; label: string }) {
  const flashy = usePrefs((p) => p.flashy);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={{ background: `radial-gradient(ellipse at 50% 30%, ${alpha(colors[0], 0.55)}, rgba(5,7,12,0) 68%), rgba(5,7,12,0.9)` }}
    >
      {confetti && flashy && (confetti === 'top' || confetti === 'both') && <Confetti colors={colors} from="top" />}
      {confetti && flashy && (confetti === 'center' || confetti === 'both') && <Confetti colors={colors} from="center" count={110} duration={3200} />}
      <motion.div initial={{ y: 30, scale: 0.94, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 20, delay: 0.1 }} className="w-full max-w-xl">
        {children}
        <div className="mt-6 flex justify-center">
          <Button autoFocus onClick={onClose} className="px-8 py-3 text-base" style={{ background: buttonColors(colors).bg, color: buttonColors(colors).fg }}>
            Continue →
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const Kicker = ({ children, color }: { children: ReactNode; color?: string }) => (
  <div className="text-center font-display text-xs font-semibold tracking-[0.4em] uppercase" style={{ color: color ?? '#fbbf24' }}>
    {children}
  </div>
);

/* ───────── individual cards ───────── */

function DraftCard({ r }: { r: Extract<Reveal, { kind: 'draft' }> }) {
  const reduce = useReducedMotion();
  const picked = r.pick !== null;
  const tier = !picked ? 'UNDRAFTED' : r.pick === 1 ? 'FIRST OVERALL PICK' : r.pick! <= 5 ? 'TOP-5 PICK' : r.pick! <= 14 ? 'LOTTERY PICK' : r.pick! <= 30 ? 'FIRST ROUND' : 'SECOND ROUND';
  return (
    <div className="text-center">
      <Kicker>Draft night</Kicker>
      <div className="mt-3 flex items-center justify-center gap-5">
        <Portrait name={r.player} size={96} colors={r.colors} mood={picked ? 'happy' : 'neutral'} ring={r.colors[1]} />
        <div className="text-left">
          <div className="font-display text-3xl leading-tight font-bold uppercase">{r.player}</div>
          <div className="text-sm text-ink-300">
            {r.college || 'Draft prospect'} · OVR {r.ovr}
          </div>
        </div>
      </div>
      {picked ? (
        <>
          <div className="mt-6 font-display text-sm tracking-[0.5em] text-ink-300">WITH THE PICK NUMBER</div>
          <div className="font-display text-[9rem] leading-none font-bold" style={{ color: r.colors[1], textShadow: `0 0 50px ${alpha(r.colors[0], 0.9)}` }}>
            <CountUp from={Math.min(30, r.pick! + 12)} to={r.pick!} ms={reduce ? 0 : 1500} delay={300} />
          </div>
        </>
      ) : (
        <div className="mt-8 font-display text-5xl font-bold tracking-wide text-ink-300">NO CALL.</div>
      )}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 1.9 }} className="mt-4">
        <div className="mx-auto flex w-fit items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: alpha(r.colors[1], 0.4), background: alpha(r.colors[0], 0.35) }}>
          <TeamBadge team={{ abbrev: r.abbrev, colors: r.colors }} size={46} />
          <div className="text-left">
            <div className="font-display text-xl font-semibold">{r.teamName} {r.mascot}</div>
            <div className="text-xs tracking-widest text-ink-300">{tier}</div>
          </div>
        </div>
        <div className="mt-3 text-sm text-ink-300">
          {picked ? 'Rookie contract' : 'Signed as a free agent'}: <span className="font-mono text-gold">{fmtMoney(r.salary)}/yr</span> × {r.years}
        </div>
      </motion.div>
    </div>
  );
}

function CommitCard({ r }: { r: Extract<Reveal, { kind: 'commit' }> }) {
  return (
    <div className="text-center">
      <Kicker color={r.colors[1]}>Signing day</Kicker>
      <div className="mt-4 flex justify-center">
        <Portrait name={r.player} size={112} colors={r.colors} mood="happy" ring={r.colors[1]} />
      </div>
      <motion.div
        initial={{ scale: 2.4, rotate: -14, opacity: 0 }}
        animate={{ scale: 1, rotate: -4, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.5 }}
        className="mx-auto mt-5 w-fit rounded-md border-4 px-6 py-1 font-display text-5xl font-bold tracking-widest"
        style={{ borderColor: r.colors[1], color: r.colors[1], textShadow: `0 0 24px ${alpha(r.colors[1], 0.5)}` }}
      >
        COMMITTED
      </motion.div>
      <div className="mt-6 flex items-center justify-center gap-3">
        <TeamBadge team={{ abbrev: r.abbrev, colors: r.colors }} size={54} />
        <div className="text-left">
          <div className="font-display text-3xl font-bold uppercase">{r.college}</div>
          <div className="text-sm text-ink-300">{r.mascot}</div>
        </div>
      </div>
      <div className="mt-3 text-2xl text-gold">
        {'★'.repeat(r.stars)}
        <span className="text-court-600">{'★'.repeat(5 - r.stars)}</span>
      </div>
    </div>
  );
}

function ChampionCard({ r }: { r: Extract<Reveal, { kind: 'champion' }> }) {
  return (
    <div className="text-center">
      <Kicker color={r.colors[1]}>{LEVEL_CONFIG[r.level].leagueName} · Season {r.season}</Kicker>
      <motion.div initial={{ y: 60, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 12, delay: 0.3 }} className="mt-4 flex justify-center">
        <Trophy size={170} />
      </motion.div>
      <div className="mt-4 font-display text-7xl leading-none font-bold tracking-wider" style={{ color: r.colors[1], textShadow: `0 0 40px ${alpha(r.colors[0], 0.9)}` }}>
        CHAMPIONS
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        <TeamBadge team={{ abbrev: r.abbrev, colors: r.colors }} size={42} />
        <div className="font-display text-2xl font-semibold">{r.teamName} {r.mascot}</div>
      </div>
      <div className="mt-1 font-mono text-sm text-ink-300">{r.record}</div>
    </div>
  );
}

function AwardCard({ r }: { r: Extract<Reveal, { kind: 'award' }> }) {
  const mvp = /MVP/.test(r.name);
  return (
    <div className="text-center">
      <Kicker color={r.colors[1]}>{LEVEL_CONFIG[r.level].label} · Season {r.season}</Kicker>
      <motion.div initial={{ rotate: -12, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 11, delay: 0.25 }} className="mt-4 flex justify-center">
        <Trophy size={mvp ? 150 : 120} color={mvp ? '#fbbf24' : '#cbd5e1'} />
      </motion.div>
      <div className="mt-4 font-display text-4xl leading-tight font-bold uppercase">{r.name}</div>
      <div className="mt-2 flex items-center justify-center gap-3 text-ink-300">
        <Portrait name={r.player} size={36} colors={r.colors} mood="happy" />
        {r.player}
      </div>
    </div>
  );
}

function ContractCard({ r }: { r: Extract<Reveal, { kind: 'contract' }> }) {
  return (
    <div className="text-center">
      <Kicker color={r.colors[1]}>Official</Kicker>
      <div className="mt-4 flex justify-center">
        <Portrait name={r.player} size={100} colors={r.colors} mood="happy" ring={r.colors[1]} />
      </div>
      <div className="mt-4 font-display text-4xl font-bold uppercase">{r.player}</div>
      <div className="mt-1 text-ink-300">signs with</div>
      <div className="mt-2 flex items-center justify-center gap-3">
        <TeamBadge team={{ abbrev: r.abbrev, colors: r.colors }} size={46} />
        <div className="font-display text-2xl font-semibold">{r.teamName} {r.mascot}</div>
      </div>
      <div className="mt-5 font-mono text-4xl text-gold">{fmtMoney(r.salary)}<span className="text-lg text-ink-300"> / yr × {r.years}</span></div>
      <div className="mt-1 text-sm text-ink-400">Total {fmtMoney(r.salary * r.years)}</div>
    </div>
  );
}

function Tile({ label, value, decimals = 1, delay = 0 }: { label: string; value: number; decimals?: number; delay?: number }) {
  return (
    <div className="rounded-lg bg-black/30 px-2 py-3 text-center">
      <div className="font-mono text-3xl font-semibold">
        <CountUp to={value} decimals={decimals} delay={delay} />
      </div>
      <div className="text-[10px] tracking-[0.25em] text-ink-400">{label}</div>
    </div>
  );
}

function SeasonCard({ r, player }: { r: { review: SeasonReview; summary: string }; player: string }) {
  const v = r.review;
  const good = v.champion || /Lost in the (championship|finals)/i.test(v.playoff);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-court-900/95 shadow-2xl">
      <div className="relative px-6 pt-5 pb-4" style={{ background: `linear-gradient(135deg, ${v.colors[0]}, ${shade(v.colors[0], -0.7)})` }}>
        <div className="flex items-center gap-4">
          <Portrait name={player} size={70} colors={v.colors} mood={v.w >= v.l ? 'happy' : 'neutral'} ring={v.colors[1]} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xs tracking-[0.35em]" style={{ color: v.colors[1] }}>
              SEASON {v.season} · {v.levelLabel.toUpperCase()} {v.yearLabel.toUpperCase()}
            </div>
            <div className="truncate font-display text-3xl leading-tight font-bold uppercase">{player}</div>
            <div className="truncate text-sm text-white/80">
              {v.teamName} {v.mascot}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-4xl font-bold">
              {v.w}-{v.l}
            </div>
            <div className="text-xs text-white/70">
              #{v.rank} of {v.teams}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-4 gap-2">
          <Tile label="PPG" value={v.ppg} delay={200} />
          <Tile label="RPG" value={v.rpg} delay={350} />
          <Tile label="APG" value={v.apg} delay={500} />
          <Tile label="OVR" value={v.overall} decimals={0} delay={650} />
        </div>
        <div className={cx('rounded-lg border px-3 py-2 text-center font-display text-sm tracking-widest uppercase', good ? 'border-gold/50 bg-gold/10 text-gold' : 'border-court-600 text-ink-300')}>
          {v.champion ? '🏆 ' : ''}
          {v.playoff}
        </div>
        {v.awards.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {v.awards.map((a) => (
              <span key={a} className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
                🏆 {a}
              </span>
            ))}
          </div>
        )}
        {v.best && (
          <div className="rounded-lg bg-black/25 px-3 py-2 text-xs">
            <span className="mr-2 font-semibold tracking-widest text-hoop-400">BEST GAME</span>
            <span className="text-ink-300">
              {v.best.score} vs {v.best.vs}: <span className="font-mono">{v.best.line}</span>
            </span>
          </div>
        )}
        {r.summary && <Typewriter text={r.summary} speed={10} className="text-sm leading-relaxed text-ink-300 italic" />}
      </div>
    </div>
  );
}

/* ───────── overlay ───────── */

export function RevealOverlay() {
  const reveal = useStore((s) => s.reveals[0]);
  const dismiss = useStore((s) => s.dismissReveal);
  const playerName = useStore((s) => {
    const g = s.game;
    if (!g) return '';
    const a = g.athletes[g.player.athleteId];
    return `${a.firstName} ${a.lastName}`;
  });

  const revealId = reveal?.id;
  const celebratory = reveal && confettiFor(reveal) !== undefined;
  useEffect(() => {
    if (revealId === undefined) return;
    if (celebratory) sfx.fanfare();
    else sfx.whoosh();
  }, [revealId, celebratory]);

  return (
    <AnimatePresence mode="wait">
      {reveal && (
        <Frame key={reveal.id} colors={colorsOf(reveal)} confetti={confettiFor(reveal)} onClose={dismiss} label={labelOf(reveal)}>
          {reveal.kind === 'draft' && <DraftCard r={reveal} />}
          {reveal.kind === 'commit' && <CommitCard r={reveal} />}
          {reveal.kind === 'champion' && <ChampionCard r={reveal} />}
          {reveal.kind === 'award' && <AwardCard r={reveal} />}
          {reveal.kind === 'contract' && <ContractCard r={reveal} />}
          {reveal.kind === 'season' && <SeasonCard r={reveal} player={playerName} />}
          {reveal.kind === 'seasonStory' && <SeasonStoryCard story={reveal.story} colors={reveal.colors} player={reveal.player} />}
        </Frame>
      )}
    </AnimatePresence>
  );
}

function colorsOf(r: Reveal): [string, string] {
  return r.kind === 'season' ? r.review.colors : r.colors;
}
function labelOf(r: Reveal): string {
  return { draft: 'Draft night', commit: 'College commitment', champion: 'Championship', award: 'Award', contract: 'Contract signing', season: 'Season review', seasonStory: 'Season story' }[r.kind];
}
function confettiFor(r: Reveal): 'top' | 'center' | 'both' | undefined {
  if (r.kind === 'champion') return 'both';
  if (r.kind === 'draft') return r.pick !== null && r.pick <= 5 ? 'both' : r.pick !== null && r.pick <= 14 ? 'top' : undefined;
  if (r.kind === 'award') return /MVP/.test(r.name) ? 'center' : undefined;
  if (r.kind === 'commit') return 'center';
  return undefined;
}
