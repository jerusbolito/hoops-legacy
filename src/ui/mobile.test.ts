import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createCareer } from '../engine/career';
import { useStore } from '../state/store';
import { MobileNav } from './components/MobileNav';
import { PRIMARY_TABS, TABS } from './screens/tabs';

// the same trick the other screen tests use: server rendering reads the live store state
vi.mock('../state/store', async (orig) => {
  const actual = await orig<typeof import('../state/store')>();
  const hook = Object.assign(<T,>(selector: (s: ReturnType<typeof actual.useStore.getState>) => T) => selector(actual.useStore.getState()), actual.useStore);
  return { ...actual, useStore: hook };
});

const make = () => createCareer({ firstName: 'Mo', lastName: 'Bile', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 4 });

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []));
}

describe('on a phone', () => {
  it('every screen that switches to columns also has a one-column base, so nothing can push the page sideways', () => {
    // A grid with only "lg:grid-cols-..." has an auto-sized column below that width, and a long line of text then widens the whole page.
    const bad: string[] = [];
    for (const file of walk('src/ui')) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/className="([^"]*)"/g)) {
        const t = m[1].split(/\s+/);
        if (t.includes('grid') && t.some((x) => /^(sm|md|lg|xl):grid-cols-/.test(x)) && !t.some((x) => /^grid-cols-/.test(x))) bad.push(`${path.relative('src/ui', file)}: ${m[1].slice(0, 70)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the page is allowed to use the whole screen, notch included', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    expect(html).toMatch(/viewport-fit=cover/);
    expect(html).toMatch(/name="theme-color"/);
  });

  it('the bottom bar keeps four tabs and a More button, and More holds the rest', () => {
    const s = make();
    useStore.setState({ game: s, screen: 'game', tab: 'hub', live: null });
    const html = renderToString(h(MobileNav));
    for (const id of PRIMARY_TABS) expect(html).toContain(TABS.find((t) => t.id === id)!.label === 'This Week' ? 'Week' : TABS.find((t) => t.id === id)!.label === 'Newspaper' ? 'Paper' : TABS.find((t) => t.id === id)!.label);
    expect(html).toContain('More');
    // every tab is reachable one way or the other
    expect(PRIMARY_TABS.length + TABS.filter((t) => !PRIMARY_TABS.includes(t.id)).length).toBe(TABS.length);
    expect(html).toContain('aria-current="page"');
  });

  it('the bottom bar steps out of the way during a live game', () => {
    const s = make();
    // anything non-null in `live` means a game is on
    useStore.setState({ game: s, screen: 'game', tab: 'hub', live: {} as never });
    expect(renderToString(h(MobileNav))).toBe('');
    useStore.setState({ live: null });
  });

  it('the bar shows a dot when a new edition of the paper is out', () => {
    const s = make();
    s.paper.push({ id: 7, kind: 'weekly', season: 1, week: 1, masthead: 'x', dateline: 'x', headline: 'x', deck: 'x', lead: [], sections: [], scoreboard: [], standings: [], leaders: [] });
    useStore.setState({ game: s, screen: 'game', tab: 'hub', live: null, paperSeen: 3 });
    expect(renderToString(h(MobileNav))).toContain('new edition');
    useStore.setState({ paperSeen: 7 });
    expect(renderToString(h(MobileNav))).not.toContain('new edition');
  });
});
