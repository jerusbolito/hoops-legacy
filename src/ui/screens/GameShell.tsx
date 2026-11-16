import { LEVEL_CONFIG, yearLabel } from '../../data/teams';
import { getDesktop } from '../../desktop/bridge';
import { userAthlete, userRole, userTeam } from '../../engine/career';
import { overall } from '../../engine/ratings';
import { usePrefs } from '../../state/prefs';
import { useStore, type Tab } from '../../state/store';
import { motion } from 'framer-motion';
import { useRef } from 'react';
import { Avatar, Button, Meter, TeamBadge, cx } from '../components/ui';
import { RevealOverlay } from '../components/RevealOverlay';
import { AnalyticsView } from '../views/AnalyticsView';
import { HubView } from '../views/HubView';
import { MediaView } from '../views/MediaView';
import { MemoryView } from '../views/MemoryView';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { EventModal } from '../components/EventModal';
import { LifeEventModal } from '../components/LifeEventModal';
import { AthleteCardModal } from '../components/AthleteCardModal';
import { MoneyView } from '../views/MoneyView';
import { NewspaperView } from '../views/NewspaperView';
import { RecruitingView } from '../views/RecruitingView';
import { LeagueView } from '../views/LeagueView';
import { ProfileView } from '../views/ProfileView';
import { RelationshipsView } from '../views/RelationshipsView';
import { StoryView } from '../views/StoryView';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'hub', label: 'This Week', icon: '📅' },
  { id: 'profile', label: 'Player', icon: '⛹️' },
  { id: 'relationships', label: 'People', icon: '🤝' },
  { id: 'league', label: 'League', icon: '🏆' },
  { id: 'paper', label: 'Newspaper', icon: '📰' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'media', label: 'Media', icon: '📱' },
  { id: 'money', label: 'Money', icon: '💰' },
  { id: 'recruiting', label: 'Recruiting', icon: '🎯' },
  { id: 'story', label: 'Story', icon: '📖' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
];

/** Short money for the header: $850, $12K, $3.2M. */
const shortMoney = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n).toLocaleString()}`);

function OverallBadge({ value }: { value: number }) {
  const prev = useRef(value);
  const changed = prev.current !== value;
  const up = value > prev.current;
  prev.current = value;
  return (
    <motion.span
      key={value}
      initial={changed ? { scale: 1.7, color: up ? '#22c55e' : '#ef4444' } : false}
      animate={{ scale: 1, color: '#fb923c' }}
      transition={{ type: 'spring', stiffness: 220, damping: 14 }}
      className="inline-block font-mono text-sm"
      title="Overall rating"
    >
      {value}
    </motion.span>
  );
}

export function GameShell() {
  const game = useStore((s) => s.game)!;
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const close = useStore((s) => s.closeCareer);
  const setScreen = useStore((s) => s.setScreen);
  const openManager = useStore((s) => s.openModelManager);
  const liveActive = useStore((s) => !!s.live);
  const prefs = usePrefs();
  const eventId = useStore((s) => s.eventId);
  const revealId = useStore((s) => s.reveals[0]?.id);
  /** Closes whichever pop-up broke and says so. Progress is saved after every action, so nothing is lost. */
  const cardKey = useStore((s) => s.cardId);
  const paperSeen = useStore((s) => s.paperSeen);
  const lifeKey = useStore((s) => s.game?.career.lifeEvent?.id ?? s.lifeOutcome?.id);
  const closeBroken = (what: 'event' | 'reveal' | 'life') => {
    const s = useStore.getState();
    if (what === 'event') s.closeEvent();
    else if (what === 'life') s.dismissLifeOutcome();
    else s.dismissReveal();
    s.toast('That screen had a problem, so it was closed. Your progress is saved.', 'bad');
  };

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
            <Avatar name={`${a.firstName} ${a.lastName}`} size={44} ring={team.colors[0]} colors={team.colors} mood="happy" />
            <div>
              <div className="font-display text-lg leading-tight font-semibold">
                {a.firstName} {a.lastName} <OverallBadge value={overall(a.ratings)} />
                {game.legacy.generation > 1 && <span className="ml-2 rounded border border-gold/40 px-1 py-px align-middle text-[10px] font-semibold uppercase tracking-widest text-gold">Gen {game.legacy.generation}</span>}
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
          <button onClick={() => setTab('money')} title="Your money. Open the Money tab." className="rounded-md border border-court-700 px-2 py-1 font-mono text-xs text-gold hover:border-gold/60">
            💰 {shortMoney(p.money)}
          </button>
          {p.injury && <span className="rounded-md bg-loss/15 px-2 py-1 text-xs font-semibold text-loss">🩹 {p.injury.desc} · {p.injury.weeks}w</span>}
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" title={prefs.sound ? 'Mute sound' : 'Turn sound on'} aria-pressed={prefs.sound} onClick={() => prefs.set({ sound: !prefs.sound })}>
              {prefs.sound ? '🔊' : '🔇'}
            </Button>
            <Button variant="ghost" title={prefs.flashy ? 'Calm mode: turn off big effects' : 'Turn big effects on'} aria-pressed={prefs.flashy} onClick={() => prefs.set({ flashy: !prefs.flashy })}>
              {prefs.flashy ? '✨' : '◻️'}
            </Button>
            <Button variant="ghost" title={getDesktop() ? 'Story model' : 'AI settings'} onClick={() => (getDesktop() ? openManager() : setScreen('setup'))} disabled={liveActive}>
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
              {t.id === 'paper' && tab !== 'paper' && (game.paper[game.paper.length - 1]?.id ?? 0) > paperSeen && <span className="h-2 w-2 rounded-full bg-hoop-500" aria-label="new edition" />}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {tab === 'hub' && <HubView />}
        {tab === 'profile' && <ProfileView />}
        {tab === 'relationships' && <RelationshipsView />}
        {tab === 'league' && <LeagueView />}
        {tab === 'paper' && <NewspaperView />}
        {tab === 'analytics' && <AnalyticsView />}
        {tab === 'media' && <MediaView />}
        {tab === 'money' && <MoneyView />}
        {tab === 'recruiting' && <RecruitingView />}
        {tab === 'story' && <StoryView />}
        {tab === 'memory' && <MemoryView />}
      </main>
      {/* A pop-up that breaks closes itself and the game carries on, instead of taking the whole page down with it */}
      <ErrorBoundary resetKey={eventId} fallback={() => null} onError={() => closeBroken('event')}>
        <EventModal />
      </ErrorBoundary>
      <ErrorBoundary resetKey={cardKey} fallback={() => null} onError={() => useStore.getState().closeCard()}>
        <AthleteCardModal />
      </ErrorBoundary>
      <ErrorBoundary resetKey={lifeKey} fallback={() => null} onError={() => closeBroken('life')}>
        <LifeEventModal />
      </ErrorBoundary>
      <ErrorBoundary resetKey={revealId} fallback={() => null} onError={() => closeBroken('reveal')}>
        <RevealOverlay />
      </ErrorBoundary>
    </div>
  );
}
