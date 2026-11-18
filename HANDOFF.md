# Come Up: handoff for AI agents

Read this first if you are picking the project up cold. It says what the game is, how it is built, what was added recently and why, what is in flight, and the traps that cost time. Keep it current: when you finish a piece of work, update the **Roadmap** and **Recent changes** sections.

## What this is

A basketball career RPG in TypeScript: a player goes high school → college → pro. A deterministic engine owns every fact (ratings, games, money, relationships); an optional LLM narrator only *tells* the story and may *propose* small effects that the engine clamps. React + Zustand + Tailwind in the browser, plus an Electron desktop build with a bundled local model (`desktop/`). `README.md` documents setup, desktop packaging and the engine layout. This file covers the build history and working knowledge.

**Core rule: the engine owns the facts.** The narrator never decides outcomes. Anything that changes the save goes through engine functions (`applyEffects` for LLM proposals, the engine modules for everything else). New features must work with no LLM at all.

## Working here (environment traps)

- **Windows 11, Git Bash and PowerShell.** Python is not installed. Source files have **CRLF** line endings (git `autocrlf=true`). The Edit tool copes; hand-rolled Node scripts must normalize `\r\n` → `\n` before matching and restore afterwards.
- **Bash heredocs containing `$` or template strings are sometimes blocked by a safety check** ("could not be checked for dangerous rm operations"). If that happens, write the script with the Write tool and run it with `node path`. Never chain a delete with a heredoc.
- Commands: `npm run typecheck` (app + desktop), `npx vitest run` (about 360 tests, ~40 s), `npx vite build`, `npm run dev`. Always run typecheck and the full suite before calling something done.
- **Do not commit unless the user asks.** Nothing from the recent work has been committed.
- Use they/them for anyone whose pronouns are not stated. Avoid gendered pronouns in game text (the player's gender is not chosen).
- The user wants honesty about what was and was not verified. Most UI is checked with server-render tests (`src/ui/screens.test.ts`). A real browser CAN be driven here: Edge is installed, and `puppeteer-core` (in a scratch folder, not the repo) can screenshot the app at phone size; see "Mobile layout". Say which of the two you used.

## Architecture in one page

```
src/
  data/        teams.ts (HS/college/pro team templates, LEVEL_CONFIG), names.ts
  engine/      all rules. Pure functions over GameState, seeded RNG, no React.
  narrative/   scene picker (scenes.ts), prompts, parsing, template fallback, context builder (context.ts)
  llm/         provider clients (Anthropic, Gemini, OpenAI-compatible, local)
  state/       schemas.ts (Zod save format; defaults make old saves load), store.ts (Zustand), persistence.ts (IndexedDB via Dexie)
  ui/          views/ (tabs), panels/ (hub steps), components/, screens/ (GameShell has the tab list)
desktop/       Electron shell, local llama engine, signing
```

- **State:** `GameState` in `src/state/schemas.ts` is the root. All mutation in the store goes through `mutate()` (clone → change → autosave). Engine functions mutate a draft in place.
- **RNG:** `RNG` (mulberry32) in `engine/rng.ts`; state lives in `state.rngState`. Use `withRng(state, rng => ...)` from `career.ts`. **Anything that consumes RNG shifts every seeded test downstream.** When a previously passing seeded test starts failing after you add RNG use, suspect that first and make the test robust rather than weakening the feature.
- **Calendar:** `career.phase` (preseason → regular → playoffs → offseason, plus recruiting / draft / free_agency / retired) and `career.step` (training → scene → game → done). `advanceWeek()` in `career.ts` is the heartbeat; `startNextSeason()` is the season turn; `newSeasonCommon()` runs on every new season including level changes.
- **Import direction (avoid cycles):** `finance`, `news`, `storyAthletes`, `recruiting`, `moves`, `transactions`, `lifeEvents` may import each other only along: `news ← finance ← storyAthletes ← recruiting ← moves/transactions ← lifeEvents ← career`. `career.ts` imports them; none of them import `career.ts`. If you need something from `career.ts` in one of those, move it down instead.
- **Saves:** add fields with `.default(...)` in Zod so old saves still parse; extend the "older saves" test in `smoke.test.ts` (it deletes new keys and checks defaults). Saves are not versioned beyond `SAVE_VERSION = 1`. `upgradeSave()` in `storyAthletes.ts` is the one-time catch-up hook run on load/import.

## Engine map (what each file owns)

| File | Owns |
| --- | --- |
| `career.ts` | calendar, career creation, awards, roster turnover, level transitions, recruiting offers, draft, free agency |
| `gameSim.ts`, `league.ts` | possession sim, schedule, standings, playoffs, league stat totals |
| `progression.ts` | training, aging, injuries, energy; services (trainer/recovery/nutrition/tutor) hook in here |
| `coach.ts`, `consequences.ts`, `gameplan.ts`, `badges.ts`, `events.ts` | coach trust/minutes, grades/injuries/estrangement/ripples, game plans, badges, contests and combine |
| `media.ts` | social feed, endorsements, press |
| `finance.ts` | weekly pay, taxes, living costs, ledger, services shop |
| `lifeEvents.ts` | ~45 random moments (definitions in `DEFS`), rolled weekly, resolved with choices |
| `moves.ts` | the player leaving: transfer portal (HS/college), trade requests (pro), forced trade, coach replacement |
| `storyAthletes.ts` | rival/friend careers: class year, titles, growth targets, `upgradeSave`, `lockedAthleteIds` |
| `transactions.ts` | league-wide transfers, trades, pro free-agent market, recruit resolution, `logTransaction` re-export |
| `recruiting.ts` | schools recruiting the player (suitors), players the player recruits (targets/actions), league recruiting buzz |
| `news.ts` | `addNews`, `logTransaction` |
| `chemistry.ts` | team chemistry, captaincy, the sim rating bonus |
| `contracts.ts` | salaries, `salaryCap`, payroll, extension talks, holdouts |
| `draft.ts` | draft board, `simulateDraft`, projections |
| `awards.ts` | `scoredPlayers` (one formula), MVP race, All-Stars |
| `rivalry.ts` | rival head-to-head record and marked games |
| `romance.ts` | relationship stages, long distance, kids |
| `legacyScore.ts` | Hall of Fame score and tiers (`scoreParts`, `legendOf`, `peakOf`/`notePeak`). Pure, no `career.ts` import, so goals and the paper can use it |
| `goals.ts` | Three open long-term goals per career (`DEFS`, `ensureGoals`, `checkGoals`, `viewGoal`). Own seeded RNG, never touches `state.rngState` |
| `legacy.ts` | `planHeir` (preview, deterministic per save and generation) and `startNextGeneration` (files the career, rebuilds the world via `beginGeneration` in `career.ts`) |
| `milestones.ts` | Paper copy computed from the game log: round numbers, career nights, streaks, goal-watch, anniversaries, heir-vs-parent. Told-once state lives in `story.flags.ms_*` |
| `origin.ts` | Who the player is: family background, motive, temperament, build. `modsOf(state)` is the ONE place other modules ask for the numbers (training, allowance, morale, reputation, relationships, events...); `applyOriginStart` does the one-time parts; `originBlock` is what the narrator is told; `heirOrigin` derives an heir's. Pure data, imports nothing from the engine |
| `testkit.ts` | shared test helpers: `tick`, `playUntil`, `answerLife` (imports vitest `expect`; tests only) |

Keep this table current when you add a module.

## Legacy build (newest)

Uncommitted, tested (about 375 tests) and typechecks. Added after the roadmap:

- **Next generation** (`legacy.ts`, `beginGeneration` in `career.ts`): after `phase === 'retired'` the save continues. `state.legacy` holds `generation`, `family`, `inherited` tier, `relation` ('child' if the story flag `kids` > 0, else 'protege'), `parent` and `lineage: Legend[]`. The old career's gameLog, awards, NPCs, paper, story and flags are cleared (only `story_athletes_v2` survives); the season counter keeps counting. A protege gets half the head start (tier / 2). The kid shares the parent's surname and the seeded parent NPC is renamed to the legend; the old rival and best friend come back as `mentor` NPCs.
- **Hall of Fame** (`legacyScore.ts`, Dexie table `legends` in `persistence.ts`, db version 2): one row per finished career, id `saveId:generation`, filed in the store's `mutate` the moment the phase becomes retired (and again, idempotently, by `RetiredPanel`). Score = titles/MVPs/awards/stats/longevity/peak/draft only; pro titles are scaled by scoring contribution (`contribution` in `scoreParts`) so a bench player on a dynasty does not look like a champion. Money and family are deliberately NOT in the score. Tiers: 0 Journeyman, 30 Solid Pro, 65 Fan Favorite, 120 All-Time Great, 190 Hall of Famer, 290 Immortal. Autopilot careers land at 40-100; a deliberately overpowered 92-everywhere player reaches 800, so the top tiers are reachable but the sim is generous to superstars.
- **Goals** (`goals.ts`, `state.goals`): three open at a time, one each from career/player/life groups; finishing one adds the next (never a repeated kind). `ensureGoals` runs at creation, on load/import (`persistence.ts`) and after an heir starts. `checkGoals` runs in the store's `mutate` next to badges and toasts what finished. Peak rating is sampled in `newSeasonCommon` (`notePeak`, flag `peak_ovr`).
- **Paper** (`milestones.ts`, `paper.ts`): weekly issues get a "Milestones and Streaks" section and the biggest item leads; preview/recap get "From the Archives" (anniversaries only in the preview). Printing still does not move `state.rngState`.
- **Traps:** `createCareer` was refactored around `seatAthlete`, `newPlayer`, `newCareerState` (shared with `beginGeneration`); seeded RNG order is unchanged. `legacy.ts` imports `career.ts`, never the reverse; `career.ts` may import `goals.ts` and `legacyScore.ts` (both free of `career.ts`). A new field on `GameState` must also be set in `createCareer` because the type has no optional fields.
- **Release note:** the 1.2.0 entry is in `CHANGELOG.md` (shown in-app as "What's new") and `package.json` is at 1.2.0. `changelog.test.ts` requires the two to match, so bump them together.
- **Not done / ideas:** a daily-seed challenge and leaderboard (needs a backend); coaching career after retirement; sharing a legend as an image; a "retired number" trophy room in the world; the Hall of Fame is local to the device (no export), so it does not follow a player between the website and the desktop app. The UI was render-tested only, never viewed in a browser.

## Mobile layout (newest)

Uncommitted, tested (about 395 tests) and typechecks. Below the `lg` breakpoint (1024px, so phones AND tablets) the game uses a phone layout; wide screens are unchanged.

- **Navigation:** `components/MobileNav.tsx` is a fixed bottom bar (Week, Player, League, Paper, More) with a bottom sheet for the other tabs and the settings buttons. The tab list is shared in `screens/tabs.ts` (`TABS`, `PRIMARY_TABS`). The top tab strip and the icon buttons are `hidden lg:flex`. The bar hides itself during a live game (`store.live`). The More button keeps a constant label on purpose (an earlier version showed the current tab's name and made More hard to find).
- **Header:** `GameShell.tsx` reorders with `order-*` classes on phones (avatar and money, then team, then meters) and is only sticky at `lg`.
- **Live game:** `HubView` hides the whole sidebar while `live` or `post` on phones (the page went from about 3,200px tall to under 1,000px). `GamePanel.tsx`: abbreviations in the scoreboard, 40px speed and skip buttons, court above a short play-by-play. Decision pop-ups (`MomentCard`, `LifeEventModal`, `EventModal`) use `mt-auto sm:my-auto` so they sit at the bottom of the screen. Do not put `my-auto` back: auto margins override `items-end`.
- **The overflow bug:** a grid like `grid lg:grid-cols-[1fr_380px]` has an auto-sized single column below `lg`, and one long unbreakable line widened the whole page (the People tab was 509px wide on a 390px phone). Every such grid now has `grid-cols-1`; `mobile.test.ts` scans every `.tsx` so a new one cannot slip in.
- **Global CSS** (`index.css`, `index.html`): `viewport-fit=cover`, safe-area padding on the bar and sheets, 16px form fields on phones (stops iOS zooming on focus), `touch-action: manipulation`, no fixed background on small screens, `overscroll-behavior-y: contain`. `Button` is `min-h-11` below `sm`. `PlayerLink` has an invisible `before:` pseudo-element that enlarges its tap area, so an audit that measures element boxes still reports those links as small; they are fine.
- **How it was checked (repeatable):** a headless Edge at 390x844 with touch, driven by `puppeteer-core` installed in a scratch folder OUTSIDE the repo (Edge is at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`). Recipe: run `vite --port 5199`; set `localStorage['hoops.llm']` to `{presetId:'mock',kind:'mock',baseUrl:'',apiKey:'',model:'mock'}` before load (the offline mock provider skips AI setup); write saves from the engine with `playUntil` (a throwaway vitest file, like the one used for the Hall of Fame) and upload them through the title screen's `input[type=file]`; then tap through the app, take screenshots and measure `scrollWidth` against the viewport. Key moments fire within about 2s of tip-off, so hide `.fixed.inset-0.z-40` with an injected style to photograph the scoreboard behind one.
- **Not done / ideas:** a sticky mini score strip while a key moment is open; collapsing the long hub sidebar into accordions between games; landscape-specific layout for the live game; a swipe between tabs; the title screen's save list still draws faces from names.

## Character origin

Uncommitted, tested (about 390 tests) and typechecks.

- **What it is:** `player.origin` (`OriginSchema` in `schemas.ts`): `chosen`, `background` (struggling/working/comfortable/athletic/wealthy), `motive` (prove/provide/love/fame, plus `legacy` for heirs only), `temperament` (steady/fiery/loyal/charming/loner) and `look` (skin, hair, style, build, number). `chosen: false` is the default, so saves from before this and every existing test play exactly as before; `modsOf` returns `NEUTRAL` for them.
- **Every number lives in `origin.ts`** (the `BACKGROUND`, `MOTIVE`, `TEMPERAMENT` tables) and is multiplied together by `combine`. Hooks: training (`career.ts` `doTraining`), allowance (`finance.weeklyPay`), job energy (`progression.weeklyRecovery`), morale, reputation and followers after a game (`career.finishUserGame`), grade drift, brand deals (`media.offerChance` and amount), relationship gains (`Fx.rel` in `lifeEvents.ts` and `effects.ts`, good changes only), rivalry swings (`rivalry.ts`), romance speed (`romance.ts`), college signing packages and the cost of leaving (`moves.ts`), clutch odds (`league.ts` to `gameSim.ts`), and which random moments come up (`originWeight` in `rollLifeEvent`). The UI text in `BACKGROUNDS`/`MOTIVES`/`TEMPERAMENTS` (perks and costs) is written by hand next to the numbers: keep them in sync when you tune.
- **Story:** 16 new moments in `lifeEvents.ts` (rent_notice, second_job, rich_kid_label, private_gym_offer, parent_film_session, family_comparison, college_fund_talk, doubter, provide_ask, family_set, old_court, fame_dm, temper_flare, loyal_call, charm_offensive, lone_wolf_night) gated by `when` on the origin, several leaving ripples that come back as scenes. The narrator gets `originBlock` in `playerBlock`. The opening scene (`scenes.ts`) now keys off "level hs and year 1" instead of "season 1" (this also fixed heirs being told they were starting "in the pros"). The first goal comes from the motive (`goalForMotive`; new `followers` goal).
- **Appearance:** `data/looks.ts` holds the palettes and a name-to-look registry; `Portrait.tsx` asks it; the store registers the player's look in `openCareer`. Everyone else still gets a face from their name.
- **Heirs:** `planHeir` derives an origin (`heirOrigin`): a child is `legacy` (athletic, or wealthy if the parent earned $40M+), a protege is `struggling`. The heir's ratings already include the origin adjustment, so `beginGeneration` calls `applyOriginStart(state, { ratings: false })`.
- **Balance (measured, 14 careers per row, autopilot):** Hall of Fame score within about 3% of the baseline for every variant tried, peak rating within about 1.2, money within about 15%. The first version of athletic had `ratingBoost: 2` and ran away (+15% score, +35% money), so it is 1. The 6-seed runs are noisy (a "provide" dip of -30 vanished with 14 seeds): use 14+ seeds before touching numbers.
- **Not done / ideas:** origin-specific opening scene text when there is no AI (template fallback); a "your number is retired" trophy that blocks an heir from wearing it; letting the player change their look later; a second parent for a child born into a marriage.

## Recent changes (this build session)

Everything below is **uncommitted**, tested, and typechecks (about 300 tests).

0. **Added after the first six** (see the Roadmap for what each does): coach carousel, rivalry games, injury comebacks, awards races and All-Stars, chemistry and captaincy, romance and family, a real draft class, contracts and a cap, AI narration of the new systems, and a tuning pass.
1. **Random moments** (`lifeEvents.ts`): about 52 engine-written events with choices, costs, and lasting effects. Rolled in `advanceWeek` (`rollLifeEvent`), pending in `career.lifeEvent`, shown by `ui/components/LifeEventModal.tsx` (blocks until answered, waits for reveals). Each def has `levels`, `weight`, optional `need` (cast roles), `when`, `text`, `options`. Adding an event = adding one object. A generic test forces every def at every level and resolves every option.
2. **Money** (`finance.ts`, `MoneyView.tsx`, header chip): pay arrives weekly in the regular season; pros pay 30% tax and 8% living costs; ledger per season; services (trainer, recovery, nutrition, tutor, PR team) bought with money, active through the season (summer included; bought in the offseason they cover next season).
3. **Leaving a team** (`moves.ts`, Money tab): HS/college transfer portal in the offseason with offers and (college) signing packages; pro trade requests with odds, deadline, once per season; `pendingMove` persisted in `career`.
4. **Rivals and friends progress** (`storyAthletes.ts`): class years in titles, last-season lines, growth pulled toward your level and up their depth chart (capped: rival ≤ you+10, friend ≤ you+7), friend age fixed so they do not graduate early, `upgradeSave` for old saves.
5. **Living league** (`transactions.ts`): HS/college transfers each offseason; pro trade week; pro free agency with contract lengths (`Athlete.contractYears`), teams signing from the pool, retirements; rival/friend can transfer; log in `state.transactions`, shown in League tab.
6. **Recruiting storyline** (`recruiting.ts`, `RecruitingView.tsx`): suitors (schools interested in you), targets (players you recruit with call/visit/hype/perks, one action per week, rival teams compete), results at the season turn, league buzz and senior commitments.

## Roadmap (the user said: add all of it)

Status key: `[x]` done, `[~]` in progress, `[ ]` not started. Update as you go.

- [x] G. Coach carousel (`coachCarousel` in `transactions.ts`): losing teams fire coaches, some are rehired elsewhere, your fired coach is replaced via `replaceCoach`, a former coach who lands a job updates their NPC title
- [x] F. Rivalry games (`rivalry.ts`): `Npc.h2h` series record, marked pre-game banner, morale/rep swing, headline + memory after the game
- [x] E. Injury comebacks: `rehab` training focus (2 sessions = −1 week), `injury.total/rehab`, `comeback_due` flag forces the `comeback` life event; ≥6 weeks with <3 rehab sessions costs 1 ATH
- [x] D. Awards races (`awards.ts`): `scoredPlayers` is the one formula for year-end awards and the race; `mvpRace`, All-Stars named at the midpoint (flag `allstars_<season>` holds ids), MVP race headline every 3rd week, League-tab panel
- [x] C. Captaincy and team chemistry (`chemistry.ts`): `career.chemistry` 0-100; ±2 rating mod for every teammate in `simOptions` (`league.ts`); moves with wins/losses, weekly drift, events (`Fx.chem`), coach changes, new team (42), recruits; captain vote is a forced preseason life event (`captainVoteDue`), flag `captain_season`; `ChemistryCard` in the hub sidebar
- [x] H. Life outside basketball (`romance.ts`): stage in flag `love_stage` (none/crush/dating/partner/engaged/married), weekly cooling and breakups, long distance after a level change, events make_official / love_attention / long_distance / proposal / wedding / baby / family_scare, kids cost energy and give morale each week
- [x] A. Real draft class (`draft.ts`): `draftBoard` = every college player ranked by `stockOf`; `simulateDraft` runs 2 rounds (worst teams first, best-available + positional need + noise); your pick comes from it, rival/friend go to the team that picked them (`enterLevel(..., drafted)`); big board on draft night; `projectedPick`/`draftStock` re-exported from `career.ts`
- [x] B. Contract talks (`contracts.ts`): `Athlete.salary` + `contractYears` for every pro, `salaryCap(state)` = 1.2 x median payroll (it tracks the league; a fixed cap does not work), cap-aware free agency (`transactions.ts`) and offers (`freeAgencyOffers`), extension talks (fair/high/max stances, counteroffers), holdouts (you sit out via `sitOutReason`, trust/morale/chem decay weekly, auto-ends at 6 weeks), `adoptCoach` (a former coach hired by your new team is the same NPC, not a duplicate)
- [x] I. AI narration (`narrateResult` in `narrative/narrator.ts`): life-event results, transfers/trades and recruiting results are retold by the narrator when a live client exists; the engine's text shows first and is the fallback; a retelling that adds or changes a number is rejected (`numbersMatch`)
- [x] J. Tuning pass (numbers below)

All ten roadmap items are done, and a follow-up (stats, player cards, newspaper) is described under "After the roadmap" below. Nothing is in flight. Ideas not yet built: other players' contracts feeding a real salary-cap trade market, a coaching career after retirement, a legacy/next-generation mode, media storylines (documentary, controversies), multi-season rivalries between teams, a scouting-report view of other prospects' ratings.

## After the roadmap: stats, player cards and the newspaper

- **Every box-score column is kept for every player** (`LeagueStatLine` gained fgm/fga/tpm/tpa/ftm/fta/orb/drb/tov/pf; old saves read zeros). `accumulateLeagueStats` also appends each line to `state.weekLog` for the paper; `publishIssue` clears it.
- `leaders.ts`: `leaders()`, `rankOf()`, `perGame()`, qualifying minimums (FG% 5 attempts a game, 3P% 2.5, FT% 2.5, counted against games the league has played), ties share a rank. `archiveSeasonStats` files each athlete's finished season on `Athlete.prev` at the season turn.
- `athleteCard.ts` + `AthleteCardModal` + `PlayerLink`: click any player's name (League roster, leaders, MVP race, box scores, newspaper, recruiting targets, draft board, People) to open their card (`store.openCard`).
- `paper.ts`: `publishIssue(state, kind)` is called from `advanceWeekCore` (preview when preseason ends, weekly after a regular-season week, weekly again after a playoff week) and `finishPlayoffsAndSeason` (recap). It uses its own seeded RNG, so printing never moves `state.rngState` (tested). The store polishes the lead story with the narrator when one is connected (same numbers-must-match rule as other narration). Newspaper tab has an unread dot (`paperSeen`).
- **Simulation fix found while building this:** the shot-share curve in `gameSim.ts` (`usage()`) was `exp(x/9)`, which let one star take over half a team's shots (scoring leaders of 36 / 43 / 53 ppg at HS / college / pro). It is now `exp(x/16)`: leaders about 25 / 28 / 39 and team scoring unchanged (about 59 / 71 / 101). A guard test (`paper.test.ts`) keeps a scorer under 45% of team points. **Shooting realism pass:** `shotOdds` now has diminishing returns above a per-shot "knee" (`SHOT_KNEE` in `gameSim.ts`: odds past it count 60%) and `ftPct` compresses above 80%, and leader minimums were raised. A harder squeeze (50%) dragged the user player's coach trust down and broke the contract and balance tests, so it was relaxed. Leaders still occasionally show 60-65% from three on a hot season; push the knees down only together with a trust re-tune.

## Added after the roadmap (improvement round)

- **Playtest dashboard:** `npm run playtest [-- 30] [--open]` plays whole careers per training strategy and archetype and writes `quality-report/playtest.html` (plus `playtest-history.json`, last 30 runs, for the trend chart). Strategies only override training through `TickOptions` in `testkit.ts`, so everything else is the same autopilot. The builder is `engine/playtestReport.ts`. It is opt-in (PLAYTEST=1) and not part of `npm test`.
- **Save migrations:** `state/migrate.ts` (`migrateSave` / `parseSave`) runs before every load, import and cloud download. Additive fields still just need `.default()`; a rename or reshape bumps `SAVE_VERSION` and adds `MIGRATIONS[n]`. A save from a newer app throws `SaveTooNewError`.
- **Share card:** `ui/share/careerCard.ts` draws a Legend to a 1080x1350 PNG (canvas, no deps); button on every Hall of Fame card. `cardModel` is the testable part.
- **Achievements:** `engine/achievements.ts`, derived from the Hall of Fame legends, so they are account-wide and synced for free; nothing is stored. Panel under the Hall of Fame.
- **Difficulty:** `engine/difficulty.ts`, stored in `story.flags.difficulty` (absent = Standard, so old saves are unchanged and Standard multiplies by 1). Scales training gains, injury chance and living costs/allowance. Chosen at character creation; not changeable later.
- **Challenges + leaderboard:** `engine/challenges.ts` (weekly seeded start from the ISO week plus 3 classics; tagged in `story.flags.challenge` and `Legend.challenge`, first generation only). Score = Hall of Fame score. `sync/leaderboard.ts` and the `challenge_scores` table at the bottom of `supabase/schema.sql` (**must be run once in the Supabase SQL editor**; until then the UI says the leaderboard is not set up). Scores are client-submitted and unverified.

## Tuning results (24 full careers on autopilot with random choices, `tick` from testkit)

- Random moments: **about 4.4 a season, 0.3 a week.** Evenly spread, no repeats back to back.
- Money: pro net about $11M a season (median), final bank $86M to $251M. HS nets about $120 a season, college about $400 (stipend plus whatever you spend; goes negative when you buy services). HS/college prices were chosen so a trainer costs about a season of allowance.
- Recruiting odds by effort (target 10 weeks): **all-in 76-94%, one action a week 24-41%, a token effort about 0%.** Autopilot (random, spread across targets) almost never lands anyone, which is intended.
- Romance: with random choices about 7 of 24 careers reach marriage (and kids); the rest never start or drift apart. Without AI scenes, romance grows only by time together (+1/week up to 50 before dating, +0.45/week up to 75 while dating and not long distance), date scenes (+4 in the template fallback) and events.
- Chemistry: mean about 54, low about 38. Captain in about half the seasons from year 2 for a player with some reputation.
- Injury history at career end 0-3; endorsements about 30-45% of final money before tax (the guardrail compares after-tax).
- Contract talks: a "fair" ask (97% of market) is accepted most of the time, a "high" ask (120%) usually draws a counteroffer with a neutral coach, "max" (145%) is usually refused.
- Draft: the median autopilot player is picked around #16; roughly one in six goes undrafted.

## Tuning knobs

See the README "Tuning the game" table. The main ones: `lifeChance()` and `DEFS` (`lifeEvents.ts`); `PRO_TAX_RATE`, `PRO_LIVING_RATE`, `WEEKLY_ALLOWANCE`, `LEVEL_SCALE`, `SERVICES` (`finance.ts`); `buildOffers`, `tradeOdds`, `nilBonus` (`moves.ts`); `targetFor` (`storyAthletes.ts`); `recruitAct`, `recruitWinner`, `updateSuitors` (`recruiting.ts`). **These were set by judgment, not by playing a full career by hand.** Treat them as first guesses.

## Tests that guard the new work

`life.test.ts` (events, money, moves, rival/friend growth), `transactions.test.ts` (league moves, free agency), `recruiting.test.ts`, `screens.test.ts` (UI render via server rendering with a mocked store hook), `smoke.test.ts` (whole careers incl. old-save defaults and roster consistency), `balance.test.ts` (whole-career bounds). `testkit.ts` holds `tick`, which plays one varied step and exercises life events, services, recruiting actions and moves.

## Model tiers, model manager, uninstall (desktop)

- **Four tiers** in `desktop/pins.json` (12B, E4B, E2B, Qwen3 1.7B), each with measured `minVramGB`, `cpuRamGB` and `retell`. `src/desktop/bridge.ts`: `recommendModel(ramGB, gpuGB)`, `fitNote`, `lighterModel`, `repliesAreSlow`. Hardware comes from `LlamaEngine.hardware()` (parses `llama-server --list-devices`; integrated chips that borrow system memory are flagged `integratedOnly` and not counted as a card).
- **First-run model choice** is a prominent chooser in `DesktopSetup` (`ModelChooser`), not under Advanced. The same screen, opened from the ⚙ button (`openModelManager`), also lists downloaded models with delete (`InstalledList`, IPC `desktop:models` / `desktop:delete-model`; never the model in use or one shipped with the app).
- **Slow-model nudge**: `SlowModelBanner` on the hub, fed by `replySeconds` in the store (recorded for AI replies only).
- **Uninstall** removes `%APPDATA%hoops-legacymodels` (`build/installer.nsh`, guarded by `isUpdated` so updates keep models; saves are untouched). Verified with a real NSIS build under a throwaway app id: update kept models, uninstall removed them and kept saves. Zip/mac/linux have no uninstaller.
- **Quality harness**: `desktop/realQuality.test.ts` (`HOOPS_QUALITY=id,id`, `HOOPS_QUALITY_CPU=1`); results and what each tier gives up in `docs/model-quality.md`. Small-model fixes it drove: `scrubIds` (ids leaking into prose), duplicate-choice repair in `generateScene`, `canRetell` gate (`retell:false` models show the engine's own text).
- **Traps**: on Windows a just-stopped engine holds its files (the CPU-only harness copies the engine once and reuses it). The user's real 12B model lives in `%APPDATA%hoops-legacymodels`; rename it aside before any uninstall test. An existing install of the real app is on this machine, so test installers must use another `appId`.
- **Not done**: Intel Mac engine is unpinned; no auto-update check.

## Traps already hit (do not repeat)

- **A fixed salary cap broke free agency.** League payrolls run \$100-255M (NPC growth inflates ratings), so a \$100M cap left every team with no room and every offer collapsed to the minimum. The only symptom was an unrelated balance test (endorsements vs money) drifting. When a balance guardrail moves, **measure the distribution over ~24 seeds** (copy `play()` from `balance.test.ts` into a scratch file) before touching the bound.
- **Duplicate NPC names.** Anything that creates an NPC from a coach/athlete name must go through `adoptCoach` or `NameBook`; `names.test.ts` ("stay unique through every season") catches this over a whole career.
- **Weekly RNG shifts seeded tests.** Adding a random call per week (recruiting tick, etc.) changed outcomes in tests that depended on a specific seed. Fix the test's setup (e.g. make the player a starter) rather than the feature.
- Life events are answered *before* a test measures money. A ledger that "starts negative" is usually an event cost resolved while waiting for the preseason: compare changes, not absolutes.

## Known limitations and honest gaps

- Most UI is only render-tested. The phone layout was also checked in a real headless Edge at 390px (see "Mobile layout"); other screens and widths were not.
- League trades and signings are simple one-for-one swaps and pool picks.
- Numbers (pay, event frequency, odds) are untuned.
- LLM narration of the new engine-written systems is not yet wired (see roadmap I).
