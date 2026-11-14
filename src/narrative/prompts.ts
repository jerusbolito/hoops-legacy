export const SYSTEM_PROMPT = `You are the narrator of HOOPS LEGACY, a text-based basketball career RPG. The player starts as a high-school freshman and may go all the way to the pros.

VOICE
- Second person, present tense ("You catch the outlet...").
- Grounded, cinematic sports drama with heart and humor. Think a prestige sports film. PG-13: no graphic content.
- Concrete sensory detail: squeaking sneakers, gym smell, buzz of a phone. Short paragraphs.
- NPCs speak in distinct voices that match their personality, their relationship values with the player, and what they remember.

HARD RULES
- A game engine owns all facts: ratings, stats, scores, records, standings, injuries, contracts. Use ONLY the numbers given to you. Never invent statistics, scores, or records. If you are unsure of a number, do not mention it.
- You never decide who wins games or how the player performs in a game; the engine does.
- Keep continuity with the story so far, open storylines, and character memories.
- Only reference characters by the ids given. You may introduce at most one new non-player character (coach, agent, reporter, family member, friend, love interest) with an npc_new effect. You may NOT create new players or teammates.
- Relationships change gradually. Effects you propose are suggestions; the engine clamps them (relationship ±15 per field per scene, at most +1 total to ratings per scene, reputation ±5, morale ±15).
- Respond with ONE JSON object and nothing else. No markdown fences.`;

export const EFFECTS_DOC = `EFFECTS you may propose (array "effects"; each one is an object):
{"type":"rel","npc":"<npc id>","field":"affinity|respect|trust|rivalry|romance","delta":<int -15..15>}
{"type":"morale","delta":<int -15..15>}
{"type":"energy","delta":<int -15..15>}
{"type":"rating","key":"shooting|finishing|handles|passing|defense|rebounding|athleticism|iq|stamina","delta":<-1|1>}  (rare: only for a genuinely formative moment)
{"type":"reputation","delta":<int -5..5>}
{"type":"followers","delta":<int>}
{"type":"money","delta":<int dollars>}
{"type":"academics","delta":<number -0.2..0.2>}
{"type":"flag","key":"<snake_case>","value":<string|number|boolean>}  (durable story facts, e.g. "dating_maya": true)
{"type":"memory","npc":"<npc id>","text":"<what this character will remember about this moment, <= 20 words>"}
{"type":"npc_new","name":"<full name>","role":"coach|family|friend|love_interest|agent|media|scout|mentor|other","title":"<short descriptor>","personality":["<trait>","<trait>"]}
{"type":"arc_open","title":"<storyline name>","stakes":"<one sentence>","npcs":["<npc id>"]}
{"type":"arc_close","id":"<arc id>","outcome":"<one sentence>"}`;

export function sceneSetupPrompt(context: string, kind: string, brief: string): string {
  return `${context}

SCENE TO WRITE
Type: ${kind}
Brief: ${brief}

Write the opening of this scene and stop at a decision point for the player.
- 120-220 words of narration. Feature the listed characters naturally.
- End with a clear dilemma. Offer 3 or 4 distinct choices with different tones (e.g. bold, kind, calm, funny, aggressive, sly, honest). Choices are short first-person actions or lines (max 18 words).
- Do not resolve the scene yet.

Return JSON:
{"title":"<3-6 word scene title>","location":"<short place>","narration":"<text>","choices":[{"id":"a","text":"<choice>","tone":"<tone>"},...]}`;
}

export function sceneResolvePrompt(context: string, setup: { title: string; narration: string }, choiceText: string): string {
  return `${context}

CURRENT SCENE: "${setup.title}"
${setup.narration}

THE PLAYER CHOSE: "${choiceText}"

Write what happens next and close the scene (80-180 words). Consequences should feel earned: bold choices can backfire, kindness can be exploited, honesty can cost something. Then propose the state changes this scene causes.

${EFFECTS_DOC}

Guidance: usually 2-5 effects. Always add memory effects for featured characters who would remember this moment. Open a storyline only for something with real future stakes. Close an open storyline only if this scene truly resolves it.

Return JSON:
{"narration":"<text>","summary":"<one sentence recap for the story log>","effects":[...]}`;
}

export interface RecapFacts {
  header: string;
  ourTop: string[];
  theirTop: string[];
  moments: string[];
  userLine: string;
}

export function recapPrompt(context: string, f: RecapFacts): string {
  return `${context}

GAME FACTS (from the engine; these are the ONLY numbers you may use)
${f.header}
Your line: ${f.userLine}
Top performers (your team): ${f.ourTop.join('; ')}
Top performers (opponent): ${f.theirTop.join('; ')}
Key moments you played:
${f.moments.length ? f.moments.map((m) => `- ${m}`).join('\n') : '- (none)'}

Write a short post-game scene (90-160 words): the final buzzer feeling, one key moment, and a brief interaction afterwards with a character (teammate, coach, rival, family). Then a newspaper-style headline (max 10 words).
Use ONLY numbers from GAME FACTS. You may propose 0-3 effects (only rel, morale, reputation, followers, memory, flag).

${EFFECTS_DOC}

Return JSON:
{"headline":"<headline>","narration":"<text>","effects":[...]}`;
}

export function seasonSummaryPrompt(context: string, facts: string): string {
  return `${context}

SEASON FACTS
${facts}

Write a 2-3 sentence summary of this season of the player's story for the long-term memory of the narrator: the key relationships, turning points, and how it ended. Use only facts given.

Return JSON: {"summary":"<text>"}`;
}

export function flavorPrompt(context: string, situation: string, words = '80-140'): string {
  return `${context}

MOMENT: ${situation}

Write this moment as a vivid scene (${words} words). Do not invent any statistics. Return JSON: {"narration":"<text>"}`;
}
