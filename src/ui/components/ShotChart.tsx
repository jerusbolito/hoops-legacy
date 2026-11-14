import { ZONES, type ZoneStat } from '../../engine/analytics';

const CW = 300;
const CH = 230;
const BX = CW / 2;
const BY = 26;

/** Point at distance r and angle (degrees) from the basket, in the same space the simulator uses. */
const zonePoint = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [BX + Math.sin(a) * r * 0.95 * 300, BY + Math.cos(a) * r * 300 * 0.68];
};

function sectorPath(r: [number, number], a: [number, number]): string {
  const steps = Math.max(2, Math.round(Math.abs(a[1] - a[0]) / 6));
  const outer = Array.from({ length: steps + 1 }, (_, i) => zonePoint(r[1], a[0] + ((a[1] - a[0]) * i) / steps));
  const inner = Array.from({ length: steps + 1 }, (_, i) => zonePoint(r[0], a[1] - ((a[1] - a[0]) * i) / steps));
  return `M ${[...outer, ...inner].map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L ')} Z`;
}

/** Blue (cold) to orange (hot), against what is normal for that part of the floor. Every zone is also labeled, so color is never the only signal. */
function heat(delta: number): string {
  const t = Math.max(-1, Math.min(1, delta / 0.2));
  return t >= 0 ? `rgba(249,115,22,${0.25 + t * 0.6})` : `rgba(56,189,248,${0.25 + -t * 0.6})`;
}

/** Half-court shot chart: each zone shaded hot or cold against its normal FG%, labeled with makes/attempts. */
export function ShotChart({ zones, total }: { zones: ZoneStat[]; total: number }) {
  if (!total) return <p className="text-sm text-ink-500">Your shot chart fills in as you play. Shots from games before this feature are not included.</p>;
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full rounded-lg" style={{ background: 'linear-gradient(180deg,#3b2a1a,#2b1f14)' }} role="img" aria-label="Shot chart by zone">
      <g stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} fill="none">
        <rect x={4} y={4} width={CW - 8} height={CH - 8} />
        <rect x={BX - 36} y={4} width={72} height={110} />
        <circle cx={BX} cy={114} r={36} />
        <circle cx={BX} cy={BY} r={6} stroke="#f97316" strokeWidth={2} />
        <line x1={BX - 18} y1={BY - 8} x2={BX + 18} y2={BY - 8} strokeWidth={2.5} stroke="rgba(255,255,255,0.7)" />
      </g>
      {zones.map((s) => {
        const def = ZONES.find((z) => z.id === s.zone.id)!;
        const [lx, ly] = zonePoint((def.r[0] + def.r[1]) / 2, (def.a[0] + def.a[1]) / 2);
        const labelY = def.id === 'rim' ? BY + 26 : ly;
        return (
          <g key={s.zone.id}>
            <path d={sectorPath(def.r, def.a)} fill={s.att ? heat(s.delta) : 'rgba(255,255,255,0.03)'} stroke="rgba(255,255,255,0.18)" strokeWidth={0.8}>
              <title>{`${s.zone.label}: ${s.made}/${s.att}${s.att ? ` (${Math.round(s.pct * 100)}%)` : ''}`}</title>
            </path>
            {s.att > 0 && (
              <text x={lx} y={labelY} textAnchor="middle" fontSize={9} fontFamily="JetBrains Mono" fill="#fff" stroke="rgba(0,0,0,0.55)" strokeWidth={2.4} paintOrder="stroke" fontWeight={700}>
                {Math.round(s.pct * 100)}%
                <tspan x={lx} dy={10} fontSize={7.5} fontWeight={400}>
                  {s.made}/{s.att}
                </tspan>
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Legend for the heat colors. */
export function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
      <span>Cold</span>
      <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(56,189,248,0.85), rgba(255,255,255,0.12), rgba(249,115,22,0.85))' }} />
      <span>Hot</span>
      <span>compared with a normal shooter from that spot</span>
    </div>
  );
}
