# Hoops Legacy

A text-based basketball career RPG that runs entirely in the browser. You start as a high-school freshman and play through college, the draft, a pro career, and retirement. Story scenes are written by an LLM that the player brings (their own API key, or a local model). Every number in the game — ratings, box scores, standings, contracts — is computed by a deterministic engine, not by the model.

## Quick start

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

On first load you'll see the **Story Engine** setup screen. Pick a provider, paste a key, choose a model, and hit **Test connection**. To try the game without a key, choose **Offline demo (no AI)**. It uses built-in template scenes and is fully playable.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm test` | Run all Vitest tests once |
| `npx vitest` | Tests in watch mode |
| `npm run typecheck` | TypeScript check, no output files |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build locally |

There is no backend. `dist/` is a static site you can host anywhere.

## How it works

### The core rule: the engine owns the facts

The LLM narrates and *proposes* changes. It never directly changes state. The flow for every story scene is:

1. The **engine picks** what kind of scene happens (rivalry week, practice, family, date, …) based on the calendar and relationships.
2. The **narrator** sends the model a compact snapshot of the game (player, season, featured characters with their relationship values and memories, recent story beats) and asks for a scene with 3–4 choices, as JSON.
3. The player picks a choice. The model writes the outcome and returns a list of proposed **effects** (e.g. `+5 respect with Coach`, `open a storyline`).
4. **`applyEffects`** validates each effect, clamps it to per-scene caps, applies it, and logs it. Anything invalid is dropped.

Games work the other way around: the engine simulates them, and the model only writes the recap, with a fact-check against the box score.

### Project layout

```
src/
  engine/      Pure TypeScript game rules. No React, no network.
  narrative/   Prompt building, response parsing/validation, templates.
  llm/         Provider adapters behind one interface.
  state/       Zod schemas (the save format), Zustand store, IndexedDB persistence.
  ui/          React screens, panels, views, components.
  data/        Team templates, level configs, name pools.
```

### Engine (`src/engine/`)

| File | Responsibility |
| --- | --- |
| `rng.ts` | Seeded PRNG (mulberry32). Its state is stored in the save as `rngState`, so a saved game replays identically. |
| `gameSim.ts` | Possession-by-possession game simulation. Produces full box scores and a play-by-play feed, and pauses at **key moments** (3 in regulation + up to 2 clutch moments) for the player to choose an action. The displayed odds are the real odds: the outcome is decided by `roll < odds`. |
| `league.ts` | Round-robin schedule, standings, quick-sim of other games, playoff bracket, league-wide stat totals. |
| `career.ts` | The calendar / phase machine, career creation, awards, roster turnover, level transitions (HS → college → pro), recruiting, draft, free agency. |
| `progression.ts` | Weekly training, summer development, aging curves, injuries, energy recovery. |
| `effects.ts` | `applyEffects()`: the only place narrative-driven changes are applied. Caps live in `SCENE_CAPS` / `GAME_CAPS`. |
| `stats.ts` | Averages and season rows computed from the game log (stats are always derived, never stored as running totals). |
| `ratings.ts`, `generate.ts` | Overall rating formula, archetypes, player/team/NPC generation. |

**The weekly loop.** During the season each week has four steps, stored in `career.step`:

```
training → scene → game → done   (then advanceWeek)
```

Phases (`career.phase`) advance like this:

```
preseason → regular → playoffs → offseason ─┬→ (next season, same level)
                                            ├→ recruiting → college preseason   (after HS year 4)
                                            ├→ draft → pro preseason             (college year 4 or declared early)
                                            ├→ free_agency → next pro season     (contract expired)
                                            └→ retired
```

Persistent characters (your rival, your best friend) follow you up through the levels if they're good enough to make it.

### Narrative (`src/narrative/`)

| File | Responsibility |
| --- | --- |
| `scenes.ts` | `pickScene()` chooses the scene type and featured cast. |
| `context.ts` | Builds the text snapshot of game state sent with every prompt. |
| `prompts.ts` | The system prompt and per-request prompt templates. Edit here to change tone. |
| `narrator.ts` | Calls the model, validates JSON with Zod, gives the model **one repair attempt** with the validation error, then falls back to templates. Also runs the recap **stat fact-check**. |
| `parse.ts` | JSON extraction (handles code fences, prose around JSON, raw newlines in strings) and the stat-claim checker. |
| `templates.ts` | Offline/fallback scene text and tone-based effects. |

The recap fact-check (`findStatViolations`) looks for claims like "27 points", "11 boards" or "61-58" and rejects any number that doesn't appear in the real box score.

### LLM providers (`src/llm/`)

All providers implement `LLMClient` (`chat()` and `listModels()`):

- `anthropic.ts` uses the official `@anthropic-ai/sdk` in browser mode. Defaults to `claude-opus-5-5` with `effort: "low"` for fast turns, and turns on server-side refusal fallbacks for models that support them.
- `openaiCompatible.ts` covers OpenAI, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Ollama, LM Studio, and any custom `/chat/completions` endpoint. If an endpoint rejects JSON mode or `max_tokens`, it retries once without them.
- `gemini.ts` uses the Google Generative Language REST API.
- `presets.ts` lists providers and their base URLs, and detects the provider from the key prefix. Detection only applies until the player clicks a provider, because many providers share OpenAI's `sk-` format.

