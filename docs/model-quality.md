# Story model quality

The desktop app offers four models. This is what each one does with the game's real prompts, measured on one machine
(Ryzen 7 7800X3D, RTX 5070 Ti 16 GB, Windows 11). Numbers on other computers will differ; the shape will not.

Run it yourself (needs the models in `build/models/`, which `node scripts/fetch-model.mjs <id>` downloads):

```bash
HOOPS_QUALITY=gemma-4-e4b,gemma-4-e2b,qwen3-1.7b npx vitest run desktop/realQuality                       # graphics card
HOOPS_QUALITY=gemma-4-e4b,gemma-4-e2b,qwen3-1.7b HOOPS_QUALITY_CPU=1 npx vitest run desktop/realQuality    # processor only
```

It starts the real engine, runs the real `generateScene`, `resolveScene`, `generateRecap`, `generateSeasonSummary` and
`narrateResult` over high-school, college and pro game states, and writes `quality-report/<id>.json` (git-ignored; it
holds every output, so read it when a number looks wrong). "AI" means the model's text was used, "first try" means no
repair round was needed, "flagged" means a check I wrote found something odd (a name outside the cast, a guessed gender,
an effect the engine rejected).

## Results

| Model | Size | Video memory | On a graphics card | Processor only | Stories used (AI) | Flagged |
|---|---|---|---|---|---|---|
| Gemma 4 12B | 7.0 GB | 8.0 GB | 5.2 s a scene, 79 tok/s | not measured (minutes) | 100% | 0% |
| Gemma 4 E4B | 5.2 GB | 3.2 GB | 7.4 s, 143 tok/s | **73 s**, 16 tok/s | 97% | 3% |
| Gemma 4 E2B | 3.3 GB | 2.1 GB | 1.5 s, 219 tok/s | 13 s, 31 tok/s | 100% | 23% |
| Qwen3 1.7B | 1.1 GB | 2.6 GB | 1.2 s, 312 tok/s | 16 s, 32 tok/s | 87%* | 13% |

\* Qwen3 does not retell results (see below), so those three trials always use the engine's own text and count as "not AI".
Its scenes and outcomes were 23 of 24 AI.

Things that were measured and shaped the product:

- **The E4B is not a processor model.** On a fast 8-core desktop processor it takes over a minute a scene. It is
  recommended only with a graphics card (4.5 GB or more). With no card the game recommends E2B.
- **Qwen3 1.7B is not faster than E2B on a processor** (similar tokens a second). It earns its place on memory: it fits
  in a 4 GB computer where E2B does not. Its writing is simpler, it sometimes repeats a choice, and it invents small
  details, so it is the last tier, not a general recommendation.
- **Gemma 3 1B was rejected**: 26% of its answers were unusable and fell back to template text.
- **Small models leak.** Early runs had internal ids in the prose ("(npc_hsvcmq)", "withnpc_1l8tdh4") and duplicate
  choices. Fixed in the game, not by hoping: `scrubIds` in `src/narrative/parse.ts` strips ids from all story text,
  `generateScene` sends duplicate choices back for one repair, and the prompts say where ids may appear.
- **Retelling results is the risky job.** `narrateResult` rewrites an engine-written paragraph (a transfer, a trade, a
  newspaper lead) in the story's voice. E2B and Qwen3 guessed genders and swapped who moved, so they do not do it
  (`retell: false` in `desktop/pins.json`); the player sees the engine's text, which is always correct. 12B and E4B do.
- **Video memory minimums** in `pins.json` are the measured peaks with the game's 8k context, rounded up.

## What a player gives up by going down a tier

| From | To | What changes |
|---|---|---|
| 12B | E4B | Plainer prose, slightly more repetition. Same rules, same facts. |
| E4B | E2B | Simpler stories; results are not retold (the engine's text is shown). A few odd names or details. |
| E2B | Qwen3 1.7B | Shorter, simpler, sometimes odd writing; more moments use the game's built-in text. Needs only about 4 GB. |

The numbers in the game (stats, contracts, standings) never come from the model, so a smaller model changes how the story
reads, not what happens.
