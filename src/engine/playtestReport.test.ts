import { describe, expect, it } from 'vitest';
import { barChart, renderReport, trendChart, type Row, type Run } from './playtestReport';

const row = (name: string, mean: number): Row => ({ name, count: 10, mean, p10: mean * 0.6, p90: mean * 1.4, peak: 80, titles: 1.5, money: 90e6, pro: 0.9, hof: 0.2 });
const run = (commit: string, a: number, flags: string[] = []): Run => ({ ts: '2026-11-18T12:00:00Z', commit, n: 10, strategies: [row('random', a), row('rotate', a * 1.1)], archetypes: [row('big', a), row('slasher', a * 1.2)], flags });

describe('playtest dashboard', () => {
  it('draws a bar and a hover tip for every row', () => {
    const svg = barChart([row('random', 50), row('rotate', 60)], { label: 'random', value: 50 });
    expect(svg.match(/class="bar"/g)).toHaveLength(2);
    expect(svg.match(/data-tip=/g)).toHaveLength(2);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('survives an all-zero run', () => {
    expect(barChart([row('flat', 0)])).not.toMatch(/NaN|Infinity/);
  });

  it('shows a trend only once there are two runs', () => {
    expect(trendChart([run('a1', 40)])).toMatch(/after two runs/);
    const t = trendChart([run('a1', 40), run('b2', 50)]);
    expect(t.match(/<polyline/g)).toHaveLength(2);
    expect(t).toMatch(/b2/);
    expect(t).not.toMatch(/NaN/);
  });

  it('escapes anything that came from a name or a flag', () => {
    const r = run('c3', 40, ['<script>alert(1)</script> **rotate** is high']);
    const html = renderReport([r]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('<b>rotate</b>');
  });

  it('is one self-contained page with a table view and both themes', () => {
    const html = renderReport([run('a1', 40), run('b2', 45, ['x'])]);
    expect(html).toContain('<details><summary>Table view');
    expect(html).toContain('prefers-color-scheme:dark');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain('Run 2');
  });
});
