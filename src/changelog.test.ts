import { describe, expect, it } from 'vitest';
import { CHANGELOG, parseChangelog } from './changelog';

describe('the changelog', () => {
  it('reads releases, groups and items', () => {
    const e = parseChangelog('# t\n\n## 2.0.0\n\n### Big\n- one\n- two\n\n## 1.0.0\n- first\r\n');
    expect(e.map((x) => x.version)).toEqual(['2.0.0', '1.0.0']);
    expect(e[0].sections).toEqual([{ title: 'Big', items: ['one', 'two'] }]);
    expect(e[1].sections).toEqual([{ title: null, items: ['first'] }]);
  });

  it('ships with the game: newest first, and the newest matches package.json', async () => {
    const pkg = (await import('../package.json')).default as { version: string };
    expect(CHANGELOG.length).toBeGreaterThan(1);
    expect(CHANGELOG[0].version).toBe(pkg.version);
    for (const e of CHANGELOG) expect(e.sections.some((s) => s.items.length > 0)).toBe(true);
  });
});
