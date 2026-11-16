# Changelog entry for the next release (draft)

Held back on purpose: `src/changelog.test.ts` requires the newest entry in `CHANGELOG.md` to match the version in `package.json`. When you cut the release, bump `package.json` (and `package-lock.json`) to 1.2.0 and paste the block below at the top of `CHANGELOG.md`, above `## 1.1.0`.

```md
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

### The paper remembers
- **Milestones and streaks.** Career-point and rebound milestones, career nights, first double- and triple-doubles, win and cold streaks, and goals coming into view, each told once the week it happens.
- **From the archives.** Anniversaries of old titles, and how an heir is doing against the parent's career.
```
