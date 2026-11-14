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

### Deploying on Vercel

Import the repo at vercel.com/new. Vite is auto-detected (build `npm run build`, output `dist`). The app includes `@vercel/analytics` and `@vercel/speed-insights` (see `src/ui/App.tsx`). They only report page views and web-vitals, never game data or API keys. They do nothing until you enable **Analytics** and **Speed Insights** in the project's Vercel dashboard tabs and redeploy; on other hosts or locally they are harmless no-ops. Ad blockers may block them, so treat the numbers as a lower bound.

#### Security headers (`vercel.json`)

`vercel.json` sets a Content-Security-Policy and related headers on every response:

- `script-src 'self'` stops any injected or third-party script from running. This is the main protection for API keys stored in the browser. Vercel's analytics scripts are served from your own domain, so they are allowed.
- `connect-src` allows any `https:` host plus `http://localhost` / `127.0.0.1`. It has to be this wide because players can enter custom provider URLs and local models (Ollama, LM Studio). That is the one part that can't be tightened.
- `frame-ancestors 'none'` / `X-Frame-Options: DENY` stop other sites from embedding the game. `nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera, mic, location off) and HSTS cover the basics.
- `style-src` allows `'unsafe-inline'` because React and Framer Motion set inline `style` attributes, and Google Fonts for the typefaces.

Vercel only applies these after a deploy, so test changes by serving `dist/` with the same headers. Watch for `Refused to ...` messages in DevTools. If you add a new external service (analytics, fonts, a CDN, images from another site), you must allow its domain in the matching directive or the browser will silently block it. Do not add `upgrade-insecure-requests`: it would break local models, which are served over plain `http://localhost`.

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
| `nameBook.ts` | Hands out every name in the game and remembers it. Guarantees no repeated full names, no repeated first or last names across a league (so no two players share a surname), and never generates a famous real person. **Anything that needs a name must draw it from a `NameBook`** (build one from existing state with `NameBook.fromState(state)`), never straight from the pools. |

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

### Visuals (`src/ui/components/`)

Everything visual is drawn in code (inline SVG, canvas, Framer Motion). There are no image files or external assets, which keeps the page compatible with the strict Content-Security-Policy below.

| What | File | Notes |
| --- | --- | --- |
| Portraits | `Portrait.tsx` | A face generated deterministically from a person's name (same name, same face everywhere). Team colors give a jersey; `mood` (`happy`/`neutral`/`angry`/`sad`) changes the expression. `looks.ts` picks the mood from the character's relationship values. `Avatar` in `ui.tsx` wraps it. |
| Scene banners | `SceneBanner.tsx` | An illustrated backdrop (gym, arena, locker room, classroom, home, city night, press room, treatment room) tinted with the player's team colors. `ENV_BY_KIND` maps each scene `kind` to one. **If you add a scene type in `narrative/scenes.ts`, add it here too**, or it falls back to the gym. |
| Reveal cards | `RevealOverlay.tsx`, `Confetti.tsx`, `state/reveals.ts` | Full-screen moments: draft night, college commitment, championship, awards, contract signing, and the end-of-season highlight card. Reveals are queued in the store (`pushReveals`) and shown one at a time. To add a new one, add a variant to `RevealData`, a card component, and push it from the store action where it happens. |
| Game screen | `panels/GamePanel.tsx`, `Court.tsx` | Shot arcs, `+N` score pops, a momentum bar with run detector (`currentRun` in `engine/highlights.ts`), a "CLUTCH TIME" cinematic with screen shake, and a postgame "Play of the game" card (`pickHighlight`). |
| Progress | `panels/TrainingResultCard.tsx`, `RatingsRadar.tsx` | Training report with animated bars, tier-up toasts when a skill crosses a named band (`ratingTier` in `engine/ratings.ts`: Raw, Developing, Solid, Good, Great, Elite, Legend), and pulses on the radar chart. |

Everything respects `prefers-reduced-motion`: confetti, screen shake, arcs, count-ups and looping animations are skipped, and cards appear with their final values.

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
- **Live store handle:** in dev (and in a production build made with `VITE_EXPOSE_STORE=1`) the Zustand store is available in the browser console as `window.__hoops`. For example, `__hoops.getState().game` shows the whole game state, and you can preview any reveal card without playing to it:
  `__hoops.getState().pushReveals([{ kind: 'champion', teamName: 'Westbrook High', mascot: 'Wolves', abbrev: 'WBH', colors: ['#2563eb', '#f8fafc'], record: '9-0', level: 'hs', season: 1 }])`
  A normal production build does not include this handle.
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
- **Names stay unique:** no first, last or full name repeats within a league, through every season, level change, draft and free agency (`src/engine/names.test.ts`).
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
| Which backdrop a scene gets | `ENV_BY_KIND` in `src/ui/components/SceneBanner.tsx` |
| Face styles, skin and hair palettes | `src/ui/components/Portrait.tsx` |
| Name pools (first, last, female first), and the list of real people to never generate | `src/data/names.ts` |
| Skill tier names and thresholds | `RATING_TIERS` in `src/engine/ratings.ts` |
| Narrator voice and rules | `SYSTEM_PROMPT` in `src/narrative/prompts.ts` |
| Starting ratings and potential of the player and rival | `createCareer()` / `seedHighSchoolCast()` in `src/engine/career.ts` |

After changing sim odds, run `npm test`. The scoring-range test will tell you if games became unrealistic.
