import { TIER_LABELS } from '../../engine/legacyScore';
import type { Legend } from '../../state/schemas';

export const TIER_COLORS = ['#94a3b8', '#7dd3fc', '#4ade80', '#fbbf24', '#fb923c', '#f472b6'];

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export interface CardModel {
  name: string;
  tier: number;
  tierLabel: string;
  score: number;
  subtitle: string;
  stats: { label: string; value: string }[];
  line: string;
  summary: string;
  footer: string;
}

/** Everything the picture says, as plain data, so it can be checked without a canvas. */
export function cardModel(l: Legend): CardModel {
  const tier = Math.max(0, Math.min(TIER_LABELS.length - 1, l.tier));
  const bits = [l.position, l.hometown, l.firstSeason === l.lastSeason ? `Season ${l.firstSeason}` : `Seasons ${l.firstSeason}-${l.lastSeason}`].filter(Boolean);
  const honors = [l.titles && plural(l.titles, 'title'), l.mvps && plural(l.mvps, 'MVP'), l.allStars && plural(l.allStars, 'All-Star')].filter(Boolean);
  return {
    name: l.name,
    tier,
    tierLabel: l.tierLabel || TIER_LABELS[tier],
    score: Math.round(l.score),
    subtitle: bits.join(' · '),
    stats: [
      { label: 'PPG', value: l.ppg.toFixed(1) },
      { label: 'RPG', value: l.rpg.toFixed(1) },
      { label: 'APG', value: l.apg.toFixed(1) },
      { label: 'PEAK OVR', value: String(l.peakOverall) },
      { label: 'SEASONS', value: String(l.seasons) },
      { label: 'EARNINGS', value: money(l.earnings) },
    ],
    line: honors.length ? honors.join(' · ') : 'Every legend starts somewhere',
    summary: l.summary,
    footer: l.generation > 1 ? `Generation ${l.generation} · Come Up` : 'Come Up',
  };
}

export const CARD_W = 1080;
export const CARD_H = 1350;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[\s.,;:]*$/, '') + '…';
    return kept;
  }
  return lines;
}

/** Paints the card onto a canvas of CARD_W x CARD_H. */
export function drawCard(ctx: CanvasRenderingContext2D, m: CardModel) {
  const color = TIER_COLORS[m.tier];
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  g.addColorStop(0, '#0b1220');
  g.addColorStop(1, '#16223a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // glow in the tier colour
  const glow = ctx.createRadialGradient(CARD_W / 2, 360, 20, CARD_W / 2, 360, 620);
  glow.addColorStop(0, `${color}55`);
  glow.addColorStop(1, `${color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = `${color}88`;
  ctx.lineWidth = 6;
  ctx.strokeRect(36, 36, CARD_W - 72, CARD_H - 72);

  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = '600 34px Inter, system-ui, sans-serif';
  ctx.fillText(m.tierLabel.toUpperCase().split('').join(' '), CARD_W / 2, 130);

  ctx.fillStyle = '#f8fafc';
  let size = 104;
  ctx.font = `700 ${size}px Oswald, Impact, sans-serif`;
  while (ctx.measureText(m.name.toUpperCase()).width > CARD_W - 160 && size > 48) {
    size -= 4;
    ctx.font = `700 ${size}px Oswald, Impact, sans-serif`;
  }
  ctx.fillText(m.name.toUpperCase(), CARD_W / 2, 270);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 32px Inter, system-ui, sans-serif';
  ctx.fillText(m.subtitle, CARD_W / 2, 330);

  ctx.fillStyle = color;
  ctx.font = '700 230px Oswald, Impact, sans-serif';
  ctx.fillText(String(m.score), CARD_W / 2, 590);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.fillText('LEGACY SCORE', CARD_W / 2, 640);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 40px Inter, system-ui, sans-serif';
  ctx.fillText(m.line, CARD_W / 2, 730);

  // stat grid, three across
  const cw = (CARD_W - 160) / 3;
  m.stats.forEach((s, i) => {
    const x = 80 + (i % 3) * cw + cw / 2;
    const y = 830 + Math.floor(i / 3) * 140;
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 64px Oswald, Impact, sans-serif';
    ctx.fillText(s.value, x, y);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 24px Inter, system-ui, sans-serif';
    ctx.fillText(s.label, x, y + 36);
  });

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'italic 400 30px Inter, system-ui, sans-serif';
  wrap(ctx, m.summary, CARD_W - 200, 3).forEach((ln, i) => ctx.fillText(ln, CARD_W / 2, 1140 + i * 44));

  ctx.fillStyle = '#475569';
  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.fillText(m.footer.toUpperCase(), CARD_W / 2, CARD_H - 70);
}

/** Renders the card to a PNG. Browser only. */
export async function renderCard(l: Legend): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  try {
    await Promise.all([document.fonts.load('700 100px Oswald'), document.fonts.load('400 30px Inter')]);
  } catch {
    /* system fonts will do */
  }
  drawCard(ctx, cardModel(l));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image'))), 'image/png'));
}

/** Shares the card with the system share sheet when it can take files, otherwise downloads it. */
export async function shareCard(l: Legend): Promise<'shared' | 'downloaded'> {
  const blob = await renderCard(l);
  const file = new File([blob], `${l.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-legacy.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `${l.name}: ${m(l)}` });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

const m = (l: Legend) => `${l.tierLabel || TIER_LABELS[l.tier]}, ${Math.round(l.score)} legacy points`;
