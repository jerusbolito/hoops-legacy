# What's new

Only the big things: new systems, engine changes, and anything that changes how the game plays. Newest first. The game shows this on the title screen (**What's new**), read straight from this file.

## 1.1.0

### A living league
- **Random life events.** Dozens of things that just happen in real life: injuries off the court, family news, money trouble, windfalls, and moments with teammates and coaches. Many give you a choice.
- **Money that makes sense.** Pay, taxes, agent fees and a ledger you can read, plus things to spend on (trainers, tutors). Pro contracts, extensions and holdouts, with a salary cap that follows the league.
- **Transfers and trade requests.** Transfer schools after a season, or ask for a trade as a pro.
- **Free agency, trades and the coach carousel.** NPCs transfer, get traded, sign as free agents and get fired too.
- **Recruiting both ways.** Schools recruit you, and you recruit other players to your team.
- **A real draft.** A full draft class and a big board, with you on it.
- **Rivals and friends have careers.** They grow up, change teams and get real minutes, so a senior rival is no longer treated like a freshman.
- **Chemistry and captaincy, awards races and All-Stars, injury comebacks, rivalry games, romance and family.**

### Stats and the paper
- **Player cards** for anyone in the game, with season averages and career lines. Click a name anywhere to open one.
- **League leaders** in scoring, rebounds, assists, steals, blocks, shooting and more.
- **A weekly newspaper** covering your team and the whole league: headline, scoreboard, players of the week, standings and back issues.

### Engine
- Stars no longer take more than half the shots (the usage curve was too steep).
- The salary cap now tracks the league (1.2x the median payroll). A fixed cap had broken free agency.
- Faster seasons: a quadratic slowdown in games-played counting is gone.

### Desktop app: pick a model that fits your computer
- **Four story models**, from Gemma 4 12B down to Qwen3 1.7B for very small computers. They were tested with the game's real prompts. See `docs/model-quality.md`.
- **The first-run screen shows the choice up front**, with a "best for this computer" pick based on your graphics card and memory.
- **Model manager** (the settings button in the game): see what is downloaded, free up space, switch models.
- **"Replies are slow" nudge** offers a lighter model in one click.
- **Uninstalling removes the downloaded models** and keeps your saved careers. Updates keep them.
- Smaller models can no longer leak internal ids into the story, and they do not retell results they might get wrong.

## 1.0.0

- The first release: a text basketball career from high school to the pros and retirement, with every number decided by the engine and the story written by an AI you bring (a key, or a local model).
- Memory for the storyteller, portraits, analytics, game prep, badges, coach trust, media and endorsements, and key moments with lasting consequences.
- **The desktop app**: runs its own AI on your computer, with nothing to sign up for.
