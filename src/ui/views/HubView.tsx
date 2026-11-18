import { nextOpponent, standingsRows } from '../../engine/career';
import { useStore } from '../../state/store';
import { MIN_GPA, academicStatus } from '../../engine/consequences';
import { ChemistryCard } from '../components/ChemistryCard';
import { GoalsCard } from '../components/Legacy';
import { CoachPanel } from '../components/CoachPanel';
import { EventsCard } from '../components/EventModal';
import { PressCard } from '../components/PressCard';
import { SlowModelBanner } from '../components/SlowModelBanner';
import { WelcomeCard } from '../components/WelcomeCard';
import { Panel, TeamBadge, cx } from '../components/ui';
import { DraftPanel, FreeAgencyPanel, RecruitingPanel, RetiredPanel } from '../panels/CareerPanels';
import { CoachingPanel } from '../panels/CoachingPanel';
import { GamePanel, PreGamePanel } from '../panels/GamePanel';
import { ScenePanel } from '../panels/ScenePanel';
import { SummerPanel, TrainingPanel } from '../panels/TrainingPanel';
import { TrainingResultCard } from '../panels/TrainingResultCard';
import { userAthlete } from '../../engine/career';
import { WeekDonePanel } from '../panels/WeekDonePanel';

export function HubView() {
  const game = useStore((s) => s.game)!;
  const live = useStore((s) => s.live);
  const post = useStore((s) => s.post);
  const lastTraining = useStore((s) => s.lastTraining);
  const c = game.career;
  const academics = academicStatus(game);

  let main;
  if (live || post) main = <GamePanel />;
  else if (c.phase === 'recruiting') main = <RecruitingPanel />;
  else if (c.phase === 'draft') main = <DraftPanel />;
  else if (c.phase === 'free_agency') main = <FreeAgencyPanel />;
  else if (c.phase === 'retired') main = game.coaching.active ? <CoachingPanel /> : <RetiredPanel />;
  else if (c.step === 'training') main = c.phase === 'offseason' ? <SummerPanel /> : <TrainingPanel />;
  else if (c.step === 'scene') main = <ScenePanel />;
  else if (c.step === 'game') main = <PreGamePanel />;
  else main = <WeekDonePanel />;

  const steps = ['training', 'scene', 'game', 'done'] as const;
  const showSteps = ['regular', 'playoffs'].includes(c.phase) && !live && !post;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        {academics.applies && (!academics.eligible || academics.warning) && ['regular', 'playoffs', 'offseason', 'preseason'].includes(c.phase) && (
          <div role="alert" className={cx('rounded-lg border px-4 py-2.5 text-sm', academics.eligible ? 'border-gold/40 bg-gold/10 text-gold' : 'border-loss/50 bg-loss/10 text-loss')}>
            {academics.eligible ? `Grades warning: your GPA is ${academics.gpa.toFixed(2)}. Below ${MIN_GPA.toFixed(1)} you cannot play. Studying raises it; every week without school work lets it slip.` : `You are academically ineligible. Your GPA is ${academics.gpa.toFixed(2)} and you need ${MIN_GPA.toFixed(1)}. You will sit out until it recovers. Choose "Hit the Books" in training.`}
          </div>
        )}
        <SlowModelBanner />
        {!live && !post && <WelcomeCard />}
        <PressCard />
        {!live && <EventsCard />}
        {showSteps && (
          <ol data-tour="steps" className="flex gap-2 text-[11px] font-semibold uppercase tracking-widest">
            {steps.map((s, i) => {
              const idx = steps.indexOf(c.step);
              return (
                <li key={s} className={cx('flex-1 rounded-md border px-2 py-1.5 text-center', i < idx ? 'border-win/30 text-win' : i === idx ? 'border-hoop-500 bg-hoop-500/10 text-hoop-400' : 'border-court-700 text-ink-500')}>
                  {i + 1}. {s === 'done' ? 'wrap-up' : s}
                </li>
              );
            })}
          </ol>
        )}
        {lastTraining && c.step === 'scene' && !live && !post && c.phase !== 'recruiting' && <TrainingResultCard result={lastTraining} ratings={userAthlete(game).ratings} />}
        {main}
      </div>
      {/* the standings, headlines and goals are for between games: during one, a phone shows only the game */}
      <div className={cx('min-w-0', (live || post) && 'hidden lg:block')}>
        <Sidebar />
      </div>
    </div>
  );
}

function Sidebar() {
  const game = useStore((s) => s.game)!;
  const next = nextOpponent(game);
  const rows = standingsRows(game);
  const news = [...game.news].reverse().slice(0, 8);
  const issue = game.paper[game.paper.length - 1];
  const setTab = useStore((s) => s.setTab);
  return (
    <aside className="space-y-4">
      {next && (
        <Panel title={game.career.phase === 'playoffs' ? 'Playoff game' : 'Next game'}>
          <div className="flex items-center gap-3">
            <TeamBadge team={next.opp} size={44} />
            <div>
              <div className="text-xs text-ink-400">{next.home ? 'vs' : '@'}</div>
              <div className="font-display text-lg font-semibold">
                {next.opp.name} {next.opp.mascot}
              </div>
              <div className="font-mono text-xs text-ink-400">
                {game.league.standings[next.opp.id]?.w ?? 0}-{game.league.standings[next.opp.id]?.l ?? 0}
              </div>
            </div>
          </div>
        </Panel>
      )}
      <div data-tour="goals">
        <GoalsCard />
      </div>
      <CoachPanel />
      <ChemistryCard />
      <Panel title={game.league.name}>
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r) => (
              <tr key={r.team.id} className={cx('border-b border-court-800', r.team.id === game.career.teamId && 'text-hoop-400', r.rank === game.league.playoffTeams && 'border-b-court-500')}>
                <td className="w-5 py-1 font-mono text-ink-500">{r.rank}</td>
                <td className="py-1">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: r.team.colors[0] }} />
                  {r.team.name}
                </td>
                <td className="text-right font-mono">
                  {r.w}-{r.l}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {issue && (
        <Panel title="The paper">
          <button onClick={() => setTab('paper')} className="w-full text-left">
            <div className="font-serif text-base leading-snug font-bold text-ink-100">{issue.headline}</div>
            <div className="mt-1 text-xs text-ink-400">{issue.deck}</div>
            <div className="mt-2 text-xs font-semibold text-hoop-400">Read the whole edition →</div>
          </button>
        </Panel>
      )}
      <Panel title="Headlines">
        {news.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {news.map((n, i) => (
              <li key={i} className="border-l-2 border-court-600 pl-2 text-ink-300">
                <span className="mr-1 font-mono text-[10px] text-ink-500">S{n.season}W{n.week}</span>
                {n.text}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </aside>
  );
}
