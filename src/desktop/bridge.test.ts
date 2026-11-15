import { describe, expect, it } from 'vitest';
import { MODEL_CATALOG, SLOW_REPLY_SECONDS, fitNote, isValidSelection, lighterModel, modelInfo, recommendModel, repliesAreSlow, type Hardware } from './bridge';

const hw = (ramGB: number, gpuGB = 0, name = gpuGB ? 'NVIDIA GeForce RTX 4060' : '', integratedOnly = false): Hardware => ({ ramGB, gpuGB, gpuName: name, integratedOnly });

describe('the model catalog', () => {
  it('lists four tiers, biggest first, each with what it needs', () => {
    expect(MODEL_CATALOG.map((m) => m.id)).toEqual(['gemma-4-12b', 'gemma-4-e4b', 'gemma-4-e2b', 'qwen3-1.7b']);
    for (let i = 1; i < MODEL_CATALOG.length; i++) {
      const [big, small] = [MODEL_CATALOG[i - 1], MODEL_CATALOG[i]];
      expect(small.bytes).toBeLessThan(big.bytes);
      expect(small.minVramGB).toBeLessThanOrEqual(big.minVramGB);
      expect(small.minRamGB).toBeLessThanOrEqual(big.minRamGB);
      expect(small.cpuRamGB).toBeLessThanOrEqual(big.cpuRamGB);
    }
    for (const m of MODEL_CATALOG) {
      expect(m.label.length).toBeGreaterThan(3);
      expect(m.blurb.length).toBeGreaterThan(20);
      expect(m.minVramGB).toBeGreaterThan(0);
      expect(m.license).toMatch(/Apache/);
    }
    expect(new Set(MODEL_CATALOG.map((m) => m.id)).size).toBe(MODEL_CATALOG.length);
  });

  it('keeps the smallest model for very small computers, and does not retell facts with it', () => {
    expect(MODEL_CATALOG[MODEL_CATALOG.length - 1].bytes).toBeLessThan(1.5e9);
    expect(modelInfo('qwen3-1.7b')!.retell).toBe(false);
    for (const id of ['gemma-4-12b', 'gemma-4-e4b']) expect(modelInfo(id)!.retell).toBe(true);
    expect(modelInfo('gemma-4-e2b')!.retell).toBe(false);
  });

  it('accepts every catalog model as a selection and nothing else', () => {
    for (const m of MODEL_CATALOG) expect(isValidSelection({ provider: 'bundled', model: m.id })).toBe(true);
    expect(isValidSelection({ provider: 'bundled', model: 'gemma-3-1b' })).toBe(false);
    expect(isValidSelection({ provider: 'bundled', model: '../../etc/passwd' })).toBe(false);
  });
});

describe('which model to recommend', () => {
  it('goes by what the graphics card can hold, because that is what makes it fast', () => {
    expect(recommendModel(31, 15.6)).toBe('gemma-4-12b'); // a 16 GB card holds the biggest model whole
    expect(recommendModel(16, 12)).toBe('gemma-4-12b');
    expect(recommendModel(32, 8)).toBe('gemma-4-e4b'); // an 8 GB card cannot hold the 12B, so the next one down
    expect(recommendModel(16, 6)).toBe('gemma-4-e4b');
    expect(recommendModel(16, 4)).toBe('gemma-4-e2b');
    expect(recommendModel(16, 3)).toBe('gemma-4-e2b');
  });

  it('is not fooled by a lot of memory when the graphics card is small, or the computer has little memory around a good card', () => {
    // a big card in a computer with almost no memory is still limited by the memory
    expect(recommendModel(4, 16)).not.toBe('gemma-4-12b');
    expect(recommendModel(4, 8)).toBe('gemma-4-e2b');
  });

  it('aims lower with no usable graphics card, because the processor does the work several times slower', () => {
    expect(recommendModel(128, 0)).toBe('gemma-4-12b'); // measured: even on a fast 8-core processor the 4B takes over a minute a scene
    expect(recommendModel(64, 0)).toBe('gemma-4-e4b');
    expect(recommendModel(16, 0)).toBe('gemma-4-e2b');
    expect(recommendModel(8, 0)).toBe('gemma-4-e2b');
    expect(recommendModel(8, 2)).toBe('gemma-4-e2b');
  });

  it('always has an answer, down to the smallest model for the smallest computers', () => {
    expect(recommendModel(4, 0)).toBe('qwen3-1.7b');
    expect(recommendModel(2, 0)).toBe('qwen3-1.7b');
    expect(recommendModel(0, 0)).toBe('qwen3-1.7b');
    for (const [ram, gpu] of [[1, 0], [4, 0], [8, 0], [16, 0], [32, 0], [8, 4], [16, 8], [64, 24]]) expect(modelInfo(recommendModel(ram, gpu))).toBeDefined();
  });

  it('never recommends something bigger than the computer can run, at any size', () => {
    for (let ram = 2; ram <= 64; ram += 2) {
      for (const gpu of [0, 2, 4, 6, 8, 12, 16, 24]) {
        const m = modelInfo(recommendModel(ram, gpu))!;
        const fastOnGpu = gpu >= m.minVramGB && ram >= m.minRamGB * 0.6;
        const okOnCpu = ram >= m.cpuRamGB;
        expect(fastOnGpu || okOnCpu || m.id === 'qwen3-1.7b', `${ram} GB ram, ${gpu} GB gpu -> ${m.id}`).toBe(true);
      }
    }
  });
});

