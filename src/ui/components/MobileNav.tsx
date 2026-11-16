import { useEffect, useState } from 'react';
import { getDesktop } from '../../desktop/bridge';
import { usePrefs } from '../../state/prefs';
import { useStore, type Tab } from '../../state/store';
import { GROUPS, PRIMARY_TABS, TABS } from '../screens/tabs';
import { cx } from './ui';

const SHORT: Partial<Record<Tab, string>> = { hub: 'Week', paper: 'Paper' };

/**
 * The phone's navigation: four tabs and "More" along the bottom, where a thumb can reach them. Hidden on wide screens
 * (which keep the tab strip along the top) and during a live game, where a stray tap should not walk you out of it.
 */
export function MobileNav() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const live = useStore((s) => !!s.live);
  const game = useStore((s) => s.game);
  const paperSeen = useStore((s) => s.paperSeen);
  const [more, setMore] = useState(false);

  // leaving a screen or starting a game closes the sheet
  useEffect(() => {
    if (live) setMore(false);
  }, [live]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [more]);

  if (live) return null;
  const newIssue = !!game && tab !== 'paper' && (game.paper[game.paper.length - 1]?.id ?? 0) > paperSeen;
  const inMore = !PRIMARY_TABS.includes(tab);
  const go = (t: Tab) => {
    setTab(t);
    setMore(false);
    window.scrollTo?.({ top: 0 });
  };

  return (
    <>
      <nav aria-label="Main" data-tour="menu" className="fixed inset-x-0 bottom-0 z-30 border-t border-court-700 bg-court-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {PRIMARY_TABS.map((id) => {
            const t = TABS.find((x) => x.id === id)!;
            const on = tab === id;
            return (
              <li key={id}>
                <button onClick={() => go(id)} aria-current={on ? 'page' : undefined} className={cx('relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', on ? 'text-hoop-400' : 'text-ink-400')}>
                  <span className="text-xl leading-none" aria-hidden>
                    {t.icon}
                  </span>
                  {SHORT[id] ?? t.label}
                  {id === 'paper' && newIssue && <span className="absolute top-2 right-[28%] h-2 w-2 rounded-full bg-hoop-500" aria-label="new edition" />}
                  {on && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-hoop-500" />}
                </button>
              </li>
            );
          })}
          <li>
            <button onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} className={cx('relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', inMore ? 'text-hoop-400' : 'text-ink-400')}>
              <span className="text-xl leading-none" aria-hidden>
                ⋯
              </span>
              More
              {inMore && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-hoop-500" />}
            </button>
          </li>
        </ul>
      </nav>
      {more && <MoreSheet tab={tab} go={go} close={() => setMore(false)} />}
    </>
  );
}

function MoreSheet({ tab, go, close }: { tab: Tab; go: (t: Tab) => void; close: () => void }) {
  const prefs = usePrefs();
  const setScreen = useStore((s) => s.setScreen);
  const openManager = useStore((s) => s.openModelManager);
  const closeCareer = useStore((s) => s.closeCareer);
  const rest = TABS.filter((t) => !PRIMARY_TABS.includes(t.id));
  const row = 'flex min-h-12 w-full items-center gap-3 rounded-lg border border-court-700 bg-court-800/50 px-3 text-left text-sm font-semibold text-ink-100 active:bg-court-700';
  return (
    <div className="fixed inset-0 z-[45] flex items-end bg-black/60 backdrop-blur-sm lg:hidden" onClick={close} role="dialog" aria-modal="true" aria-label="More">
      <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border-t border-court-600 bg-court-850 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-court-600" aria-hidden />
        <div className="space-y-3">
          {GROUPS.map((g) => {
            const items = rest.filter((t) => g.tabs.includes(t.id));
            if (!items.length) return null;
            return (
              <section key={g.id} aria-label={g.label}>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-500">{g.label}</div>
                <div className="grid grid-cols-3 gap-2">
                  {items.map((t) => (
                    <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined} className={cx('flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold', tab === t.id ? 'border-hoop-500 bg-hoop-500/10 text-hoop-400' : 'border-court-700 bg-court-800/50 text-ink-300 active:bg-court-700')}>
                      <span className="text-2xl leading-none" aria-hidden>
                        {t.icon}
                      </span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className="mt-4 grid gap-2">
          <button className={row} aria-pressed={prefs.sound} onClick={() => prefs.set({ sound: !prefs.sound })}>
            <span aria-hidden>{prefs.sound ? '🔊' : '🔇'}</span>
            Sound {prefs.sound ? 'on' : 'off'}
          </button>
          <button className={row} aria-pressed={prefs.flashy} onClick={() => prefs.set({ flashy: !prefs.flashy })}>
            <span aria-hidden>{prefs.flashy ? '✨' : '◻️'}</span>
            {prefs.flashy ? 'Big effects on' : 'Calm mode'}
          </button>
          <button
            className={row}
            onClick={() => {
              close();
              if (getDesktop()) openManager();
              else setScreen('setup');
            }}
          >
            <span aria-hidden>⚙</span>
            {getDesktop() ? 'Story model' : 'AI settings'}
          </button>
          <button
            className={row}
            onClick={() => {
              close();
              closeCareer();
            }}
          >
            <span aria-hidden>⏏</span>
            Save and quit to title
          </button>
        </div>
      </div>
    </div>
  );
}
