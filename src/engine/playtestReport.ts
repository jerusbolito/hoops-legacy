/**
 * Builds the playtest dashboard: one self-contained HTML file (inline SVG, no dependencies) from the latest
 * run plus the history of earlier runs. Pure functions, so it is tested without playing a single career.
 */

export interface Row {
  name: string;
  count: number;
  mean: number;
  p10: number;
  p90: number;
  peak: number;
  titles: number;
  money: number;
  pro: number;
  hof: number;
}

export interface Run {
  ts: string;
  commit: string;
  n: number;
  strategies: Row[];
  archetypes: Row[];
  flags: string[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const n1 = (x: number) => x.toFixed(1);
const money = (x: number) => `$${(x / 1e6).toFixed(1)}M`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Rounds a maximum up to a tidy axis end. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function tipOf(r: Row): string {
  return `<b>${esc(r.name)}</b><br>Mean score ${n1(r.mean)} (p10 ${Math.round(r.p10)} to p90 ${Math.round(r.p90)})<br>Peak OVR ${n1(r.peak)} · Titles ${r.titles.toFixed(2)}<br>Earnings ${money(r.money)} · Reached pro ${pct(r.pro)} · HoF+ ${pct(r.hof)}`;
}

/** Horizontal bars of the mean with a p10 to p90 range, and an optional dashed baseline. */
export function barChart(rows: Row[], baseline?: { label: string; value: number }): string {
  const W = 760;
  const left = 130;
  const right = 64;
  const rowH = 38;
  const top = 8;
  const H = top + rows.length * rowH + 28;
  const max = niceMax(Math.max(1, ...rows.map((r) => r.p90), baseline?.value ?? 0));
  const x = (v: number) => left + (v / max) * (W - left - right);
  const parts: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    parts.push(`<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${H - 24}"/><text class="tick" x="${x(v)}" y="${H - 8}" text-anchor="middle">${Math.round(v)}</text>`);
  }
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    const bw = Math.max(2, x(r.mean) - left);
    parts.push(
      `<g class="hit" data-tip="${esc(tipOf(r))}"><rect class="hover" x="0" y="${cy - rowH / 2}" width="${W}" height="${rowH}"/>` +
        `<text class="lab" x="${left - 10}" y="${cy + 4}" text-anchor="end">${esc(r.name)}</text>` +
        `<path class="bar" d="M${left},${cy - 8}H${left + bw - 4}a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4H${left}z"/>` +
        `<line class="whisk" x1="${x(r.p10)}" x2="${x(r.p90)}" y1="${cy}" y2="${cy}"/><line class="whisk" x1="${x(r.p10)}" x2="${x(r.p10)}" y1="${cy - 5}" y2="${cy + 5}"/><line class="whisk" x1="${x(r.p90)}" x2="${x(r.p90)}" y1="${cy - 5}" y2="${cy + 5}"/>` +
        `<text class="val" x="${x(r.p90) + 8}" y="${cy + 4}">${n1(r.mean)}</text></g>`,
    );
  });
  if (baseline) parts.push(`<line class="base" x1="${x(baseline.value)}" x2="${x(baseline.value)}" y1="${top}" y2="${H - 24}"/><text class="tick" x="${x(baseline.value)}" y="${top + 8}" text-anchor="start" dx="4">${esc(baseline.label)}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mean legacy score by ${esc(rows.map((r) => r.name).join(', '))}">${parts.join('')}</svg>`;
}