describe('what a model will be like on this computer', () => {
  const [big, mid, small, tiny] = MODEL_CATALOG;

  it('says fast when it fits on the graphics card', () => {
    const n = fitNote(big, hw(32, 16, 'NVIDIA GeForce RTX 5070 Ti'));
    expect(n.level).toBe('fast');
    expect(n.text).toContain('NVIDIA GeForce RTX 5070 Ti');
    expect(n.text).toContain('16 GB');
  });

  it('says so when it is too big for the card', () => {
    expect(fitNote(big, hw(32, 6)).text).toMatch(/Too big for your graphics card/);
    expect(fitNote(big, hw(32, 6)).level).toBe('slow');
    expect(fitNote(small, hw(16, 2)).level).toBe('ok');
    expect(fitNote(big, hw(10, 6)).level).toBe('slow');
  });

  it('is honest about running on the processor', () => {
    expect(fitNote(small, hw(16, 0)).level).toBe('ok');
    expect(fitNote(mid, hw(16, 0)).level).toBe('slow');
    expect(fitNote(small, hw(16, 0, 'Intel(R) UHD Graphics 770', true)).text).toMatch(/built-in graphics/);
    expect(fitNote(mid, hw(9, 0)).level).toBe('slow');
    expect(fitNote(mid, hw(9, 0)).text).toMatch(/slowly/);
  });

  it('warns when there is not enough memory at all', () => {
    const n = fitNote(big, hw(4, 0));
    expect(n.level).toBe('tight');
    expect(n.text).toMatch(/4 GB/);
    expect(fitNote(small, hw(3, 0)).level).toBe('tight');
    expect(fitNote(tiny, hw(4, 0)).level).not.toBe('tight');
  });
});

describe('noticing when replies are too slow', () => {
  it('suggests the next model down, and nothing below the smallest', () => {
    expect(lighterModel('gemma-4-12b')!.id).toBe('gemma-4-e4b');
    expect(lighterModel('gemma-4-e4b')!.id).toBe('gemma-4-e2b');
    expect(lighterModel('gemma-4-e2b')!.id).toBe('qwen3-1.7b');
    expect(lighterModel('qwen3-1.7b')).toBeUndefined();
    expect(lighterModel('something-else')).toBeUndefined();
  });

  it('waits for three slow replies in a row, so one slow first load does not set it off', () => {
    const slow = SLOW_REPLY_SECONDS + 5;
    expect(repliesAreSlow([])).toBe(false);
    expect(repliesAreSlow([slow, slow])).toBe(false);
    expect(repliesAreSlow([slow, slow, slow])).toBe(true);
    // the first reply after loading is always slow: later ones are fine
    expect(repliesAreSlow([60, 3, 4])).toBe(false);
    expect(repliesAreSlow([3, 4, 60])).toBe(false);
    // two slow out of the last three is still slow (the middle one decides)
    expect(repliesAreSlow([3, slow, slow])).toBe(true);
    // old history does not count
    expect(repliesAreSlow([slow, slow, slow, 3, 3, 3])).toBe(false);
  });
});
