import { useState, type ReactNode } from 'react';
import { PLANS } from '../../engine/gameplan';
import { RATING_INFO } from '../../engine/ratings';
import { RATING_KEYS, RATING_LABELS } from '../../state/schemas';
import { TRAINING_OPTIONS } from '../../engine/progression';
import { TIER_LABELS, TIER_MIN } from '../../engine/legacyScore';
import { useStore } from '../../state/store';
import { Button, Panel, cx } from '../components/ui';
import { GROUPS, TABS } from '../screens/tabs';

type Section = { id: string; title: string; body: ReactNode };

const P = ({ children }: { children: ReactNode }) => <p className="text-sm leading-relaxed text-ink-300">{children}</p>;
const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-ink-100">{children}</strong>;
const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="space-y-1.5 text-sm text-ink-300">
    {items.map((x, i) => (
      <li key={i} className="flex gap-2">
        <span className="text-hoop-400" aria-hidden>
          •
        </span>
        <span className="min-w-0">{x}</span>
      </li>
    ))}
  </ul>
);

const TERMS: [string, string][] = [
  ['OVR', 'Overall rating, 0 to 99. A weighted blend of all your ratings.'],
  ['POT', 'Potential: roughly how high a player can grow. Young players with high potential develop fastest.'],
  ['PPG / RPG / APG', 'Points, rebounds and assists per game.'],
  ['FG% / 3P% / FT%', 'Share of field goals, threes and free throws that went in.'],
  ['TS%', 'True shooting. Points per shooting possession, counting threes and free throws. Better than FG% for comparing scorers.'],
  ['eFG%', 'Effective field goal percentage: FG% with a made three counted as 1.5 shots.'],
  ['AST/TO', 'Assists per turnover. Higher means safer with the ball.'],
  ['IMP/36', 'Points + rebounds + assists + steals + blocks per 36 minutes. A quick way to compare players who play different minutes.'],
  ['vs OVR', 'How much a player produces above (+) or below (−) what their rating usually does. Spots breakouts and underachievers.'],
  ['GmSc', 'Game score: one number for how good a single game was.'],
];

const TAB_HELP: Record<string, string> = {
  hub: 'the week, your next game, goals, the standings and headlines.',
  paper: 'a printed edition every week: results, leaders, milestones and gossip.',
  profile: 'ratings, bio, career stats, career highs, badges and trophies.',
  relationships: 'family, friends, teammates, coaches and rivals.',
  story: 'the running narrative and open storylines.',
  memory: 'what the game remembers about your past choices.',
  league: 'standings, schedule, playoffs, awards and team rosters.',
  stats: 'all players, your advanced stats, teams and the record books.',
  media: 'social media, followers and endorsement offers.',
  money: 'your bank, income, spending and what you can buy.',
  recruiting: 'who is watching you, and who you are chasing.',
  help: 'this guide.',
};