/** Mean score per strategy across runs. */
export function trendChart(history: Run[]): string {
  const names: string[] = [];
  for (const r of history) for (const s of r.strategies) if (!names.includes(s.name)) names.push(s.name);
  if (history.length < 2) return `<p class="muted">The trend appears after two runs. This is run ${history.length}. Run the playtest again after your next change.</p>`;
  const W = 760;
  const H = 280;
  const L = 44;
  const R = 16;
  const T = 12;
  const B = 34;
  const vals = history.flatMap((r) => r.strategies.map((s) => s.mean));
  const max = niceMax(Math.max(...vals));
  const x = (i: number) => L + (i / (history.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const parts: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    parts.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`);
  }
  history.forEach((r, i) => parts.push(`<text class="tick" x="${x(i)}" y="${H - 12}" text-anchor="middle">${esc(r.commit || '#' + (i + 1))}</text>`));
  names.forEach((nm, k) => {
    const pts = history.map((r, i) => ({ i, s: r.strategies.find((q) => q.name === nm) })).filter((p) => p.s);
    parts.push(`<polyline class="line" style="stroke:var(--s${(k % 8) + 1})" points="${pts.map((p) => `${x(p.i)},${y(p.s!.mean)}`).join(' ')}"/>`);
    for (const p of pts) parts.push(`<circle class="dot" style="fill:var(--s${(k % 8) + 1})" cx="${x(p.i)}" cy="${y(p.s!.mean)}" r="4"/>`);
  });
  // one invisible column per run for the hover tooltip
  const colW = (W - L - R) / Math.max(1, history.length - 1);
  history.forEach((r, i) => {
    const tip = `<b>${esc(r.commit || 'run ' + (i + 1))}</b> · ${esc(r.ts.slice(0, 10))} · ${r.n} per row<br>` + r.strategies.map((s) => `${esc(s.name)} ${n1(s.mean)}`).join('<br>');
    parts.push(`<rect class="col" x="${x(i) - colW / 2}" y="${T}" width="${colW}" height="${H - T - B}" data-tip="${esc(tip)}"/>`);
  });
  const legend = names.map((nm, k) => `<span class="key"><i style="background:var(--s${(k % 8) + 1})"></i>${esc(nm)}</span>`).join('');
  return `<div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mean legacy score per strategy across runs">${parts.join('')}</svg>`;
}

function table(rows: Row[]): string {
  const body = rows.map((r) => `<tr><th>${esc(r.name)}</th><td>${n1(r.mean)}</td><td>${Math.round(r.p10)} / ${Math.round(r.p90)}</td><td>${n1(r.peak)}</td><td>${r.titles.toFixed(2)}</td><td>${money(r.money)}</td><td>${pct(r.pro)}</td><td>${pct(r.hof)}</td></tr>`).join('');
  return `<table><thead><tr><th></th><th>Mean score</th><th>p10 / p90</th><th>Peak OVR</th><th>Titles</th><th>Earnings</th><th>Reached pro</th><th>HoF+</th></tr></thead><tbody>${body}</tbody></table>`;
}

const CSS = `
:root{color-scheme:light;--bg:#fcfcfb;--card:#ffffff;--ink:#0b0b0b;--ink2:#52514e;--ink3:#6b6a66;--line:#e4e3df;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#6250d6;--s8:#e34948;--warn:#fab219;--crit:#d03b3b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#121211;--card:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--ink3:#9a998f;--line:#2e2e2b;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#0ca30c;--s7:#9085e9;--s8:#e66767}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#121211;--card:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--ink3:#9a998f;--line:#2e2e2b;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#0ca30c;--s7:#9085e9;--s8:#e66767}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:0 0 4px}
.muted{color:var(--ink3);margin:0 0 12px;font-size:13px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0}
svg{width:100%;height:auto;display:block}.grid{stroke:var(--line);stroke-width:1}.tick{fill:var(--ink3);font-size:11px}.lab{fill:var(--ink);font-size:13px}.val{fill:var(--ink2);font-size:12px;font-family:ui-monospace,monospace}
.bar{fill:var(--s1)}.whisk{stroke:var(--ink2);stroke-width:1.5}.base{stroke:var(--ink3);stroke-width:1.5;stroke-dasharray:5 4}.hover{fill:transparent}.hit:hover .hover{fill:color-mix(in srgb,var(--ink) 6%,transparent)}
.line{fill:none;stroke-width:2;stroke-linejoin:round}.dot{stroke:var(--card);stroke-width:2}.col{fill:transparent}.col:hover{fill:color-mix(in srgb,var(--ink) 6%,transparent)}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 8px;font-size:13px;color:var(--ink2)}.key i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
.flags{list-style:none;padding:0;margin:0}.flags li{padding:8px 0;border-top:1px solid var(--line)}.flags li:first-child{border-top:0}.badge{display:inline-block;font-size:11px;font-weight:700;border-radius:4px;padding:1px 6px;margin-right:8px;background:var(--warn);color:#241a00}.ok .badge{background:var(--s6);color:#fff}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:6px 8px;text-align:right;border-top:1px solid var(--line)}th:first-child,td:first-child{text-align:left}thead th{color:var(--ink3);font-weight:600;border-top:0}tbody th{font-weight:600}
details{margin-top:8px}summary{cursor:pointer;color:var(--ink2);font-size:13px}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12px;line-height:1.45;padding:8px 10px;border-radius:8px;max-width:280px;opacity:0;transition:opacity .08s;z-index:5}
`;

const JS = `
const tip=document.getElementById('tip');
function show(e){const t=e.target.closest('[data-tip]');if(!t){tip.style.opacity=0;return}
tip.innerHTML=t.dataset.tip;tip.style.opacity=1;const w=tip.offsetWidth,h=tip.offsetHeight;
let x=e.clientX+14,y=e.clientY+14;if(x+w>innerWidth-8)x=e.clientX-w-14;if(y+h>innerHeight-8)y=e.clientY-h-14;tip.style.left=x+'px';tip.style.top=y+'px'}
document.addEventListener('mousemove',show);document.addEventListener('mouseleave',()=>tip.style.opacity=0);
`;

export function renderReport(history: Run[]): string {
  const run = history[history.length - 1];
  if (!run) return '<!doctype html><title>Playtest</title><p>No runs yet.</p>';
  const random = run.strategies.find((s) => s.name === 'random');
  const flags = run.flags.length
    ? `<ul class="flags">${run.flags.map((f) => `<li><span class="badge">CHECK</span>${esc(f).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`).join('')}</ul>`
    : `<ul class="flags ok"><li><span class="badge">OK</span>No flags. Strategies are within 25% of random and archetypes within 30% of each other.</li></ul>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Playtest Report</title><style>${CSS}</style></head><body><main>
<h1>Playtest report</h1><p class="muted">Run ${history.length} · ${esc(run.ts.slice(0, 16).replace('T', ' '))} · commit ${esc(run.commit || 'unknown')} · ${run.n} careers per row, same seeds across strategies</p>
<section class="card"><h2>Flags</h2><p class="muted">Anything that looks like a dominant strategy, a trap, or a lopsided archetype.</p>${flags}</section>
<section class="card"><h2>Strategies</h2><p class="muted">Mean legacy score. Whiskers span the 10th to 90th percentile. Dashed line is the random baseline.</p>${barChart(run.strategies, random ? { label: 'random', value: random.mean } : undefined)}<details><summary>Table view</summary>${table(run.strategies)}</details></section>
<section class="card"><h2>Archetypes</h2><p class="muted">Same measure, random strategy, for each starting archetype.</p>${barChart(run.archetypes)}<details><summary>Table view</summary>${table(run.archetypes)}</details></section>
<section class="card"><h2>Across runs</h2><p class="muted">Mean score per strategy at each saved run, labelled by commit. A balance change should move lines on purpose, not by accident.</p>${trendChart(history)}</section>
</main><div id="tip" role="tooltip"></div><script>${JS}</script></body></html>`;
}
