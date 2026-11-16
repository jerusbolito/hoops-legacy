# What's new

Only the big things: new systems, engine changes, and anything that changes how the game plays. Newest first. The game shows this on the title screen (**What's new**), read straight from this file.

## 1.2.0

### Legacy
- **Play the next generation.** When your career ends, carry the same save on with your kid (or, with no kids, a young player you took under your wing). The world moves on a few years, a new high school league forms around them, and the old career goes into the family record. Fame is only a head start: a little rating, reputation and family money.
- **A Hall of Fame across every career.** Each finished career is scored on titles, awards and stats, ranked from Journeyman up to Immortal, and kept on the title screen, best first.
- **Long-term goals.** Three targets are always in sight (the résumé, the player, life), from "Win 3 championships" to "Reach the Hall of Fame". Finish one and the next arrives. An heir's first goal is to out-achieve their parent.

### Character creation that matters
- **Where you come from.** Tight money, working family, comfortable, athletic family or well off. It sets your starting money and allowance, who is in your corner, and what keeps coming up at home.
- **Why you play.** Prove them wrong, take care of family, love of the game, or chase the spotlight. It sets your first long-term goal and which moments come looking for you.
- **How you carry yourself.** Steady, fiery, loyal, charming or lone wolf. It changes how coaches, teammates and the press react to you.
- **Look and build.** Choose your skin tone, hair, jersey number and build. Your face is yours everywhere in the game, and a lean or strong build moves a few ratings around.
- **Every choice has a price**, shown on the card before you pick it, with a running summary of what your mix does. Sixteen new moments and the story itself are built around who you chose to be.

### Made for your phone
- **A bottom tab bar** with the four tabs you use most and a More sheet for the rest (People, Money, Recruiting and so on), plus sound, calm mode, AI settings and save and quit. The wide-screen tab strip is unchanged.
- **A much shorter header** on a phone, and it scrolls away instead of following you down the page.
- **The live game fits the screen.** A compact scoreboard, real-size speed and skip buttons, the court first and the play-by-play under it, and nothing else on the page. Key moments and life events now come up from the bottom, where your thumb is.
- **Fixed pages that scrolled sideways** (the People tab was wider than the screen), bigger tap targets for names, buttons and the look pickers, back issues of the paper as a swipeable strip, and room for the notch and home bar.

### The paper remembers
- **Milestones and streaks.** Career-point and rebound milestones, career nights, first double- and triple-doubles, win and cold streaks, and goals coming into view, each told once the week it happens.
- **From the archives.** Anniversaries of old titles, and how an heir is doing against the parent's career.

### Menu, stats and a guide
- **A tidier menu.** The tabs are now in five groups (Play, Career, League, Life, Guide). On desktop a row of groups sits over the pages of the open one; on a phone the More sheet is grouped the same way.
- **One Stats tab.** Analytics is now Stats: every player in the league (Basic and Advanced views, with shooting percentages, true shooting, eFG% and assist-to-turnover), your own advanced game, teams and the record books.
- **A guide for new players.** A Guide page explains the week, training, game plans, every tab, ratings, stats terms, goals and legacy, with tips and common questions. A brand-new career opens with a short welcome that links to it.

### Records
- **Record books.** Under Stats, Records keeps the top ten for points, rebounds, assists, steals, blocks and threes in a single game, and for a season (totals, plus points, rebounds and assists per game). Every player in the league counts, not only you. Browse high school, college, pro or all leagues together; your own marks are highlighted.
- **Career highs.** The Player tab shows your best night and best season in each category, with a badge when one made the record books. Older saves rebuild your marks from your game log.

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
