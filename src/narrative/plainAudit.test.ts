/**
 * Everything the game writes itself has to be plain: no metaphor, no mood-setting, nothing the player has to decode.
 * This runs the plain-language check over the life events (the situation and what every choice leads to), the character
 * profiles and the fallback scenes, and fails with the lines that need rewriting.
 */
import { describe, expect, it } from 'vitest';
import { PROFILES, PROFILE_SCENES } from '../engine/characters';
import { CHECK_IN, IDLE, REACT, ROLE_CHECK_IN } from '../engine/characterLife';
import { makeNpc } from '../engine/generate';
import { createCareer, withRng } from '../engine/career';
import { lifeEventDefs, lifeEventView, lifeRefs, resolveLifeEvent } from '../engine/lifeEvents';
import { RNG } from '../engine/rng';
import { playUntil } from '../engine/testkit';
import type { GameState, Level } from '../state/schemas';
import { AUTHORED_LIMIT, plainCheck } from './plain';
import { DILEMMAS, OPENERS, TONE_EFFECTS } from './templates';

interface Line {
  source: string;
  text: string;
}

function collect(): Line[] {
  const out: Line[] = [];
  const add = (source: string, text: string | undefined) => {
    if (text) out.push({ source, text });
  };
  for (const p of PROFILES) for (const k of ['blurb', 'want', 'flaw', 'soft', 'voice', 'memory'] as const) add(`profile ${p.id}.${k}`, p[k]);
  for (const [id, kinds] of Object.entries(PROFILE_SCENES)) for (const [kind, v] of Object.entries(kinds)) (add(`scene ${id}/${kind} opener`, v?.opener), add(`scene ${id}/${kind} dilemma`, v?.dilemma));
  for (const [style, moods] of Object.entries(REACT)) for (const [mood, lines] of Object.entries(moods)) lines?.forEach((t, i) => add(`message ${style}/${mood}#${i}`, t));
  for (const [id, lines] of Object.entries(IDLE)) lines.forEach((t, i) => add(`message idle ${id}#${i}`, t));
  for (const [role, lines] of Object.entries(ROLE_CHECK_IN)) lines?.forEach((t, i) => add(`message check-in ${role}#${i}`, t));
  for (const [style, lines] of Object.entries(CHECK_IN)) lines.forEach((t, i) => add(`message check-in ${style}#${i}`, t));
  for (const [k, v] of Object.entries(OPENERS)) v.forEach((t, i) => add(`opener ${k}#${i}`, t));
  for (const [k, v] of Object.entries(DILEMMAS)) add(`dilemma ${k}`, v);
  for (const [k, v] of Object.entries(TONE_EFFECTS)) add(`tone ${k}`, v.narration);

  // every life event, at every level it can happen at, and what each choice leads to
  const seen = new Set<string>();
  for (const level of ['hs', 'college', 'pro'] as Level[]) {
    const s: GameState = createCareer({ firstName: 'Pl', lastName: 'Ain', hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed: 21 });
    playUntil(s, new RNG(21), (x) => x.career.level === level && x.career.phase === 'regular' && x.career.week >= 2 && !x.career.lifeEvent);
    // make sure everyone an event can be about is in the room, so none of them are skipped
    for (const role of ['agent', 'media', 'scout', 'love_interest', 'family', 'coach', 'friend', 'teammate', 'rival'] as const) {
      if (!Object.values(s.npcs).some((n) => n.role === role && n.active)) {
        const n = makeNpc(new RNG(role.length), { name: `Sam ${role}`, role, title: role, season: 1 });
        s.npcs[n.id] = n;
      }
    }
    const refs = lifeRefs(s);
    for (const def of lifeEventDefs().filter((d) => d.levels.includes(level))) {
      if ((def.need ?? []).some((r) => !refs[r])) continue;
      const st = structuredClone(s);
      st.player.money = 5_000_000;
      st.career.lifeEvent = { id: def.id, seed: 11, refs };
      const view = lifeEventView(st)!;
      if (!seen.has(`${def.id}:text`)) {
        seen.add(`${def.id}:text`);
        add(`event ${def.id} text`, view.text);
      }
      for (const o of view.options) {
        const key = `${def.id}:${o.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        add(`event ${def.id} / ${o.id} label`, o.label);
        for (const seed of [3, 4, 5, 6]) {
          const t = structuredClone(st);
          const r = withRng(t, (rng) => ((rng.state = seed * 977), resolveLifeEvent(t, rng, o.id)));
          if (r && !seen.has(`${key}:${r.text}`)) {
            seen.add(`${key}:${r.text}`);
            add(`event ${def.id} / ${o.id} result`, r.text);
          }
        }
      }
    }
  }
  return out;
}

describe('plain language', () => {
  it('everything the game writes itself is plain', () => {
    const lines = collect();
    expect(lines.length).toBeGreaterThan(600);
    const bad = lines.map((l) => ({ ...l, r: plainCheck(l.text) })).filter((l) => l.r.score >= AUTHORED_LIMIT);
    if (process.env.AUDIT) console.log(bad.map((b) => `[${b.r.score}] ${b.source}: ${b.text}\n      -> ${b.r.hits.join(' | ')}`).join('\n'));
    expect(bad.map((b) => `${b.source}: ${b.r.hits.join(' | ')}`)).toEqual([]);
  }, 120_000);
});
