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
- `style-src` allows `'unsafe-inline'` because React and Framer Motion set inline `style` attributes. Fonts are bundled with the game (`@fontsource`), so nothing is loaded from Google.

Vercel only applies these after a deploy, so test changes by serving `dist/` with the same headers. Watch for `Refused to ...` messages in DevTools. If you add a new external service (analytics, fonts, a CDN, images from another site), you must allow its domain in the matching directive or the browser will silently block it. Do not add `upgrade-insecure-requests`: it would break local models, which are served over plain `http://localhost`.

## Desktop app (a model that runs on your computer)

The same game, packaged as a Windows/macOS/Linux app that brings its own storyteller: a language model that runs on your own computer, so there is no key, no account and nothing leaves your machine. By default it uses **Gemma 4 12B** (Apache-2.0), run by [llama.cpp](https://github.com/ggml-org/llama.cpp)'s `llama-server`. You do not need Ollama. If you already have it, you can choose it instead under **Advanced**.

```bash
npm run desktop           # build the game and shell, then open the app (needs the engine and model, see below)
npm run desktop:engine    # download the pinned engine for this computer into build/engine/
npm run desktop:model     # download the model (7 GB, checked against its checksum) into build/models/
npm run desktop:pack      # an unpacked app folder in release/ (fast, to test the packaged app)
npm run desktop:dist      # the standard installer in release/ (about 200 MB; the model downloads on first launch)
npm run desktop:dist:full # the model inside the app: release/full/, about 7.5 GB, a zip, works offline at once
npm run typecheck         # also checks the desktop code
```

### Two ways to ship it

| | Standard | Full |
| --- | --- | --- |
| Size | about 200 MB installer | about 7.5 GB zip |
| First launch | asks, then downloads the model once (about 7 GB) | works immediately, offline |
| Windows format | installer (NSIS) | zip. NSIS cannot hold more than 2 GB |
| Use it for | most players, a website download | USB drives, offline machines, Steam or itch.io depots |

Both ship the same engine. The model file is looked for next to the app first and in the player's data folder second, so a download made by the standard build is found by either. `--model=gemma-4-e4b` on `node scripts/pack.mjs --full` ships a smaller model (5.2 GB) or `gemma-4-e2b` (3.4 GB).

### What happens on launch

The app serves the game from a fixed local address (`http://127.0.0.1:38417`), so saves stay in the same place every time. `DesktopSetup` (`src/ui/screens/DesktopSetup.tsx`) then gets the model ready on every launch, because the engine gets a new private port each time:

1. **Find** the engine program and the model file. If the model is missing it explains and asks before downloading.
2. **Download** (if needed) with real progress. It resumes if interrupted, and the finished file is checked against a pinned SHA-256 before it is used. A damaged file is deleted, never run.
3. **Start** the engine and wait for the model to load. It tries the graphics-card build (Vulkan: NVIDIA, AMD and Intel) and falls back to the CPU build if that will not start, and shows what the engine said if nothing does.
4. **Connect**: the game is pointed at the engine's address, and the model is warmed up in the background.

**Choosing a model.** The first launch (and any time the model is missing) shows every model up front, not under Advanced: its size, a line on what it will be like on *this* computer, and a "Best for this computer" badge. The game asks the engine for the graphics card (`llama-server --list-devices`) and the OS for memory (`LlamaEngine.hardware()`). A built-in graphics chip that borrows system memory (it can report 16 GB) is not counted as a card. `recommendModel` in `src/desktop/bridge.ts` goes by what the card can hold, because that is what makes replies fast; with no usable card it aims lower, because the processor is several times slower.

| Tier | Model | Download | Picked when |
| --- | --- | --- | --- |
| 1 | Gemma 4 12B | 7.0 GB | a graphics card with 9 GB or more |
| 2 | Gemma 4 E4B | 5.2 GB | a card with 4.5 GB or more |
| 3 | Gemma 4 E2B | 3.3 GB | a smaller card, or no card and 8 GB of memory |
| 4 | Qwen3 1.7B | 1.1 GB | very small computers (about 4 GB, no card) |

What each tier gives up, and the measurements behind these numbers, are in [docs/model-quality.md](docs/model-quality.md).

**Managing models.** The ⚙ button in the game opens the same screen with an "On this computer" list: what is downloaded, how much space it takes, and a Delete button (never the model in use, never one that ships inside the app). Partly downloaded files show up too, so a failed download can be cleaned up. If replies are slow (the middle of the last three takes over 25 seconds), the hub offers the next model down with one click ("Switch to Gemma 4 E4B", or "Not now"). Switching restarts the engine with the other model.

### Security and privacy

- The engine listens only on `127.0.0.1`, on a random port, and answers only the game's own page (`--cors-origins`). Its built-in web page is switched off.
- The game's page has a strict Content-Security-Policy: no scripts or fonts from the web, and only local and HTTPS connections.
- The shell only does what the page asks through one small bridge (`window.hoopsDesktop`), and only for pages from its own address. Model names are validated, and the model downloads from a pinned commit, so a file can never change underneath the app.
- The desktop app sends nothing anywhere: no analytics, no web fonts.
- It only stops an engine that *it* started. On Windows it ends the whole process tree, because the helper that holds the model would otherwise stay in memory.

### Faster replies

Models like Gemma 4 "think" for thousands of tokens before they answer. A game that only needs a scene does not need that. Measured on `gemma4:12b`, a scene took 6.2 s with thinking and 1.9 s without, with equally valid JSON. So the client sends `reasoning_effort: "none"` to local engines (`src/llm/openaiCompatible.ts`); llama-server documents the same parameter. It can be switched off under Advanced, and if a server rejects it the client stops sending it and carries on.

### Layout

| Path | What it is |
| --- | --- |
| `desktop/main.ts` | Electron main process: window, security, IPC, shutdown, and the self-check |
| `desktop/preload.ts` | The only door between the game and the computer |
| `desktop/llama.ts` | The built-in engine: find, start, fall back, download. Everything outside is injectable |
| `desktop/engine.ts` | The same for Ollama |
| `desktop/download.ts` | Resumable, checksum-verified downloader (also used by the build scripts) |
| `desktop/pins.json` | Exact engine version, model files and SHA-256 checksums. Change deliberately |
| `desktop/server.ts` | Static server for the built game (path-traversal safe, loopback only) |
| `desktop/simulate.ts` | Pretend engine states for the self-check and screenshots. Cannot start anything real |
| `src/desktop/bridge.ts` | Types and the model catalog shared by the game and the shell |
| `electron-builder.config.cjs` | Packaging, for both flavors |
| `scripts/` | `pack.mjs`, `fetch-engine.mjs`, `fetch-model.mjs`, `build-desktop.mjs`, `run-electron.mjs`, `make-icon.mjs` |

### Testing

`npm test` covers the engine managers against fake servers over real HTTP (including a fake `llama-server` that loads slowly, crashes, or hangs), and the downloader against a server that resumes, refuses to, and fails. Three checks run the real thing, and are off by default:

```bash
HOOPS_REAL_OLLAMA=1 npx vitest run desktop/realOllama   # real Ollama on a spare port
HOOPS_REAL_LLAMA=1  npx vitest run desktop/realLlama    # the real engine with the real model (needs build/engine and build/models)
HOOPS_QUALITY=gemma-4-e2b npx vitest run desktop/realQuality   # story quality, speed and memory of a model with the game's real prompts (add HOOPS_QUALITY_CPU=1 for the processor only)
node scripts/run-electron.mjs --smoke --smoke-seed=bundled --smoke-chat --smoke-wait=240 --smoke-out=result.json
```

The last one launches the app, lets it start the engine and reach its title screen, and makes one request exactly as the game would. For a packaged app, run `release/win-unpacked/"Hoops Legacy.exe"` with the same flags. **Page checks** (`scripts/page-checks/`) drive the real game screens inside the desktop app and report whether the page is still alive afterwards. They catch the kind of bug unit tests cannot, such as a pop-up that crashes the whole page while it fades out. `events.js` plays both midseason contests and the combine; `safety-net.js` breaks a pop-up and a screen on purpose to prove the crash screen works. They need a test build that exposes the game's controls:

```bash
VITE_EXPOSE_STORE=1 npx vite build --outDir dist-test
HOOPS_DIST=dist-test node scripts/run-electron.mjs --smoke --smoke-engine=bundled-missing --smoke-eval=scripts/page-checks/events.js --smoke-out=result.json
```

(`--smoke-engine=bundled-missing` keeps the check from starting a real engine.) A good run exits 0 with no console errors.

To photograph a first-run screen without a real engine: `--smoke-engine=bundled-missing|bundled-downloading|bundled-no-engine|no-ollama|missing-model|downloading --smoke-shot=shot.png` (add `--smoke-click=Download` to press a button first).

### Things to know

- **Updating the engine or a model.** Edit `desktop/pins.json` (new tag, file name, size, SHA-256), run `npm run desktop:engine`, and test with `HOOPS_REAL_LLAMA=1`. The engine releases are rolling builds, which is why one is pinned.
- **Hardware.** The 12B model wants a graphics card with 9 GB or more. The engine fits itself to what is free (`--fit`). On the processor alone, measured on a fast 8-core desktop chip, E4B takes over a minute a scene and E2B about 13 seconds, so the game recommends E2B there. The model chooser says what to expect on each computer, and warns when memory is short.
- **Smaller models.** Qwen3 1.7B is the fourth tier (it is the one that fits in 4 GB). Models that retell engine text can distort it, so `retell: false` in `pins.json` makes the game show the engine's own text instead (E2B and Qwen3). Add a model by adding it to `pins.json` with measured `minVramGB`, `cpuRamGB` and `retell`, then run `desktop/realQuality` on it. Not pinned yet: Intel Macs (the engine build is Apple Silicon only).
- **Signing.** Builds are unsigned until you give them a certificate, so Windows SmartScreen and macOS Gatekeeper warn on first run. Windows signing is ready to switch on: see "Code signing" below.
- **Only Windows has been built and tried.** The macOS and Linux configuration is in place (engine builds are pinned) but untested. Intel Macs are not covered.
- **If it will not open.** Some editors set `ELECTRON_RUN_AS_NODE`, which makes Electron behave like plain Node. `npm run desktop` clears it. If you launch Electron by hand, clear it first.

### Releasing and updating

The desktop app carries its own copy of the game and never loads the website, so **deploying the website does not update installed apps**. To ship a change to desktop players:

1. Push the change (Vercel redeploys the website).
2. Raise `version` in `package.json`, then run `npm run desktop:dist`. The installer is written to `release/Hoops-Legacy-Setup.exe`. The file name is fixed on purpose (see `nsis.artifactName` in `electron-builder.config.cjs`).
3. Create a GitHub release (for example `v1.0.1`) and attach that file. GitHub allows 2 GB per file, so the standard installer fits and the full zip (about 7.5 GB) does not.

The website's title screen shows a **Download for Windows** card (`src/ui/screens/TitleScreen.tsx`) that links to `https://github.com/jerusbolito/hoops-legacy/releases/latest/download/Hoops-Legacy-Setup.exe`. That address always serves the newest release, so a new release needs no website change. The card is hidden inside the desktop app.

Players who already have the app must run the new installer themselves. It installs over the old version, and nothing they have is lost: careers live at the app's fixed local address, and the downloaded model sits in its own folder. There is no automatic update check yet.

**Where things are kept on Windows** (`%APPDATA%\hoops-legacy\`): downloaded models in `models\` (about 7 GB for the default), plus the app's saved careers and settings. **Uninstalling removes the downloaded models** (build/installer.nsh, tested by desktop/installer.test.ts) and keeps careers and settings. An update does not: the new installer runs the old uninstaller with an updated flag, and the models stay so nobody downloads 7 GB again. The zip (full build), macOS and Linux have no uninstaller, so there the way to reclaim the space is the in-app Delete button, or deleting the folder by hand (~/Library/Application Support/hoops-legacy/models on a Mac). A model shipped inside the full build lives in the app's own `resources\models` and is preferred over a downloaded copy.

## Code signing (Windows)

Signing puts the publisher's name on the installer and the app, so Windows shows "Verified publisher" instead of "Unknown publisher", and it proves the files were not changed after they were built. **It needs a certificate from a certificate authority, which only you can obtain.** Everything else is ready: the build signs automatically when a certificate is configured, adds a timestamp (so the signature stays valid after the certificate expires), signs the app and the engine programs inside it, and then reads the signatures back to check.

**What signing will not do.** It does not make the SmartScreen warning vanish on day one. Sources disagree on whether the more expensive "EV" certificates still get instant trust: older vendor pages say yes, newer reports say reputation now builds up through downloads for every kind of certificate. Plan for the warning to fade over the first weeks of downloads, and for it to name you instead of "Unknown publisher" from the start.

### Choosing a route

| Route | Cost (as reported) | Good for | Catch |
| --- | --- | --- | --- |
| **Azure Artifact Signing** (formerly Trusted Signing) | about $10 a month ([pricing](https://azure.microsoft.com/pricing/details/artifact-signing/)) | The cheapest and simplest: no token, works from any machine | **Eligibility.** A March 2026 [Microsoft Q&A thread](https://learn.microsoft.com/en-us/answers/questions/5810735/cant-create-a-new-trusted-signing-individual-ident) says it is limited to organizations in the US and Canada with a verifiable history and that individual sign-up is paused. That is a secondary source, so check Microsoft's current page before relying on it |
| **A certificate from a CA, with cloud signing** (SSL.com eSigner, DigiCert KeyLocker, Sectigo...) | typically a few hundred dollars a year | Individuals and companies anywhere the CA validates | Identity checks take days. Since June 2023 the private key must live on [hardware or in a cloud HSM](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options), so you cannot just get a `.pfx` file |
| **A certificate on a USB token** | same | Offline signing | The token asks for its PIN on **every file** signed. A build signs several, so cloud signing is much less painful |

Certificates are also limited in how long they last (reports say 459 days from February 2026), so plan to renew them.

Not signing at all is a real option too: Steam and the Microsoft Store each handle trust their own way.

### Turning it on

Set environment variables before building. Nothing secret is ever written to a file.

| You have | Set |
| --- | --- |
| A `.pfx` file | `CSC_LINK` (its path) and `CSC_KEY_PASSWORD` |
| A certificate in the Windows store (token or cloud-signing client installed) | `HOOPS_SIGN_SHA1` (the certificate's 40-character thumbprint) or `HOOPS_SIGN_SUBJECT` (its name) |
| Azure Artifact Signing | `HOOPS_AZURE_ENDPOINT`, `HOOPS_AZURE_ACCOUNT`, `HOOPS_AZURE_PROFILE`, `HOOPS_PUBLISHER`, plus Microsoft's `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` |

`HOOPS_PUBLISHER` is your name exactly as it appears in the certificate. `HOOPS_TIMESTAMP_URL` changes the timestamp server (default DigiCert's). The rules live in `scripts/signing-config.cjs`, and a setup that is only half filled in stops the build with a message naming what is missing, instead of quietly shipping an unsigned app.

### A release

```bash
HOOPS_REQUIRE_SIGNING=1 npm run desktop:dist     # fails at once if no certificate is configured
node scripts/verify-signature.mjs --require      # reads the real signature off every file; fails unless Windows trusts the signer
```

`HOOPS_REQUIRE_SIGNING=1` is for release builds, so an unsigned installer can never go out by accident. The check afterwards looks at the files themselves, because "the build said it signed" is not proof.

### Trying the pipeline without a real certificate

Make a throwaway one and sign into a separate folder. It will correctly show as "signed, NOT trusted", because nobody trusts a certificate you made yourself. Never install it as trusted.

```bash
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:3072 -sha256 -nodes -keyout k.pem -out c.pem -days 30 -subj "/CN=Hoops Legacy TEST ONLY" -addext "keyUsage=critical,digitalSignature" -addext "extendedKeyUsage=critical,codeSigning"
openssl pkcs12 -export -out test.pfx -inkey k.pem -in c.pem -passout pass:testonly
CSC_LINK=$PWD/test.pfx CSC_KEY_PASSWORD=testonly HOOPS_OUT=release/signtest node scripts/pack.mjs --dir
```

### Notes

- electron-builder prints `Cannot create symbolic link ... privilege is not held` the first time it fetches its signing tools. It is harmless (only macOS files in that archive are affected), and signing carries on. Turning on Windows Developer Mode silences it.
- This is written for electron-builder 26. Version 27 renames the signing options, so re-check `scripts/signing-config.cjs` if you upgrade.
- **macOS** needs a different thing: a paid Apple Developer account, then signing and notarization. It is not set up, because the macOS build has not been tried.

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
| `lifeEvents.ts` | Random moments: about 50 engine-written events (a flat tire, a viral clip, a booster with an envelope, trade rumors) that arrive without warning, ask for a decision and change something real. Each is a definition with its own conditions, cast and choices, so adding one is adding one object to `DEFS`. They work with or without the AI, and are added to the story log so the narrator remembers them. |
| `finance.ts` | Money. Pay arrives every regular-season week (salary, a stipend or allowance, endorsements); pros lose 30% to taxes and fees and 8% of salary to living costs. A ledger keeps the season's numbers. Services (trainer, recovery team, nutritionist, tutor, PR team) are bought with it and change training, injuries, energy, grades and endorsements. |
| `moves.ts` | Leaving a team: the transfer portal in high school and college, trade requests in the pros. Works out who wants you and what role you would have, how the front office answers a request, and what changes when you go (coach, teammates, your best friend, a signing package in college). Also the forced trade and the fired coach. |
| `leaders.ts` | League leaders in every category (scoring, rebounds, assists, steals, blocks, shooting percentages, minutes, turnovers) with qualifying minimums, ranks, and each player's last season filed away at the turn. |
| `athleteCard.ts` | Everything the player card shows about anyone in the league, built from the save: bio, ratings against yours, this season's line with league ranks, last season, contract, your career and recent games. |
| `paper.ts` | The weekly newspaper: a preview, an edition every week (your game, scoreboard, players of the week, standings movement, leaders and lead changes, the MVP race, league moves, your people, next up), playoff editions and a season recap. Built only from the week's real box scores. |
| `chemistry.ts` | Team chemistry (0-100) and captaincy. It moves with wins, losses, events, coach changes and roster churn, and gives every teammate a -2 to +2 rating nudge in the game sim. |
| `contracts.ts` | Pro salaries for everyone, a salary cap that follows the league's payrolls, extension talks (fair / high / max asks, counteroffers) and holdouts. |
| `draft.ts` | A real draft: every college player is on a ranked board, teams pick best-available by need, and your rival and friend land on the team that picks them. |
| `awards.ts` | The MVP race, All-Star selection at the midpoint, and the formula the year-end awards share. |
| `rivalry.ts` | The head-to-head series with your rival and marked rivalry games. |
| `romance.ts` | Relationship stages (crush, dating, partner, engaged, married), long distance after a level change, and kids. |
| `recruiting.ts` | Recruiting both ways. A board of schools whose interest in you follows how you play (feeds your real offers at the end of high school). Each season a few targets from other teams, or soon-to-be free agents in the pros, who you work with calls, hosted visits, hype and perks, using one action a week while rival teams chase them. At the turn of the season each target picks you, a rival or staying put (the pick itself is in `transactions.ts`). Also league recruiting buzz and the top seniors' commitments. |
| `transactions.ts` | The rest of the league moving: transfers in high school and college each offseason, trades in a pro trade week, and a pro free-agent market (every pro deal has a length, expiring players hit the market, teams with open spots sign the best of them, the unwanted retire). Your rival and friend can transfer too (a benched friend is the likeliest to leave). Everything lands in the `transactions` log shown on the League tab, and rosters stay whole. |
| `storyAthletes.ts` | Your rival's and best friend's careers: class year, last season's line, a title that stays true, and growth that keeps them near your level and moving up their own depth chart. `upgradeSave()` brings older saves up to date once. |
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

Persistent characters (your rival, your best friend) follow you up through the levels if they're good enough to make it. Each season they move up a class and get their own line (`storyAthletes.ts`), so a senior rival reads and plays like one.

At the start of each new week a random moment may be waiting (`lifeEvents.ts`). It has to be answered before play continues. Leaving a team is a separate decision, made from the **Money** tab (`moves.ts`).

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
- League moves are simple. Trades are one-for-one at similar quality, and free agents sign by team prestige and need, with no salary cap, no draft picks and no bidding. Other players' salaries are not tracked, only contract length.
- Zod 3 has a known memory-exhaustion advisory for oversized inputs (the worst case is that importing a malicious save freezes the tab). Upgrading to Zod 4 is a breaking change and hasn't been done yet.

## Tuning the game

| What | Where |
| --- | --- |
| Quarter length, pace, roster size, rating means, playoff size per level | `LEVEL_CONFIG` in `src/data/teams.ts` |
| Shot, turnover, foul and rebound odds | `shotOdds()` and `runPossession()` in `src/engine/gameSim.ts` |
| Training gains, aging, injuries | `src/engine/progression.ts` |
| Pay, taxes, living costs, service prices | `src/engine/finance.ts` (`PRO_TAX_RATE`, `PRO_LIVING_RATE`, `WEEKLY_ALLOWANCE`, `LEVEL_SCALE`, `SERVICES`) |
| How often random moments happen, and what they are | `lifeChance()` and `DEFS` in `src/engine/lifeEvents.ts` |
| Salary cap, extension odds, holdout length | `salaryCap()`, `ceilingFor()`, `STANCE`, `weeklyHoldout()` in `src/engine/contracts.ts` |
| How fast a relationship grows or cools | `weeklyRomance()` in `src/engine/romance.ts` |
| What chemistry is worth, and what moves it | `chemistryMod()`, `chemistryAfterGame()`, `weeklyChemistry()` in `src/engine/chemistry.ts` |
| Who wants you, trade odds, signing packages | `buildOffers()`, `tradeOdds()`, `nilBonus()` in `src/engine/moves.ts` |
| How fast your rival and friend grow | `targetFor()` in `src/engine/storyAthletes.ts` |
| How much one scene can change relationships/ratings | `SCENE_CAPS` in `src/engine/effects.ts` |
| Which scenes appear and how often | `POOL` in `src/narrative/scenes.ts` |
| Which backdrop a scene gets | `ENV_BY_KIND` in `src/ui/components/SceneBanner.tsx` |
| Face styles, skin and hair palettes | `src/ui/components/Portrait.tsx` |
| Name pools (first, last, female first), and the list of real people to never generate | `src/data/names.ts` |
| Skill tier names and thresholds | `RATING_TIERS` in `src/engine/ratings.ts` |
| Narrator voice and rules | `SYSTEM_PROMPT` in `src/narrative/prompts.ts` |
| Starting ratings and potential of the player and rival | `createCareer()` / `seedHighSchoolCast()` in `src/engine/career.ts` |

After changing sim odds, run `npm test`. The scoring-range test will tell you if games became unrealistic.
