import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL_CATALOG, type Hardware, type InstalledModel } from '../desktop/bridge';
import { useStore } from '../state/store';
import { SlowModelBanner } from './components/SlowModelBanner';
import { InstalledList, ModelChooser, hardwareLine } from './screens/DesktopSetup';

// Server rendering reads a store's initial snapshot, so the screens get a hook that reads the live state instead.
vi.mock('../state/store', async (orig) => {
  const actual = await orig<typeof import('../state/store')>();
  const hook = Object.assign(<T,>(selector: (s: ReturnType<typeof actual.useStore.getState>) => T) => selector(actual.useStore.getState()), actual.useStore);
  return { ...actual, useStore: hook };
});

const plain = (html: string) => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const hw = (ramGB: number, gpuGB: number, gpuName = 'NVIDIA GeForce RTX 4060', integratedOnly = false): Hardware => ({ ramGB, gpuGB, gpuName, integratedOnly });
const onDesktop = () => vi.stubGlobal('window', { hoopsDesktop: {} });
const model = (o: Partial<InstalledModel> = {}): InstalledModel => ({ id: 'gemma-4-e4b', label: 'Gemma 4 E4B', bytes: 5e9, source: 'downloaded', partial: false, inUse: false, ...o });

afterEach(() => {
  vi.unstubAllGlobals();
  useStore.setState({ llm: null, replySeconds: [], slowDismissed: false });
});

describe('the model chooser', () => {
  it('shows every model up front with its size, and marks the one picked for this computer', () => {
    const html = plain(renderToString(h(ModelChooser, { sel: 'gemma-4-e4b', onSelect: () => {}, hardware: hw(16, 8), installed: [], recommended: 'gemma-4-e4b' })));
    for (const m of MODEL_CATALOG) {
      expect(html).toContain(m.label);
      expect(html).toContain(`${(m.bytes / 1e9).toFixed(1)} GB`);
    }
    expect(html.match(/Best for this computer/g)).toHaveLength(1);
    expect(html).toContain('to download');
    expect(html).not.toMatch(/NaN|undefined|\[object/);
  });

  it('says what each model will be like here, and which are already downloaded or in use', () => {
    const html = plain(renderToString(h(ModelChooser, { sel: 'gemma-4-12b', onSelect: () => {}, hardware: hw(32, 16), installed: [model({ id: 'gemma-4-12b', label: 'Gemma 4 12B' }), model({ id: 'gemma-4-e2b', partial: true })], recommended: 'gemma-4-12b', activeId: 'gemma-4-12b' })));
    expect(html).toContain('In use');
    expect(html).toContain('on disk');
    expect(html).not.toContain('Downloaded'); // the one in use shows "In use"; the partial file is not a finished download
    expect(html).toContain('RTX 4060');
  });

  it('draws before the computer has been checked', () => {
    const html = plain(renderToString(h(ModelChooser, { sel: 'gemma-4-12b', onSelect: () => {}, hardware: null, installed: [], recommended: null })));
    expect(html).toContain('Checking this computer');
  });

  it('describes the computer in plain words', () => {
    expect(hardwareLine(hw(32, 15.6, 'NVIDIA GeForce RTX 5070 Ti'))).toBe('32 GB of memory · NVIDIA GeForce RTX 5070 Ti, 16 GB');
    expect(hardwareLine(hw(8, 0, '', true))).toContain('built-in graphics only');
    expect(hardwareLine(hw(8, 0, ''))).toContain('no separate graphics card');
  });
});

describe('the list of downloaded models', () => {
  it('shows what is using space, and that uninstalling clears it but keeps careers', () => {
    const html = plain(renderToString(h(InstalledList, { installed: [model(), model({ id: 'gemma-4-12b', label: 'Gemma 4 12B', bytes: 7e9, inUse: true })], onDelete: async () => {}, error: null })));
    expect(html).toContain('Gemma 4 E4B');
    expect(html).toContain('Models use 12.0 GB');
    expect(html).toContain('Uninstalling the game removes downloaded models too, and keeps your saved careers');
    expect(html).toContain('In use');
  });

  it('cannot delete the model in use or one that came with the app', () => {
    const html = renderToString(h(InstalledList, { installed: [model({ inUse: true }), model({ id: 'gemma-4-e2b', source: 'with-app' })], onDelete: async () => {}, error: null }));
    expect(html.match(/disabled=""/g)?.length).toBe(2);
    expect(plain(html)).toContain('Came with the app');
  });

  it('offers to finish clearing a download that stopped partway', () => {
    const html = plain(renderToString(h(InstalledList, { installed: [model({ partial: true, bytes: 2e9 })], onDelete: async () => {}, error: null })));
    expect(html).toContain('stopped partway');
  });

  it('says so when nothing is downloaded, and shows an error', () => {
    expect(plain(renderToString(h(InstalledList, { installed: [], onDelete: async () => {}, error: null })))).toContain('No models are downloaded');
    expect(plain(renderToString(h(InstalledList, { installed: [model()], onDelete: async () => {}, error: 'Could not delete' })))).toContain('Could not delete');
  });
});

describe('the "replies are slow" nudge', () => {
  const setup = (model: string, seconds: number[], extra: object = {}) => {
    useStore.setState({ llm: { presetId: 'bundled', model } as never, replySeconds: seconds, slowDismissed: false, ...extra });
  };
  const slow = [40, 42, 38];

  it('offers the next model down after three slow replies', () => {
    onDesktop();
    setup('gemma-4-12b', slow);
    const html = plain(renderToString(h(SlowModelBanner)));
    expect(html).toContain('about 40 seconds');
    expect(html).toContain('Switch to Gemma 4 E4B');
    expect(html).toContain('Not now');
  });

  it('stays quiet when replies are fast, after a dismissal, on the smallest model, off the desktop, or with another provider', () => {
    onDesktop();
    setup('gemma-4-12b', [3, 4, 5]);
    expect(renderToString(h(SlowModelBanner))).toBe('');
    setup('gemma-4-12b', slow, { slowDismissed: true });
    expect(renderToString(h(SlowModelBanner))).toBe('');
    setup('qwen3-1.7b', slow);
    expect(renderToString(h(SlowModelBanner))).toBe('');
    useStore.setState({ llm: { presetId: 'ollama', model: 'gemma-4-12b' } as never, replySeconds: slow });
    expect(renderToString(h(SlowModelBanner))).toBe('');
    vi.unstubAllGlobals();
    setup('gemma-4-12b', slow);
    expect(renderToString(h(SlowModelBanner))).toBe('');
  });
});