`client.ts` adds retry with backoff for rate limits, server errors and network failures.

### State and saves (`src/state/`)

- `schemas.ts` defines the whole save format as Zod schemas. `GameState` is the root. Bump `SAVE_VERSION` if you make an incompatible change.
- `store.ts` is the Zustand store. All game-state changes go through `mutate()`, which clones the state, applies the change, and autosaves.
- `persistence.ts` stores saves in **IndexedDB** (via Dexie, database `hoops-legacy`, table `saves`). Each row is one career. Saves are validated with Zod on load and import.
- The LLM config (including the API key) is stored separately in `localStorage`, or in `sessionStorage` if "Remember on this device" is off. It is never part of a save or an export.

Saves persist across browser restarts, but they belong to the exact origin, including the port. Saves made at `localhost:5173` won't show up at `localhost:5174`. Private windows and "clear site data" wipe them. Use **Export** on the title screen for a JSON backup.

## Debugging

### Without spending tokens

Use **Offline demo (no AI)** to exercise the whole game loop with template text. Anything that breaks there is an engine or UI bug, not a model problem.

### Inspecting game state

- **Saved state:** DevTools → Application → IndexedDB → `hoops-legacy` → `saves`. Each row's `state` field is the full `GameState`.
- **Export a save** from the title screen and read the JSON. You can also edit it and re-import it to set up a scenario. Import validates against the schema and tells you which field is wrong.
- **What the story changed:** the **Story** tab's change log lists every effect that was applied (after clamping). Effects that were *rejected* (unknown character, over a cap, invalid type) are returned by `applyEffects()` but not shown in the UI. Log `r.rejected` in `choose()` in `store.ts` if you need to see them.

### Debugging the AI

- **DevTools → Network** shows every request to the provider and the raw model response.
- An orange **template** badge on a scene or recap means the AI call failed or returned invalid output twice, and the game fell back to built-in text. A toast shows the error message.
- If recaps keep falling back to templates, the model is probably inventing stats. Check the response in the Network tab for numbers that aren't in the box score.
- **Local models (Ollama / LM Studio)** must allow browser requests (CORS):
  - Ollama: `OLLAMA_ORIGINS="*" ollama serve`
  - LM Studio: Developer → Start Server, with CORS enabled.
- **"Could not list models"** under the Model field usually means a wrong base URL, a bad key, or a CORS block. You can always type the model id manually.

### Debugging the engine

The engine is pure and seeded, so the fastest way to investigate a bug is a test:

```ts
import { createCareer } from './career';

const s = createCareer({
  firstName: 'Test', lastName: 'Player', hometown: 'Oakland, CA',
  archetype: 'slasher', position: 'SG', heightIn: 76,
  schoolIndex: 0, traits: [], seed: 123,   // same seed → same career
});
```

`src/engine/career.test.ts` has a `tick()` helper that auto-plays the calendar with default choices. Copy it to play forward to the point you care about.

```bash
npx vitest run src/engine/gameSim.test.ts   # one file
npx vitest run -t "clamps"                  # tests whose name matches
npx vitest                                  # watch mode
```

What the tests guarantee:

- **Box scores add up:** player points equal the team score, made shots never exceed attempts, and five players are on court all game.
- **Scoring is realistic:** average scores land in sane ranges per level (HS ≈ 60, college ≈ 72, pro ≈ 103).
- **Sims are deterministic:** the same seed gives the same game.
- **The career never gets stuck:** a full career auto-plays from HS to retirement.
- **Effects are clamped:** invalid or oversized LLM effects are capped or rejected.
- **The narrative layer recovers:** JSON repair, template fallback, and recap fact-checking all work.

### Known limitations

- Reloading during a game or a scene replays it from the start. The live sim and the current scene are not saved.
- Model responses are not streamed. The typewriter effect plays after the full response arrives.
- Trades are not implemented.
- Zod 3 has a known memory-exhaustion advisory for oversized inputs (the worst case is that importing a malicious save freezes the tab). Upgrading to Zod 4 is a breaking change and hasn't been done yet.

## Tuning the game

| What | Where |
| --- | --- |
| Quarter length, pace, roster size, rating means, playoff size per level | `LEVEL_CONFIG` in `src/data/teams.ts` |
| Shot, turnover, foul and rebound odds | `shotOdds()` and `runPossession()` in `src/engine/gameSim.ts` |
| Training gains, aging, injuries | `src/engine/progression.ts` |
| How much one scene can change relationships/ratings | `SCENE_CAPS` in `src/engine/effects.ts` |
| Which scenes appear and how often | `POOL` in `src/narrative/scenes.ts` |
| Narrator voice and rules | `SYSTEM_PROMPT` in `src/narrative/prompts.ts` |
| Starting ratings and potential of the player and rival | `createCareer()` / `seedHighSchoolCast()` in `src/engine/career.ts` |

After changing sim odds, run `npm test`. The scoring-range test will tell you if games became unrealistic.
