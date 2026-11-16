import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LEVEL_CONFIG, yearLabel } from '../../data/teams';
import { userAthlete } from '../../engine/career';
import { ARCHETYPE_INFO, overall } from '../../engine/ratings';
import { averages, fmt1, totals } from '../../engine/stats';
import { RATING_KEYS, RATING_LABELS, type GameState } from '../../state/schemas';
import { useStore } from '../../state/store';
import { shade } from './color';
import { Portrait } from './Portrait';
import { Button } from './ui';

interface Tier {
  name: string;
  from: string;
  to: string;
  ink: string;
}

const TIERS: { min: number; tier: Tier }[] = [
  { min: 88, tier: { name: 'LEGEND', from: '#f472b6', to: '#7c3aed', ink: '#fff' } },
  { min: 78, tier: { name: 'DIAMOND', from: '#a5f3fc', to: '#0e7490', ink: '#04202b' } },
  { min: 65, tier: { name: 'GOLD', from: '#fde68a', to: '#b45309', ink: '#2b1a02' } },
  { min: 50, tier: { name: 'SILVER', from: '#e2e8f0', to: '#64748b', ink: '#0f172a' } },
  { min: 0, tier: { name: 'BRONZE', from: '#fdba74', to: '#7c2d12', ink: '#2b1002' } },
];

export const tierFor = (ovr: number): Tier => TIERS.find((t) => ovr >= t.min)!.tier;

interface CardData {
  name: string;
  position: string;
  archetype: string;
  ovr: number;
  age: number;
  teamAbbrev: string;
  teamName: string;
  colors: [string, string];
  levelLine: string;
  ratings: { label: string; value: number }[];
  ppg: number;
  rpg: number;
  apg: number;
  awards: number;
}

export function cardData(game: GameState): CardData {
  const a = userAthlete(game);
  const team = game.teams[game.career.teamId];
  const avg = averages(totals(game.gameLog));
  return {
    name: `${a.firstName} ${a.lastName}`,
    position: a.position,
    archetype: ARCHETYPE_INFO[a.archetype].label,
    ovr: overall(a.ratings),
    age: a.age,
    teamAbbrev: team.abbrev,
    teamName: `${team.name} ${team.mascot}`,
    colors: team.colors,
    levelLine: `${LEVEL_CONFIG[game.career.level].label} · ${yearLabel(game.career.level, game.career.year)}`,
    ratings: RATING_KEYS.map((k) => ({ label: RATING_LABELS[k], value: a.ratings[k] })),
    ppg: avg.ppg,
    rpg: avg.rpg,
    apg: avg.apg,
    awards: game.player.awards.length,
  };
}