const FAQ: [string, string][] = [
  ['Do I need the AI storyteller?', 'No. Every system works without it, and the game tells its stories from templates. Connecting a model makes the narration more personal and uses your background and history.'],
  ['Where is my save?', 'In this browser, on this device. Clearing site data erases it, so avoid that, and export a save from the title screen if you want a backup.'],
  ['Can I undo a choice?', 'No. The game is built around living with what you picked. You can always start a new career.'],
  ['Why did my ratings drop?', 'Age and long injuries can lower ratings, and a bad injury can cost you a step. Rehab helps you recover and protects against that.'],
  ['What is the difference between Morale and Rep?', 'Morale is how you feel right now and affects performance. Rep is how the world sees you and affects offers, recruiting and the draft.'],
  ['The page looks cramped on my phone.', 'Use the bottom bar for the main tabs and More for the rest. Landscape and tablets use a wider layout.'],
];

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'Getting started',
    body: (
      <div className="space-y-3">
        <P>
          You play one basketball career, week by week, from high school to the pros and then retirement. Your choices shape your ratings, your relationships, your money and your story. The <B>game engine decides what happens</B>; the AI storyteller (if you connect one) only tells it.
        </P>
        <List
          items={[
            <>
              Open <B>Play → This Week</B>. It always shows what to do next.
            </>,
            <>
              A week has four steps, shown across the top: <B>1. training</B>, <B>2. scene</B>, <B>3. game</B>, <B>4. wrap-up</B>.
            </>,
            <>
              Keep an eye on the three bars at the top: <B>Energy</B>, <B>Morale</B> and <B>Rep</B>. Most choices move one of them.
            </>,
            <>
              Your progress saves after every action. <B>Save and quit</B> (⏏) returns you to the title screen, where you can pick the career up again.
            </>,
          ]}
        />
      </div>
    ),
  },
  {
    id: 'week',
    title: 'A week, step by step',
    body: (
      <div className="space-y-3">
        <List
          items={[
            <>
              <B>Training.</B> Pick one focus for the week. It costs energy and improves the matching ratings. Rest gives energy back instead.
            </>,
            <>
              <B>Scene.</B> Something happens off the court, and often you choose how to respond. Choices can change morale, reputation, relationships and money, and some come back later.
            </>,
            <>
              <B>Game.</B> Choose a game plan, optionally spend the day on film, then play it live or let it sim.
            </>,
            <>
              <B>Wrap-up.</B> See what changed, then move to the next week. A new edition of the newspaper prints.
            </>,
          ]}
        />
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-500">Training options</div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {TRAINING_OPTIONS.map((t) => (
              <div key={t.id}>
                <dt className="font-semibold text-ink-100">
                  {t.label} <span className="font-mono text-xs text-ink-500">{t.energy > 0 ? `+${t.energy}` : t.energy} energy</span>
                </dt>
                <dd className="text-xs text-ink-400">{t.desc}</dd>
              </div>
            ))}
          </dl>
        </div>
        <P>Heavy training with low energy wears you down and raises your injury risk. When the bar is low, rest.</P>
      </div>
    ),
  },
  {
    id: 'game',
    title: 'Playing a game',
    body: (
      <div className="space-y-3">
        <P>Before tip-off you pick a plan. The scouting card tells you what the other team is weak at and recommends a plan.</P>
        <dl className="space-y-1.5 text-sm">
          {PLANS.map((p) => (
            <div key={p.id}>
              <dt className="font-semibold text-ink-100">
                <span aria-hidden>{p.icon}</span> {p.name}
              </dt>
              <dd className="text-xs text-ink-400">{p.effect}</dd>
            </div>
          ))}
        </dl>
        <List
          items={[
            <>
              <B>Live game.</B> Watch the play-by-play and the court. The speed buttons slow it down or speed it up; <B>Skip</B> jumps to the next key moment.
            </>,
            <>
              <B>Key moments.</B> The game stops at big plays and asks what you do. Better ratings and the right badge or signature move improve your odds.
            </>,
            <>
              <B>Film study</B> before a game costs a little energy and gives you a small edge against that opponent.
            </>,
            <>
              <B>Hurt?</B> You can play through an injury, but it risks making it worse.
            </>,
          ]}
        />
      </div>
    ),
  },
  {
    id: 'tabs',
    title: 'What every tab is for',
    body: (
      <div className="space-y-3">
        <P>The menu is in groups. On a phone the bottom bar holds the main four and everything else is under More.</P>
        <dl className="space-y-3 text-sm">
          {GROUPS.map((g) => (
            <div key={g.id}>
              <dt className="font-semibold text-ink-100">
                <span aria-hidden>{g.icon}</span> {g.label}
              </dt>
              <dd className="mt-0.5 space-y-0.5 text-xs text-ink-400">
                {g.tabs.map((id) => {
                  const t = TABS.find((x) => x.id === id)!;
                  return (
                    <div key={id}>
                      <span className="font-semibold text-ink-300">{t.label}</span>: {TAB_HELP[id]}
                    </div>
                  );
                })}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    ),
  },
  {
    id: 'ratings',
    title: 'Your player',
    body: (
      <div className="space-y-3">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {RATING_KEYS.map((k) => (
            <div key={k}>
              <dt className="text-ink-100">
                <span className="mr-2 font-mono text-xs font-semibold text-hoop-400">{RATING_LABELS[k]}</span>
                <B>{RATING_INFO[k].name}</B>
              </dt>
              <dd className="text-xs text-ink-400">{RATING_INFO[k].what}</dd>
            </div>
          ))}
        </dl>
        <List
          items={[
            <>
              <B>Ratings</B> decide almost everything that happens in a game. Your <B>overall</B> sums them up. Each one has a three-letter shorthand, listed below.
            </>,
            <>
              <B>Archetype and position</B> shape your starting ratings and how you play. A sharpshooter and a big man grow in different ways.
            </>,
            <>
              <B>Badges and signature moves</B> are earned through play and unlock better moments in a live game. See them on the Player tab.
            </>,
            <>
              <B>Age matters.</B> Young players with high potential grow quickly. Ratings level off and eventually slip as you get older, so use the early years.
            </>,
            <>
              <B>Your background</B> (family, motive, temperament) was chosen at creation. It gives a real edge and a real cost, and it decides which moments come looking for you.
            </>,
          ]}
        />
      </div>
    ),
  },
  {
    id: 'school',
    title: 'School, recruiting and the draft',
    body: (
      <List
        items={[
          <>
            <B>Grades.</B> In high school and college you need a passing GPA to play. Choose Hit the Books in training when it slips.
          </>,
          <>
            <B>Recruiting.</B> Good play gets colleges interested. In your last high school years you pick where to go; in college you may transfer or declare for the draft. The Recruiting tab shows who is watching.
          </>,
          <>
            <B>The draft.</B> Your rating, production and reputation decide where you go. Going undrafted is not the end, but it is harder.
          </>,
          <>
            <B>Pros.</B> Contracts, free agency and endorsement offers. Money buys training staff and comfort, and tells its own story.
          </>,
        ]}
      />
    ),
  },
  {
    id: 'stats',
    title: 'Stats, records and terms',
    body: (
      <div className="space-y-3">
        <List
          items={[
            <>
              <B>Stats → Players</B> lists every player in the league. Switch between <B>Basic</B> and <B>Advanced</B>, search, filter by position, and tap a column heading to sort.
            </>,
            <>
              <B>Stats → Records</B> keeps the top ten for one game and one season, by league level. Your own marks are highlighted. Your personal bests are on the Player tab under Career highs.
            </>,
          ]}
        />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {TERMS.map(([k, v]) => (
            <div key={k}>
              <dt className="font-mono text-xs font-semibold text-hoop-400">{k}</dt>
              <dd className="text-xs text-ink-400">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    ),
  },
  {
    id: 'legacy',
    title: 'Goals, legacy and the Hall of Fame',
    body: (
      <div className="space-y-3">
        <List
          items={[
            <>
              <B>Goals.</B> You always have three long-term goals on the hub. Finishing one brings a new one.
            </>,
            <>
              <B>Legacy score.</B> Your finished career is scored on titles, awards and stats, and ranked in the Hall of Fame on the title screen. Money and family do not count.
            </>,
            <>
              <B>Next generation.</B> When you retire, you can keep the same save and play your kid (or a protégé) in a fresh league. Your career goes into the family record, and the heir's first goal is to go further.
            </>,
          ]}
        />
        <div className="flex flex-wrap gap-2 text-xs">
          {TIER_LABELS.map((t, i) => (
            <span key={t} className="rounded-full border border-court-600 px-2.5 py-1 text-ink-300">
              {t} <span className="font-mono text-ink-500">{TIER_MIN[i]}+</span>
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'tips',
    title: 'Tips for a good first career',
    body: (
      <List
        items={[
          <>Rest when Energy is under about 35. Playing tired makes you worse and gets you hurt.</>,
          <>Train what your archetype needs first, then fill the gaps. One weak rating can cost you in a key moment.</>,
          <>Read the scouting card before games: the recommended plan is usually right.</>,
          <>Watch your grades early. Falling behind is easier than catching up.</>,
          <>Treat people well. Coaches, teammates and family come back in the story, for better or worse.</>,
          <>Check the Newspaper each week: it shows streaks, milestones and how your goals are coming along.</>,
          <>Do not worry about mistakes. A bad choice becomes part of the story, and the story is the point.</>,
        ]}
      />
    ),
  },
  {
    id: 'faq',
    title: 'Questions',
    body: (
      <dl className="space-y-3 text-sm">
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <dt className="font-semibold text-ink-100">{q}</dt>
            <dd className="mt-0.5 text-ink-300">{a}</dd>
          </div>
        ))}
      </dl>
    ),
  },
];

/** The guide for new players, and a reference for old ones. */
export function HelpView() {
  const [open, setOpen] = useState<string>('start');
  const setTab = useStore((s) => s.setTab);
  const startTour = useStore((s) => s.startTour);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Guide sections" className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin lg:flex-col lg:overflow-visible lg:pb-0">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => setOpen(s.id)} aria-current={open === s.id ? 'true' : undefined} className={cx('min-h-9 shrink-0 rounded-lg border px-3 py-1.5 text-left text-sm font-semibold transition-colors', open === s.id ? 'border-hoop-500 bg-hoop-500/10 text-hoop-400' : 'border-court-700 text-ink-300 hover:border-court-500')}>
            {s.title}
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hoop-500/40 bg-hoop-500/5 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-ink-100">New here?</div>
            <div className="text-xs text-ink-400">A one-minute tour walks you through the screens, with the real controls lit up.</div>
          </div>
          <Button onClick={startTour}>Take the tour</Button>
        </div>
        {SECTIONS.filter((s) => s.id === open).map((s) => (
          <Panel key={s.id} title={s.title}>
            {s.body}
          </Panel>
        ))}
        <button onClick={() => setTab('hub')} className="text-sm font-semibold text-hoop-400 hover:text-hoop-500">
          ← Back to the week
        </button>
      </div>
    </div>
  );
}
