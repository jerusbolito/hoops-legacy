import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createCareer } from '../engine/career';
import { lifeRefs } from '../engine/lifeEvents';
import { RNG } from '../engine/rng';
import { playUntil } from '../engine/testkit';
import type { ChatRequest, LLMClient } from '../llm/types';
import { narrateResult, numbersMatch } from '../narrative/narrator';
import { useStore } from './store';

function scripted(responses: (string | Error)[]): LLMClient & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  return {
    calls,
    config: { presetId: 'test', kind: 'openai-compatible', baseUrl: 'x', apiKey: '', model: 'test' },
    async chat(req) {
      calls.push(req);
      const r = responses.shift();
      if (r === undefined) throw new Error('no more responses');
      if (r instanceof Error) throw r;
      return r;
    },
    async listModels() {
      return [];
    },
  };
}

const make = (seed: number) => createCareer({ firstName: 'Nr', lastName: `Test${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });
const say = (t: string) => JSON.stringify({ narration: t });

describe('the narrator retells what the engine decided', () => {
  it('only accepts a retelling that keeps the engine\'s numbers', () => {
    expect(numbersMatch('You paid $5,000 and felt lighter.', 'You spend $5,000 on it.')).toBe(true);
    expect(numbersMatch('You paid $9,000 and felt lighter.', 'You spend $5,000 on it.')).toBe(false);
    expect(numbersMatch('You hand it over and walk away.', 'The owner thanks you.')).toBe(true);
    expect(numbersMatch('Three weeks out, then 14 days of rehab.', 'You are cleared after 3 weeks.')).toBe(false);
  });

  it('uses the retelling, falls back when it invents a number, and falls back with no AI or a failing one', async () => {
    const s = make(1);
    const facts = 'You return the wallet. The owner presses $50 into your hand.';
    expect(await narrateResult(scripted([say('You hand the wallet back, and the owner insists you take $50.')]), s, 'A lost wallet', 'Return it', facts)).toBe('You hand the wallet back, and the owner insists you take $50.');
    expect(await narrateResult(scripted([say('You hand it back and get $500 for it.')]), s, 'A lost wallet', 'Return it', facts)).toBe(facts);
    expect(await narrateResult(null, s, 'A lost wallet', 'Return it', facts)).toBe(facts);
    expect(await narrateResult(scripted([new Error('boom')]), s, 'A lost wallet', 'Return it', facts)).toBe(facts);
    const mock = scripted([say('Should never be used.')]);
    mock.config = { ...mock.config, kind: 'mock' } as typeof mock.config;
    expect(await narrateResult(mock, s, 'A lost wallet', 'Return it', facts)).toBe(facts);
    expect(mock.calls).toHaveLength(0);
  });

  it('tells the player\'s own choice and tells the model the facts are fixed', async () => {
    const s = make(2);
    const client = scripted([say('You do it.')]);
    await narrateResult(client, s, 'A lost wallet', 'Return it', 'You return the wallet.');
    const prompt = client.calls[0].messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('The player chose: "Return it"');
    expect(prompt).toContain('these facts are fixed');
    expect(prompt).toContain('You return the wallet.');
  });

  it('a random moment shows the engine\'s text at once, then the retelling replaces it', async () => {
    const s = make(3);
    playUntil(s, new RNG(3), (x) => x.career.phase === 'regular' && x.career.week >= 3 && !x.career.lifeEvent);
    s.career.lifeEvent = { id: 'found_wallet', seed: 4, refs: lifeRefs(s) };
    useStore.setState({ game: s, screen: 'game', lifeOutcome: null, client: scripted([say('You find the owner on the next block and put the wallet in their hands.')]) });
    await useStore.getState().answerLife('return');
    const out = useStore.getState().lifeOutcome!;
    expect(out.title).toBe('A lost wallet');
    expect(out.text).toBe('You find the owner on the next block and put the wallet in their hands.');
    expect(out.lines.length).toBeGreaterThan(0); // the real effects are still the engine's
    expect(useStore.getState().game!.career.lifeEvent).toBeNull();
  });

  it('with no AI the engine\'s own text stands', async () => {
    const s = make(4);
    playUntil(s, new RNG(4), (x) => x.career.phase === 'regular' && x.career.week >= 3 && !x.career.lifeEvent);
    s.career.lifeEvent = { id: 'found_wallet', seed: 4, refs: lifeRefs(s) };
    useStore.setState({ game: s, screen: 'game', lifeOutcome: null, client: null });
    await useStore.getState().answerLife('return');
    expect(useStore.getState().lifeOutcome!.text.length).toBeGreaterThan(20);
    expect(useStore.getState().lifeOutcome!.text).not.toBe('');
  });
});
