import { draftStock, projectedPick, userAthlete } from '../../engine/career';
import { fmt1, seasonAverages } from '../../engine/stats';
import { useStore } from '../../state/store';
import { moveStatus } from '../../engine/moves';
import { Button, Panel, Stat } from '../components/ui';

export function WeekDonePanel() {
  const game = useStore((s) => s.game)!;
  const advance = useStore((s) => s.advance);
  const busy = useStore((s) => s.busy);
  const setFlag = useStore((s) => s.setFlag);
  const setTab = useStore((s) => s.setTab);
  const move = moveStatus(game);
  const c = game.career;
  const a = userAthlete(game);
  const avg = seasonAverages(game.gameLog, c.season);
  const st = game.league.standings[c.teamId];
  const flags = game.story.flags;

  const label =
    c.phase === 'offseason'
      ? c.level === 'hs' && c.year === 4
        ? 'Graduate & start recruiting →'
        : c.level === 'college' && (c.year === 4 || flags.declared_for_draft)
          ? 'Head to the draft →'
          : flags.retiring
            ? 'Retire →'
            : 'Start next season →'
      : c.phase === 'preseason'
        ? 'Start the season →'
        : 'Next week →';

  return (
    <Panel title={c.phase === 'offseason' ? 'Offseason' : c.phase === 'preseason' ? 'Preseason' : `Week ${c.week} wrap-up`}>
      {(c.phase === 'regular' || c.phase === 'playoffs' || c.phase === 'offseason') && avg.gp > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-4 sm:grid-cols-6">
          <Stat label="Record" value={`${st?.w ?? 0}-${st?.l ?? 0}`} />
          <Stat label="PPG" value={fmt1(avg.ppg)} />
          <Stat label="RPG" value={fmt1(avg.rpg)} />
          <Stat label="APG" value={fmt1(avg.apg)} />
          <Stat label="MPG" value={fmt1(avg.mpg)} />
          <Stat label="GP" value={avg.gp} />
        </div>
      )}

      {c.phase === 'offseason' && c.level === 'college' && c.year < 4 && (
        <div className="mb-4 rounded-lg border border-court-600 p-4">
          <div className="font-semibold">Declare for the draft?</div>
          <p className="mt-1 text-sm text-ink-400">
            {projectedPick(game)} (stock {draftStock(game).toFixed(1)}). Leaving early means more years as a pro, but going too early can mean going undrafted.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-hoop-500" checked={flags.declared_for_draft === true} onChange={(e) => setFlag('declared_for_draft', e.target.checked)} />
            Declare for the draft this year
          </label>
        </div>
      )}

      {c.phase === 'offseason' && c.level === 'pro' && a.age >= 30 && (
        <div className="mb-4 rounded-lg border border-court-600 p-4">
          <div className="font-semibold">Hang it up?</div>
          <p className="mt-1 text-sm text-ink-400">You are {a.age}. Your body is telling you things. You can retire now and see your legacy.</p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-hoop-500" checked={flags.retiring === true} onChange={(e) => setFlag('retiring', e.target.checked)} />
            Retire after this offseason
          </label>
        </div>
      )}

      {move?.can && (c.phase === 'offseason' || c.level === 'pro') && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-court-600 p-4">
          <div>
            <div className="font-semibold">{move.kind === 'trade' ? 'Want out?' : 'Thinking about a fresh start?'}</div>
            <p className="mt-1 text-sm text-ink-400">{move.kind === 'trade' ? 'You can ask the front office for a trade.' : c.level === 'hs' ? 'You can look at transferring schools.' : 'The transfer portal is open.'}</p>
          </div>
          <Button variant="outline" onClick={() => setTab('money')}>
            {move.title}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-400">
          {c.phase === 'offseason' ? 'Your summer is done. Ready for what is next?' : 'Rest, recover, and get ready for what comes next.'}
        </p>
        <Button onClick={advance} disabled={busy}>
          {busy ? 'Simulating…' : label}
        </Button>
      </div>
    </Panel>
  );
}
