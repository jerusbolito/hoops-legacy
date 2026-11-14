import { describe, expect, it } from 'vitest';
import { completeScene, createCareer, createUserGameSim, doTraining, finishUserGame, advanceWeek } from '../engine/career';
import { RNG } from '../engine/rng';
import type { ChatRequest, LLMClient } from '../llm/types';
import { extractJson, findStatViolations } from './parse';
import { generateRecap, generateScene, resolveScene } from './narrator';
import { pickScene } from './scenes';

function scripted(responses: string[]): LLMClient & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  return {
    calls,
    config: { presetId: 'test', kind: 'openai-compatible', baseUrl: 'x', apiKey: '', model: 'test' },
    async chat(req) {
      calls.push(req);
      const r = responses.shift();
      if (r === undefined) throw new Error('no more responses');
      return r;
    },
    async listModels() {
      return [];
    },
  };
}

const newGame = () =>
  createCareer({ firstName: 'Ty', lastName: 'Reed', hometown: 'Akron, OH', archetype: 'playmaker', position: 'PG', heightIn: 73, schoolIndex: 2, traits: [], seed: 77 });

describe('extractJson', () => {
  it('handles fences, prose and raw newlines in strings', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here it is: {"a": "line1\nline2",} hope that helps')).toEqual({ a: 'line1\nline2' });
  });
});

describe('findStatViolations', () => {
  const allowed = { pts: new Set([22, 8, 61]), reb: new Set([7]), ast: new Set([5]), stl: new Set([1]), blk: new Set([0]), scores: [61, 58] as [number, number] };
  it('flags invented stats and scores', () => {
    expect(findStatViolations('You dropped 22 points and 7 boards in a 61-58 win.', allowed)).toEqual([]);
    expect(findStatViolations('You dropped 31 points and 12 rebounds in a 70-58 win.', allowed)).toEqual(['31 points', '12 rebounds', '70-58']);
    expect(findStatViolations('A 3-point lead with two assists', allowed)).toEqual([]);
  });
});

describe('narrator', () => {
  it('repairs invalid JSON once, then validates choices and effects', async () => {
    const s = newGame();
    const plan = pickScene(s, new RNG(1));
    const client = scripted([
      'not json at all',
      JSON.stringify({ title: 'First Day', location: 'Gym', narration: 'The gym is loud and you are nervous as anything.', choices: [{ id: 1, text: 'Go hard', tone: 'bold' }, { id: 2, text: 'Stay quiet', tone: 'calm' }] }),
    ]);
    const scene = await generateScene(client, s, plan);
    expect(scene.source).toBe('ai');
    expect(scene.setup.choices.map((c) => c.id)).toEqual(['a', 'b']);
    expect(client.calls[1].messages.length).toBe(3); // original + bad reply + repair request

    const npc = plan.castIds[0];
    const res = await resolveScene(
      scripted([JSON.stringify({ narration: 'Coach nods slowly at you.', summary: 'You went hard.', effects: [{ type: 'rel', npc, field: 'respect', delta: 5 }, { type: 'bogus' }, { type: 'morale', delta: 'lots' }] })]),
      s,
      plan,
      scene.setup,
      scene.setup.choices[0],
    );
    expect(res.effects).toEqual([{ type: 'rel', npc, field: 'respect', delta: 5 }]);
    expect(res.invalidEffects).toBe(2);
  });

  it('falls back to a template when the model keeps failing', async () => {
    const s = newGame();
    const plan = pickScene(s, new RNG(2));
    const scene = await generateScene(scripted(['{}', '{"nope":true}']), s, plan);
    expect(scene.source).toBe('template');
    expect(scene.setup.choices.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects recaps that invent stats and falls back to the box score', async () => {
    const s = newGame();
    completeScene(s);
    advanceWeek(s);
    doTraining(s, 'passing');
    completeScene(s);
    const g = createUserGameSim(s)!;
    g.sim.runToEnd();
    const report = finishUserGame(s, g.sim, g.game);
    const bad = JSON.stringify({ headline: 'Big night', narration: 'You poured in 97 points in a 140-2 rout.', effects: [] });
    const recap = await generateRecap(scripted([bad, bad]), s, report, s.lastBox!.box);
    expect(recap.source).toBe('template');
    expect(recap.narration).toContain(`${report.teamScore}-${report.oppScore}`);
  });
});
