import type { FormPoint } from '../../engine/analytics';

/**
 * Game-by-game form: a bar per game (game score) with a rolling-average line.
 * Wins are filled, losses are outlined, so the result never relies on color alone.
 */
export function FormChart({ series, opponentName }: { series: FormPoint[]; opponentName: (id: string) => string }) {
  if (series.length < 2) return <p className="text-sm text-ink-500">Play a few games to see your form.</p>;
  const W = 720;
  const H = 190;
  const pad = { l: 30, r: 8, t: 10, b: 20 };
  const vals = series.flatMap((p) => [p.gmsc, p.rolling]);
  const hi = Math.max(10, Math.ceil(Math.max(...vals) / 5) * 5);
  const lo = Math.min(0, Math.floor(Math.min(...vals) / 5) * 5);
  const x = (i: number) => pad.l + ((i + 0.5) / series.length) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const bw = Math.max(1.5, ((W - pad.l - pad.r) / series.length) * 0.7);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const line = series.map((p, i) => `${x(i)},${y(p.rolling)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Game score by game with a 5-game rolling average">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-court-700)" strokeWidth={t === 0 ? 1.2 : 0.6} />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--color-ink-500)" fontFamily="JetBrains Mono">
            {t}
          </text>
        </g>
      ))}
      {series.map((p, i) => {
        const top = Math.min(y(p.gmsc), y(0));
        const h = Math.abs(y(p.gmsc) - y(0));
        const col = p.won ? 'var(--color-win)' : 'var(--color-loss)';
        return (
          <rect key={i} x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1, h)} rx={1} fill={p.won ? col : 'none'} stroke={col} strokeWidth={1.2} opacity={0.85}>
            <title>{`Game ${p.n}: ${p.won ? 'W' : 'L'} vs ${opponentName(p.oppId)}${p.playoff ? ' (playoffs)' : ''} · ${p.pts} pts · game score ${p.gmsc.toFixed(1)}`}</title>
          </rect>
        );
      })}
      <polyline points={line} fill="none" stroke="var(--color-hoop-400)" strokeWidth={2} strokeLinejoin="round" />
      <text x={pad.l} y={H - 4} fontSize={9} fill="var(--color-ink-500)">
        Game 1
      </text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize={9} fill="var(--color-ink-500)">
        Game {series.length}
      </text>
    </svg>
  );
}

/** A labelled percentile bar (0-100) with the raw value alongside. */
export function PercentileBar({ label, value, pct }: { label: string; value: string; pct: number }) {
  const color = pct >= 80 ? 'var(--color-gold)' : pct >= 50 ? 'var(--color-hoop-500)' : 'var(--color-court-500)';
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-24 shrink-0 text-ink-400">{label}</span>
      <div className="relative h-2 flex-1 rounded-full bg-court-700">
        <div className="absolute top-0 left-1/2 h-full w-px bg-court-500" />
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
      <span className="w-12 text-right font-mono text-ink-100">{value}</span>
      <span className="w-12 text-right font-mono text-ink-500">{pct}th</span>
    </div>
  );
}
