import { describe, expect, it } from 'vitest';
import { completeScene, createCareer, createUserGameSim, doTraining, finishUserGame, advanceWeek } from '../engine/career';
import { RNG } from '../engine/rng';
import type { ChatRequest, LLMClient } from '../llm/types';
import { extractJson, findStatViolations, scrubIds } from './parse';
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

describe('scrubIds', () => {
  it('removes internal ids a smaller model prints into a story, however it brackets them', () => {
    expect(scrubIds('Coach Meilin Rangel (npc_hsvcmq) is speaking while Salvatore Huffman (npc_1l8tdh4) leans back.')).toBe('Coach Meilin Rangel is speaking while Salvatore Huffman leans back.');
    expect(scrubIds('Coach Rangel [npc_hsvcmq] nods. Then {id: ath_ab12cd} waves.')).toBe('Coach Rangel nods. Then waves.');
    expect(scrubIds('You talk to npc_8p2ib7 about it.')).toBe('You talk to someone about it.');
    expect(scrubIds('(id=npc_abc123) Hello.')).toBe('Hello.');
    // glued to the word before it, and followed by the person's name
    expect(scrubIds('Salvatore is talking loudly withnpc_1l8tdh4, Salvatore Huffman. He looks tired.')).toBe('Salvatore is talking loudly with Salvatore Huffman. He looks tired.');
    expect(scrubIds('you noticenpc_1czjgjl and smile')).toBe('you notice someone and smile');
  });
  it('leaves ordinary writing alone', () => {
    const t = 'You stand in the locker room (it smells like tape). The score was 62-77, and the team_spirit was low.';
    expect(scrubIds(t)).toBe(t);
    expect(scrubIds('')).toBe('');
  });
});

describe('scenes with duplicate choices', () => {
  it('get one repair round, and the repaired scene is what the player sees', async () => {
    const s = newGame();
    const plan = pickScene(s, new RNG(5));
    const narration = 'Coach Reed gathers the team after practice and asks who wants to lead the next drill today.';
    const same = JSON.stringify({ title: 'After practice', location: 'Gym', narration, choices: [{ id: 'a', text: 'Shoot the ball myself.', tone: 'bold' }, { id: 'b', text: 'Shoot the ball myself.', tone: 'calm' }] });
    const fixed = JSON.stringify({ title: 'After practice', location: 'Gym', narration, choices: [{ id: 'a', text: 'Volunteer to lead the drill.', tone: 'bold' }, { id: 'b', text: 'Let a teammate go first.', tone: 'kind' }] });
    const client = scripted([same, fixed]);
    const out = await generateScene(client, s, plan);
    expect(out.source).toBe('ai');
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1].messages.map((m) => m.content).join(' ')).toMatch(/say the same thing/);
    expect(out.setup.choices.map((c) => c.text)).toEqual(['Volunteer to lead the drill.', 'Let a teammate go first.']);
  });
});

describe('story text from a model is cleaned before the player sees it', () => {
  it('scenes, resolutions and recaps never show an internal id', async () => {
    const s = newGame();
    const plan = pickScene(s, new RNG(5));
    const setup = JSON.stringify({ title: 'Locker room (npc_abc123)', location: 'Gym', narration: 'Coach Reed (npc_hsvcmq) talks about the next game with the whole team listening closely.', choices: [{ id: 'a', text: 'Listen to npc_zzzz99 carefully', tone: 'calm' }, { id: 'b', text: 'Speak up', tone: 'bold' }] });
    const out = await generateScene(scripted([setup]), s, plan);
    expect(out.source).toBe('ai');
    expect(JSON.stringify(out.setup)).not.toMatch(/(npc|ath)_[a-z0-9]{4}/);
    expect(out.setup.narration).toBe('Coach Reed talks about the next game with the whole team listening closely.');
    expect(out.setup.title).toBe('Locker room');
    const res = JSON.stringify({ narration: 'You nod at Coach (npc_hsvcmq) and he smiles slightly.', summary: 'You listened to (npc_hsvcmq) today.', effects: [] });
    const r = await resolveScene(scripted([res]), s, plan, out.setup, out.setup.choices[0]);
    expect(r.source).toBe('ai');
    expect(r.narration + r.summary).not.toMatch(/(npc|ath)_[a-z0-9]{4}/);
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
