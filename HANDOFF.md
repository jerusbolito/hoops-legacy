# Hoops Legacy: handoff for AI agents

Read this first if you are picking the project up cold. It says what the game is, how it is built, what was added recently and why, what is in flight, and the traps that cost time. Keep it current: when you finish a piece of work, update the **Roadmap** and **Recent changes** sections.

## What this is

A basketball career RPG in TypeScript: a player goes high school → college → pro. A deterministic engine owns every fact (ratings, games, money, relationships); an optional LLM narrator only *tells* the story and may *propose* small effects that the engine clamps. React + Zustand + Tailwind in the browser, plus an Electron desktop build with a bundled local model (`desktop/`). `README.md` documents setup, desktop packaging and the engine layout. This file covers the build history and working knowledge.

**Core rule: the engine owns the facts.** The narrator never decides outcomes. Anything that changes the save goes through engine functions (`applyEffects` for LLM proposals, the engine modules for everything else). New features must work with no LLM at all.

## Working here (environment traps)

- **Windows 11, Git Bash and PowerShell.** Python is not installed. Source files have **CRLF** line endings (git `autocrlf=true`). The Edit tool copes; hand-rolled Node scripts must normalize `\r\n` → `\n` before matching and restore afterwards.
- **Bash heredocs containing `$` or template strings are sometimes blocked by a safety check** ("could not be checked for dangerous rm operations"). If that happens, write the script with the Write tool and run it with `node path`. Never chain a delete with a heredoc.
- Commands: `npm run typecheck` (app + desktop), `npx vitest run` (about 250 tests, ~35 s), `npx vite build`, `npm run dev`. Always run typecheck and the full suite before calling something done.
- **Do not commit unless the user asks.** Nothing from the recent work has been committed.
- Use they/them for anyone whose pronouns are not stated. Avoid gendered pronouns in game text (the player's gender is not chosen).
- The user wants honesty about what was and was not verified. There is no browser available in the agent environment: UI is checked with server-render tests (`src/ui/screens.test.ts`), not by eye. Say so.

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
| `testkit.ts` | shared test helpers: `tick`, `playUntil`, `answerLife` (imports vitest `expect`; tests only) |

Keep this table current when you add a module.

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
- `leaders.ts`: `leaders()`, `rankOf()`, `perGame()`, qualifying minimums (FG% 3.5 attempts a game, 3P% 1.5, FT% 1.5, counted against games the league has played), ties share a rank. `archiveSeasonStats` files each athlete's finished season on `Athlete.prev` at the season turn.
- `athleteCard.ts` + `AthleteCardModal` + `PlayerLink`: click any player's name (League roster, leaders, MVP race, box scores, newspaper, recruiting targets, draft board, People) to open their card (`store.openCard`).
- `paper.ts`: `publishIssue(state, kind)` is called from `advanceWeekCore` (preview when preseason ends, weekly after a regular-season week, weekly again after a playoff week) and `finishPlayoffsAndSeason` (recap). It uses its own seeded RNG, so printing never moves `state.rngState` (tested). The store polishes the lead story with the narrator when one is connected (same numbers-must-match rule as other narration). Newspaper tab has an unread dot (`paperSeen`).
- **Simulation fix found while building this:** the shot-share curve in `gameSim.ts` (`usage()`) was `exp(x/9)`, which let one star take over half a team's shots (scoring leaders of 36 / 43 / 53 ppg at HS / college / pro). It is now `exp(x/16)`: leaders about 25 / 28 / 39 and team scoring unchanged (about 59 / 71 / 101). A guard test (`paper.test.ts`) keeps a scorer under 45% of team points. **Known remaining oddity:** the very best shooters still post 55-65% from three and 64-67% from the field; that comes from the shot-odds model (`shotOdds`), not usage, and was left alone because it needs a wider rebalance.

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

## Traps already hit (do not repeat)

- **A fixed salary cap broke free agency.** League payrolls run \$100-255M (NPC growth inflates ratings), so a \$100M cap left every team with no room and every offer collapsed to the minimum. The only symptom was an unrelated balance test (endorsements vs money) drifting. When a balance guardrail moves, **measure the distribution over ~24 seeds** (copy `play()` from `balance.test.ts` into a scratch file) before touching the bound.
- **Duplicate NPC names.** Anything that creates an NPC from a coach/athlete name must go through `adoptCoach` or `NameBook`; `names.test.ts` ("stay unique through every season") catches this over a whole career.
- **Weekly RNG shifts seeded tests.** Adding a random call per week (recruiting tick, etc.) changed outcomes in tests that depended on a specific seed. Fix the test's setup (e.g. make the player a starter) rather than the feature.
- Life events are answered *before* a test measures money. A ledger that "starts negative" is usually an event cost resolved while waiting for the preseason: compare changes, not absolutes.

## Known limitations and honest gaps

- UI was never viewed in a real browser by the agent; only render-tested.
- League trades and signings are simple one-for-one swaps and pool picks.
- Numbers (pay, event frequency, odds) are untuned.
- LLM narration of the new engine-written systems is not yet wired (see roadmap I).
