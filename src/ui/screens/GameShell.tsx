import { LEVEL_CONFIG, yearLabel } from '../../data/teams';
import { userAthlete, userRole, userTeam } from '../../engine/career';
import { overall } from '../../engine/ratings';
import { useStore, type Tab } from '../../state/store';
import { Avatar, Button, Meter, TeamBadge, cx } from '../components/ui';
import { HubView } from '../views/HubView';
import { LeagueView } from '../views/LeagueView';
import { ProfileView } from '../views/ProfileView';
import { RelationshipsView } from '../views/RelationshipsView';
import { StoryView } from '../views/StoryView';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'hub', label: 'This Week', icon: '📅' },
  { id: 'profile', label: 'Player', icon: '⛹️' },
  { id: 'relationships', label: 'People', icon: '🤝' },
  { id: 'league', label: 'League', icon: '🏆' },
  { id: 'story', label: 'Story', icon: '📖' },
];

export function GameShell() {
  const game = useStore((s) => s.game)!;
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const close = useStore((s) => s.closeCareer);
  const setScreen = useStore((s) => s.setScreen);
  const liveActive = useStore((s) => !!s.live);

  const a = userAthlete(game);
  const team = userTeam(game);
  const c = game.career;
  const p = game.player;
  const phaseLabel =
    c.phase === 'regular' ? `Week ${c.week}/${game.league.regularWeeks}` : c.phase === 'playoffs' ? 'Playoffs' : c.phase === 'preseason' ? 'Preseason' : c.phase === 'offseason' ? 'Offseason' : c.phase.replace('_', ' ');

  return (
    <div className="flex min-h-full flex-col">
      <header className="hardwood sticky top-0 z-30 border-b border-court-700 bg-court-900/90 backdrop-blur" style={{ boxShadow: `inset 0 -2px 0 ${team.colors[0]}` }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Avatar name={`${a.firstName} ${a.lastName}`} size={40} ring={team.colors[0]} />
            <div>
              <div className="font-display text-lg leading-tight font-semibold">
                {a.firstName} {a.lastName} <span className="font-mono text-sm text-hoop-400">{overall(a.ratings)}</span>
              </div>
              <div className="text-xs text-ink-400">
                {a.position} · {userRole(game).label}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TeamBadge team={team} size={32} />
            <div className="text-xs leading-tight">
              <div className="font-semibold text-ink-100">
                {team.name} {team.mascot}
              </div>
              <div className="text-ink-400">
                {LEVEL_CONFIG[c.level].label} · {yearLabel(c.level, c.year)} · S{c.season} · <span className="capitalize">{phaseLabel}</span>
              </div>
            </div>
          </div>
          <div className="flex min-w-[260px] flex-1 items-center gap-4">
            <Meter className="flex-1" label="Energy" value={p.energy} color={p.energy < 35 ? 'var(--color-loss)' : '#38bdf8'} />
            <Meter className="flex-1" label="Morale" value={p.morale} color={p.morale < 35 ? 'var(--color-loss)' : 'var(--color-win)'} />
            <Meter className="flex-1" label="Rep" value={p.reputation} color="var(--color-gold)" />
          </div>
          {p.injury && <span className="rounded-md bg-loss/15 px-2 py-1 text-xs font-semibold text-loss">🩹 {p.injury.desc} · {p.injury.weeks}w</span>}
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" title="AI settings" onClick={() => setScreen('setup')} disabled={liveActive}>
              ⚙
            </Button>
            <Button variant="ghost" title="Save & quit" onClick={close} disabled={liveActive}>
              ⏏
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 scrollbar-thin">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx('flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors', tab === t.id ? 'border-hoop-500 text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-100')}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {tab === 'hub' && <HubView />}
        {tab === 'profile' && <ProfileView />}
        {tab === 'relationships' && <RelationshipsView />}
        {tab === 'league' && <LeagueView />}
        {tab === 'story' && <StoryView />}
      </main>
    </div>
  );
}
