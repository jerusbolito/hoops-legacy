/**
 * A plain-language check. Story text that leans on metaphor, simile and mood ("a heavy silence settled over the gym,
 * something shifted in her face") reads well in a sentence and tells the player nothing: who did what, and what it
 * means for them. This finds that kind of writing so it can be rewritten, and so the game's own text can be audited.
 *
 * Each pattern is a phrase a reader has to interpret instead of understand. Strong ones count double.
 */

interface Pattern {
  re: RegExp;
  weight: 1 | 2;
  /** What to say instead, shown to the model when it is asked to rewrite. */
  fix: string;
}

const P = (re: RegExp, weight: 1 | 2, fix: string): Pattern => ({ re, weight, fix });

const PATTERNS: Pattern[] = [
  // moods and personified things
  P(/\b(?:silence|quiet|stillness)\s+(?:settled|fell|hung|stretched|spoke|filled|grew|descended|pressed)\b/i, 2, 'say who stopped talking and why'),
  P(/\b(?:tension|pressure|doubt|fear|dread|anticipation)\s+(?:hung|hangs|settled|filled|crackled|thickened|built|coiled|rose|rolled)\b/i, 2, 'say what people are worried about'),
  P(/\bweight of\b/i, 2, 'say what the pressure actually is'),
  P(/\bhung (?:heavy |thick )?in the air\b|\bhangs? (?:heavy|thick)\b|\bthick with\b/i, 2, 'say what is going on instead'),
  P(/\b(?:settled|washed|swept|crashed|rolled)\s+over\b/i, 2, 'say what the person felt or did'),
  P(/\b(?:palpable|electric(?:ity)?|charged)\s+(?:tension|energy|atmosphere|air|silence)?\b|\belectric\b/i, 2, 'say what the crowd or room was doing'),
  P(/\b(?:spoke|speaks|said) volumes\b|\bsaid everything\b/i, 2, 'say what it showed'),
  P(/\bunspoken\b|\bunsaid\b|\bleft unsaid\b|\bwithout (?:saying|a) (?:a )?word\b/i, 1, 'say what was left unsaid'),
  P(/\b(?:the )?air (?:was|felt|grew|turned|became|crackled|shifted)\b/i, 1, 'say what the mood was and why'),
  // vague pointers
  P(/\bsomething (?:passed|shifted|changed|stirred|flickered|softened|hardened|cracked|settled|between you|in (?:his|her|their|your|its) (?:face|eyes|voice|expression|chest|look|smile))\b/i, 2, 'say what changed, in plain words'),
  P(/\ba look (?:passed|crossed|flickered)\b|\ba (?:flicker|flash|glimmer|hint|trace|ghost) of\b/i, 2, 'say what the look meant'),
  P(/\b(?:eyes|gaze|face)\s+(?:softened|hardened|darkened|clouded|unreadable|flickered)\b/i, 1, 'say what they were thinking'),
  P(/\bin a way that\b/i, 1, 'say what way'),
  // imagery
  P(/\b(?:symphony|tapestry|canvas|kaleidoscope|mosaic|whirlwind|rollercoaster|roller coaster|dance of)\b/i, 2, 'name the thing itself'),
  P(/\b(?:ocean|sea|wave|flood|storm|tide|avalanche|wall) of\b/i, 2, 'name the thing itself'),
  P(/\b(?:ghost|shadow|echo|whisper|spark|seed|fire|ember) of\b/i, 2, 'name the thing itself'),
  P(/\b(?:storm|fire|ice) (?:inside|within|brewing|in (?:his|her|their|your) (?:eyes|chest))\b/i, 2, 'say what they felt'),
  P(/\b(?:door|chapter|page) (?:was )?(?:closing|closed|closes|opening|opened)\b|\bclosing (?:a|the) (?:door|chapter)\b/i, 2, 'say what ended or began'),
  P(/\b(?:heart|stomach|chest|gut|throat|lungs?)\s+(?:dropped|sank|clenched|tightened|pounded|hammered|raced|leapt|skipped|twisted|lurched|fluttered)\b/i, 1, 'say how they felt'),
  // similes
  P(/\bas (?:if|though)\b/i, 2, 'say what actually happened'),
  P(/\bfeels? like\b|\bfelt like\b|\bfeeling like\b/i, 2, 'say how it feels without a comparison'),
  P(/\blike (?:a|an|the|some|someone|something|it was|nothing|everything)\b(?!\s+(?:to|that))/i, 1, 'drop the comparison and say the thing'),
  P(/\bas (?:cold|hot|heavy|light|sharp|loud|quiet|still|steady|smooth|tight) as\b/i, 2, 'drop the comparison'),
  P(/\b(?:almost|nearly|practically) (?:like|as if)\b/i, 1, 'drop the comparison'),
];

export interface PlainReport {
  /** Higher is more figurative or vague. */
  score: number;
  /** The phrases that were found, as written. */
  hits: string[];
  /** What to say instead, one line for each different kind of problem. */
  fixes: string[];
}

export function plainCheck(text: string): PlainReport {
  let score = 0;
  const hits: string[] = [];
  const fixes: string[] = [];
  for (const p of PATTERNS) {
    const g = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
    for (const m of text.matchAll(g)) {
      if (!m[0].trim()) continue;
      score += p.weight;
      const at = m.index ?? 0;
      hits.push(text.slice(Math.max(0, at - 10), at + m[0].length + 18).replace(/\s+/g, ' ').trim());
      if (!fixes.includes(p.fix)) fixes.push(p.fix);
    }
  }
  return { score, hits, fixes };
}

/** How figurative a passage can be before it is sent back for a rewrite. One stray comparison is fine; a pile is not. */
export const MODEL_LIMIT = 3;
/** The bar for text the game itself ships. Stricter, because there is no excuse. */
export const AUTHORED_LIMIT = 2;

/**
 * The message to send a model whose writing was too figurative, or null if it is plain enough.
 * Quotes the offending phrases so the rewrite fixes those and not the whole scene.
 */
export function plainProblem(...texts: (string | undefined)[]): string | null {
  const r = plainCheck(texts.filter(Boolean).join(' '));
  if (r.score < MODEL_LIMIT) return null;
  const quoted = r.hits.slice(0, 4).map((h) => `"${h}"`).join(', ');
  return `The writing is too figurative to follow: ${quoted}. Rewrite it in plain, literal language. State what happened, who said or did it, and what it means for the player. No metaphors, similes, or mood-setting. (${r.fixes.slice(0, 3).join('; ')}.) Keep everything else the same.`;
}
