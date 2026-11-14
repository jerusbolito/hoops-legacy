import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { sfx } from '../sfx';
import { Typewriter } from '../components/Typewriter';
import { npcLook } from '../components/looks';
import { reactionsFrom } from '../components/reactions';
import { SceneBanner } from '../components/SceneBanner';
import { Avatar, Button, EffectChips, Panel, Pill, Spinner, cx } from '../components/ui';

const TONE_ICON: Record<string, string> = {
  bold: '🔥',
  kind: '💛',
  calm: '🧊',
  funny: '😂',
  aggressive: '😤',
  sly: '🦊',
  honest: '🗣️',
  neutral: '•',
};

export function ScenePanel() {
  const scene = useStore((s) => s.scene);
  const game = useStore((s) => s.game)!;
  const startScene = useStore((s) => s.startScene);
  const choose = useStore((s) => s.choose);
  const finish = useStore((s) => s.finishScene);
  const phaseNarration = useStore((s) => s.phaseNarration);
  const [typed, setTyped] = useState(false);

  useEffect(() => {
    if (!scene) void startScene();
  }, [scene, startScene]);

  useEffect(() => setTyped(false), [scene?.setup?.narration]);

  // a soft cue when the outcome lands: warm if people came away liking you more, low if not
  const resolved = scene?.resolution;
  useEffect(() => {
    if (!resolved) return;
    const moods = Object.values(reactionsFrom(resolved.applied, scene ? scene.plan.castIds.map((id) => game.npcs[id]).filter(Boolean) : []));
    const good = moods.flatMap((m) => m.chips).filter((c) => c.good).length;
    const bad = moods.flatMap((m) => m.chips).filter((c) => !c.good).length;
    if (good > bad) sfx.chime();
    else if (bad > good) sfx.thud();
  }, [resolved]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!scene || !scene.setup) {
    return (
      <Panel>
        <Spinner label="Writing the next scene…" />
      </Panel>
    );
  }

  const cast = scene.plan.castIds.map((id) => game.npcs[id]).filter(Boolean);
  const { setup, resolution } = scene;
  const reactions = resolution ? reactionsFrom(resolution.applied, cast) : {};

  return (
    <div className="space-y-4">
      {phaseNarration && game.career.phase === 'preseason' && (
        <Panel className="border-gold/30">
          <div className="narration text-ink-300 italic">
            {phaseNarration.split('\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Panel>
      )}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span className="text-hoop-400">{setup.title}</span>
            {setup.location && <span className="normal-case tracking-normal text-ink-500">· {setup.location}</span>}
          </span>
        }
        right={scene.error ? <Pill color="#f59e0b">template</Pill> : null}
      >
        <SceneBanner kind={scene.plan.kind} colors={game.teams[game.career.teamId].colors} className="-mx-4 -mt-4 mb-4" />
        {cast.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-3">
            {cast.map((n) => {
              const rx = reactions[n.id];
              const look = npcLook(game, n);
              return (
                <motion.div
                  key={n.id}
                  layout
                  className={cx('flex items-center gap-2 rounded-2xl border bg-court-800/60 py-1.5 pr-3 pl-1.5 transition-colors', rx?.mood === 'happy' ? 'border-win/50' : rx?.mood === 'angry' || rx?.mood === 'sad' ? 'border-loss/50' : 'border-court-700')}
                >
                  <motion.div key={rx?.mood ?? 'idle'} initial={rx ? { scale: 1.35, rotate: rx.mood === 'angry' ? -8 : 0 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
                    <Avatar name={n.name} size={44} {...look} mood={rx?.mood ?? look.mood} />
                  </motion.div>
                  <div className="text-xs leading-tight">
                    <div className="font-semibold">{n.name}</div>
                    <div className="text-ink-500 capitalize">{n.role.replace('_', ' ')}</div>
                    <AnimatePresence>
                      {rx && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rx.chips.map((c, i) => (
                            <motion.span
                              key={c.label}
                              initial={{ opacity: 0, y: 6, scale: 0.8 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ delay: 0.3 + i * 0.12 }}
                              className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', c.good ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss')}
                            >
                              {c.icon} {c.label}
                            </motion.span>
                          ))}
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
        <Typewriter text={setup.narration} className="text-[15px] leading-relaxed text-ink-100" onDone={() => setTyped(true)} />

        <AnimatePresence>
          {(typed || scene.chosen) && !resolution && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 grid gap-2">
              {setup.choices.map((c, i) => (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  disabled={!!scene.chosen}
                  onClick={() => {
                    sfx.click();
                    choose(c.id);
                  }}
                  className={cx(
                    'flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all',
                    scene.chosen === c.id ? 'border-hoop-500 bg-hoop-500/15' : scene.chosen ? 'border-court-700 opacity-40' : 'border-court-600 bg-court-800/40 hover:translate-x-1 hover:border-hoop-500',
                  )}
                >
                  <span className="text-lg">{TONE_ICON[c.tone.toLowerCase()] ?? TONE_ICON.neutral}</span>
                  <span className="flex-1">{c.text}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">{c.tone}</span>
                </motion.button>
              ))}
              {scene.loading && <Spinner label="The story unfolds…" />}
            </motion.div>
          )}
        </AnimatePresence>

        {resolution && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 border-t border-court-700 pt-5">
            <div className="mb-2 text-xs text-ink-500">You: “{setup.choices.find((c) => c.id === scene.chosen)?.text}”</div>
            <Typewriter text={resolution.narration} className="text-[15px] leading-relaxed text-ink-100" />
            <div className="mt-4">
              <EffectChips items={resolution.applied} />
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={finish}>Continue →</Button>
            </div>
          </motion.div>
        )}
      </Panel>
    </div>
  );
}