/** Trading-card layout in pure SVG (no HTML), so the same markup can be exported as an image. */
export function PlayerCardSvg({ d }: { d: CardData }) {
  const t = tierFor(d.ovr);
  const W = 300;
  const H = 440;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${d.name} player card, ${t.name} tier, overall ${d.ovr}`}>
      <defs>
        <linearGradient id="pc-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.from} />
          <stop offset="1" stopColor={t.to} />
        </linearGradient>
        <linearGradient id="pc-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="20" fill="url(#pc-bg)" />
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="20" fill="url(#pc-shine)" />
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="14" fill="none" stroke={t.ink} strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="10" y="10" width={W - 20} height="150" rx="14" fill={d.colors[0]} fillOpacity="0.55" />
      <text x="24" y="52" fontSize="34" fontWeight="800" fill={t.ink} fontFamily="system-ui, sans-serif">
        {d.ovr}
      </text>
      <text x="24" y="68" fontSize="10" fontWeight="700" fill={t.ink} letterSpacing="2" fontFamily="system-ui, sans-serif">
        {d.position}
      </text>
      <text x={W - 24} y="30" textAnchor="end" fontSize="9" fontWeight="800" fill={t.ink} letterSpacing="2.5" fontFamily="system-ui, sans-serif">
        {t.name}
      </text>
      <rect x={W - 62} y="38" width="38" height="28" rx="6" fill={d.colors[0]} stroke={d.colors[1]} strokeWidth="2" />
      <text x={W - 43} y="57" textAnchor="middle" fontSize="12" fontWeight="800" fill={d.colors[1]} fontFamily="system-ui, sans-serif">
        {d.teamAbbrev}
      </text>
      <text x={W - 24} y="80" textAnchor="end" fontSize="9" fontWeight="800" fill={t.ink} letterSpacing="2" fontFamily="system-ui, sans-serif">
        AGE {d.age}
      </text>
      <svg x={W / 2 - 62} y="24" width="124" height="124" viewBox="0 0 124 124">
        <Portrait name={d.name} size={124} colors={d.colors} mood="happy" ring={t.ink} />
      </svg>
      <text x={W / 2} y="186" textAnchor="middle" fontSize="22" fontWeight="800" fill={t.ink} fontFamily="system-ui, sans-serif">
        {d.name.toUpperCase()}
      </text>
      <text x={W / 2} y="203" textAnchor="middle" fontSize="10" fontWeight="600" fill={t.ink} fillOpacity="0.75" letterSpacing="1.5" fontFamily="system-ui, sans-serif">
        {d.archetype.toUpperCase()} · {d.levelLine.toUpperCase()}
      </text>
      <line x1="28" x2={W - 28} y1="214" y2="214" stroke={t.ink} strokeOpacity="0.3" />
      {d.ratings.map((r, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 30 + col * 90;
        const y = 238 + row * 34;
        return (
          <g key={r.label}>
            <text x={x} y={y} fontSize="9" fontWeight="700" fill={t.ink} fillOpacity="0.7" letterSpacing="1" fontFamily="system-ui, sans-serif">
              {r.label}
            </text>
            <text x={x + 62} y={y} textAnchor="end" fontSize="14" fontWeight="800" fill={t.ink} fontFamily="system-ui, sans-serif">
              {r.value}
            </text>
            <rect x={x} y={y + 5} width="62" height="3" rx="1.5" fill={t.ink} fillOpacity="0.2" />
            <rect x={x} y={y + 5} width={(62 * r.value) / 99} height="3" rx="1.5" fill={t.ink} fillOpacity="0.85" />
          </g>
        );
      })}
      <rect x="22" y="346" width={W - 44} height="58" rx="10" fill={shade(t.to, -0.35)} fillOpacity="0.55" />
      {[
        ['PTS', fmt1(d.ppg)],
        ['REB', fmt1(d.rpg)],
        ['AST', fmt1(d.apg)],
        ['AWARDS', String(d.awards)],
      ].map(([k, v], i) => (
        <g key={k}>
          <text x={22 + 34 + i * 58} y="372" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
            {v}
          </text>
          <text x={22 + 34 + i * 58} y="388" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fillOpacity="0.75" letterSpacing="1.5" fontFamily="system-ui, sans-serif">
            {k}
          </text>
        </g>
      ))}
      <text x={W / 2} y="424" textAnchor="middle" fontSize="9" fontWeight="700" fill={t.ink} fillOpacity="0.7" letterSpacing="3" fontFamily="system-ui, sans-serif">
        HOOPS LEGACY · {d.teamName.toUpperCase()}
      </text>
    </svg>
  );
}

/** Renders the card to a PNG file the player can save and share. */
async function downloadCard(d: CardData) {
  const markup = renderToStaticMarkup(<PlayerCardSvg d={d} />);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = 300 * scale;
    canvas.height = 440 * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Could not create the image');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${d.name.replace(/\s+/g, '-').toLowerCase()}-card.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PlayerCardPanel() {
  const game = useStore((s) => s.game)!;
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const d = cardData(game);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-[300px] drop-shadow-xl">
        <PlayerCardSvg d={d} />
      </div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await downloadCard(d);
          } catch {
            toast('Could not save the card image in this browser.', 'bad');
          } finally {
            setBusy(false);
          }
        }}
      >
        Save card as image
      </Button>
    </div>
  );
}
