import { afterEach, describe, expect, it, vi } from 'vitest';
import { configFromPreset, presetById } from './presets';
import { openAICompatibleClient } from './openaiCompatible';
import type { LLMConfig } from './types';

const ok = (content = '{"ok":true}') => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const bad = (msg: string) => new Response(msg, { status: 400 });

function stubFetch(...responses: Response[]) {
  const calls: Record<string, unknown>[] = [];
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)));
      return queue.shift() ?? ok();
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const local = (extra: Partial<LLMConfig> = {}): LLMConfig => ({ ...configFromPreset(presetById('ollama'), '', 'gemma4:12b'), baseUrl: 'http://127.0.0.1:11434/v1', ...extra });
const req = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }], json: true };

describe('local engine replies', () => {
  it('asks a local model not to think by default, so scenes come back several times faster', async () => {
    const calls = stubFetch();
    await openAICompatibleClient(local()).chat(req);
    expect(calls[0].reasoning_effort).toBe('none');
    expect(calls[0].response_format).toEqual({ type: 'json_object' });
  });

  it('does the same for the built-in model', async () => {
    const calls = stubFetch();
    await openAICompatibleClient({ ...configFromPreset(presetById('bundled'), '', 'gemma-4-12b'), baseUrl: 'http://127.0.0.1:50000/v1' }).chat(req);
    expect(calls[0].reasoning_effort).toBe('none');
    expect(calls[0].response_format).toEqual({ type: 'json_object' });
  });

  it('lets the player keep the model’s full reasoning', async () => {
    const calls = stubFetch();
    await openAICompatibleClient(local({ fastReplies: false })).chat(req);
    expect(calls[0].reasoning_effort).toBeUndefined();
  });

  it('never sends it to cloud providers', async () => {
    vi.stubGlobal('location', { origin: 'http://127.0.0.1:38417' }); // OpenRouter adds a referer header from the page address
    for (const id of ['openai', 'groq', 'openrouter', 'lmstudio']) {
      const calls = stubFetch();
      await openAICompatibleClient({ ...configFromPreset(presetById(id), 'k', 'm'), baseUrl: 'https://example.test/v1' }).chat(req);
      expect(calls[0].reasoning_effort, id).toBeUndefined();
    }
  });

  it('stops sending it, and carries on, if a server rejects it', async () => {
    const calls = stubFetch(bad('unknown field: reasoning_effort'), ok('{"a":1}'));
    const client = openAICompatibleClient(local());
    expect(await client.chat(req)).toBe('{"a":1}');
    expect(calls).toHaveLength(2);
    expect(calls[0].reasoning_effort).toBe('none');
    expect(calls[1].reasoning_effort).toBeUndefined();
    // and it remembers, so later requests do not trip over it again
    const later = stubFetch();
    await client.chat(req);
    expect(later[0].reasoning_effort).toBeUndefined();
  });

  it('still handles the older failures (JSON mode not supported) the way it always did', async () => {
    const calls = stubFetch(bad('response_format is not supported'), ok());
    await openAICompatibleClient(local()).chat(req);
    expect(calls[1].response_format).toBeUndefined();
  });

  it('turns an unreachable engine into a clear error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    await expect(openAICompatibleClient(local()).chat(req)).rejects.toThrow(/Could not reach 127\.0\.0\.1:11434/);
  });
});
