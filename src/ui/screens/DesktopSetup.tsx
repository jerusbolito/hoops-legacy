import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_BUNDLED_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_MODEL_GB, MODEL_CATALOG, getDesktop, isValidModelName, modelInfo, recommendModel, type EngineSelection, type EngineStatus, type Provider, type PullProgress } from '../../desktop/bridge';
import { loadLLMConfig } from '../../state/persistence';
import { useStore } from '../../state/store';
import { Button, Field, Panel, Spinner, cx, inputCls } from '../components/ui';

type Phase = 'checking' | 'starting' | 'no-ollama' | 'no-engine' | 'confirm-download' | 'downloading' | 'error';

/** Decimal gigabytes, the same unit model sizes are quoted in. */
const gb = (bytes: number) => (bytes / 1e9).toFixed(1);

/**
 * Desktop only: gets the story model ready every time the game opens. When everything is already set up this is a
 * flash on the way to the title screen. The first time, it walks the player through the one thing they have to do.
 */
export function DesktopSetup() {
  const desk = getDesktop();
  const connect = useStore((s) => s.connectLocalEngine);
  const setScreen = useStore((s) => s.setScreen);

  // keep whatever the player chose last time; a brand-new player gets the built-in model
  const saved = loadLLMConfig();
  const firstRun = !saved;
  const [sel, setSel] = useState<EngineSelection>(() => {
    const c = saved?.config;
    if (c?.presetId === 'ollama') return { provider: 'ollama', model: c.model || DEFAULT_OLLAMA_MODEL };
    if (c?.presetId === 'bundled' && modelInfo(c.model)) return { provider: 'bundled', model: c.model };
    return { provider: 'bundled', model: DEFAULT_BUNDLED_MODEL };
  });
  // on by default; remembered if the player turned it off
  const [fastReplies, setFastReplies] = useState(saved?.config.fastReplies !== false);
  const [phase, setPhase] = useState<Phase>('checking');
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const running = useRef(false);
  const autoPicked = useRef(false);

  const finish = useCallback(
    (s: EngineStatus, chosen: EngineSelection) => {
      // load the model into memory in the background so the first scene is not slow
      void desk?.warmUp(chosen);
      connect(s, fastReplies);
    },
    [desk, connect, fastReplies],
  );

  const run = useCallback(
    async (target: EngineSelection) => {
      if (!desk || running.current) return;
      if (target.provider === 'ollama' && !isValidModelName(target.model)) {
        setError(`"${target.model}" does not look like a model name. Names look like gemma4:12b.`);
        return setPhase('error');
      }
      running.current = true;
      setError(null);
      try {
        setPhase('checking');
        let chosen = target;
        let s = await desk.status(chosen);

        // a first launch on a smaller computer gets a model that will run well on it, instead of one that will crawl
        if (firstRun && chosen.provider === 'bundled' && !autoPicked.current && !s.hasModel) {
          autoPicked.current = true;
          const rec = recommendModel(s.ramGB);
          if (rec !== chosen.model) {
            chosen = { provider: 'bundled', model: rec };
            s = await desk.status(chosen);
          }
        }
        setSel(chosen);
        setStatus(s);

        if (s.state === 'no-engine') return setPhase('no-engine');
        if (s.state === 'no-ollama') return setPhase('no-ollama');
        if (s.state === 'not-running' && s.hasModel !== false) {
          setPhase('starting');
          s = await desk.startEngine(chosen);
          setStatus(s);
          if (!s.running) {
            setError(s.error ?? (chosen.provider === 'ollama' ? 'Ollama is installed but did not start. Open the Ollama app once, then try again.' : 'The story model could not start.'));
            return setPhase('error');
          }
        }
        if (s.state === 'missing-model' || !s.hasModel) return setPhase('confirm-download');
        finish(s, chosen);
      } catch (e) {
        setError((e as Error).message);
        setPhase('error');
      } finally {
        running.current = false;
      }
    },
    [desk, finish, firstRun],
  );

  const download = async () => {
    if (!desk) return;
    setPhase('downloading');
    setProgress(null);
    setError(null);
    try {
      await desk.pullModel(sel, setProgress);
    } catch (e) {
      const msg = (e as Error).message;
      if (/abort/i.test(msg)) return setPhase('confirm-download');
      setError(msg);
      return setPhase('error');
    }
    // downloaded: now start it (the built-in engine still needs starting) and carry on
    void run(sel);
  };

  useEffect(() => {
    void run(sel);
    // run once when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Continue with the built-in template stories, no AI. An AI can be set up later from settings. */
  const connectOffline = () => setScreen('title');
  const chooseProvider = (provider: Provider) => setSel(provider === 'bundled' ? { provider, model: DEFAULT_BUNDLED_MODEL } : { provider, model: DEFAULT_OLLAMA_MODEL });

  if (!desk) return null;
  const info = sel.provider === 'bundled' ? modelInfo(sel.model) : undefined;
  const sizeText = sel.provider === 'bundled' ? (info ? `about ${gb(info.bytes)} GB` : 'a large file') : sel.model === DEFAULT_OLLAMA_MODEL ? `about ${DEFAULT_OLLAMA_MODEL_GB} GB` : 'often several GB';
  const modelName = info?.label ?? sel.model;
  const lowMemory = !!status && status.ramGB > 0 && ((info && status.ramGB < info.minRamGB) || (sel.provider === 'ollama' && status.ramGB < 16 && /1[0-9]b|[2-9][0-9]b/i.test(sel.model)));
  const recommended = status ? recommendModel(status.ramGB) : null;

  return (
    <div className="hardwood flex min-h-full items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="mb-5 text-center">
          <div className="text-5xl">🏀</div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-wide">HOOPS LEGACY</h1>
          <p className="mt-1 text-sm text-ink-400">Getting your local storyteller ready</p>
        </div>

        <Panel>
          {phase === 'checking' && <Spinner label="Checking the story model…" />}
          {phase === 'starting' && (
            <div className="space-y-1">
              <Spinner label={sel.provider === 'bundled' ? 'Loading the story model…' : 'Starting the local AI…'} />
              {sel.provider === 'bundled' && <p className="text-xs text-ink-500">The first load takes a little while, because the model is several gigabytes. It stays on this computer.</p>}
            </div>
          )}

          {phase === 'no-engine' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold">The built-in engine is missing</h2>
                <p className="mt-1 text-sm text-ink-300">This copy of the game is missing the program that runs the story model. Reinstalling the game fixes it. In the meantime you can use Ollama, or play with the built-in template stories.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    const next: EngineSelection = { provider: 'ollama', model: DEFAULT_OLLAMA_MODEL };
                    setSel(next);
                    void run(next);
                  }}
                >
                  Use Ollama instead
                </Button>
                <Button variant="ghost" onClick={connectOffline}>
                  Play without AI for now
                </Button>
              </div>
            </div>
          )}

          {phase === 'no-ollama' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold">Ollama is not installed</h2>
                <p className="mt-1 text-sm text-ink-300">You chose to use Ollama, which is a free program that runs AI models on your computer. Install it, then come back. Or switch to the built-in model, which needs nothing else.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void desk.openOllamaDownload()}>Get Ollama</Button>
                <Button variant="outline" onClick={() => void run(sel)}>
                  I installed it. Check again
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const next: EngineSelection = { provider: 'bundled', model: DEFAULT_BUNDLED_MODEL };
                    setSel(next);
                    void run(next);
                  }}
                >
                  Use the built-in model
                </Button>
              </div>
            </div>
          )}

          {phase === 'confirm-download' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold">Download the story model</h2>
                <p className="mt-1 text-sm text-ink-300">
                  The game writes its stories with <b>{modelName}</b>, a model that runs on your own computer, so nothing you play is sent anywhere. It is a one-time download of {sizeText}, and you will not need to do it again. Keep the app open while it downloads.
                </p>
                {lowMemory && (
                  <p className="mt-2 rounded-md border border-gold/40 bg-gold/10 p-2 text-xs text-gold">
                    This computer has {status!.ramGB} GB of memory{info ? `, and ${info.label} works best with ${info.minRamGB} GB or more` : ''}. It may run slowly.
                    {recommended && recommended !== sel.model && sel.provider === 'bundled' ? ` ${modelInfo(recommended)?.label} would suit it better. You can pick it under Advanced.` : ' If it is slow, pick a smaller model under Advanced.'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void download()}>Download {modelName}</Button>
                <Button variant="ghost" onClick={connectOffline}>
                  Play without AI for now
                </Button>
              </div>
            </div>
          )}

          {phase === 'downloading' && (
            <div className="space-y-3" aria-live="polite">
              <h2 className="font-display text-lg font-semibold">{progress?.status === 'Checking the download' ? 'Checking the download' : `Downloading ${modelName}`}</h2>
              <div className="h-3 overflow-hidden rounded-full bg-court-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress?.percent ?? undefined}>
                {/* a plain CSS transition: it does not depend on the animation library running */}
                <div className="h-full rounded-full bg-gradient-to-r from-hoop-600 to-hoop-400 transition-[width] duration-500 ease-out" style={{ width: `${progress?.percent ?? 2}%` }} />
              </div>
              <div className="flex justify-between font-mono text-xs text-ink-400">
                <span>{progress?.percent != null ? `${progress.percent}%` : (progress?.status ?? 'Starting…')}</span>
                <span>{progress?.total ? `${gb(progress.completed ?? 0)} / ${gb(progress.total)} GB` : ''}</span>
              </div>
              <p className="text-xs text-ink-500">If you stop or close the app, it picks up where it left off next time.</p>
              <Button variant="ghost" onClick={() => void desk.cancelPull()}>
                Cancel
              </Button>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-loss">That did not work</h2>
                <p className="mt-1 text-sm text-ink-300">{error}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void run(sel)}>Try again</Button>
                <Button variant="ghost" onClick={connectOffline}>
                  Play without AI for now
                </Button>
              </div>
            </div>
          )}
        </Panel>

        <div className="mt-4 space-y-3 text-center text-xs text-ink-500">
          <button className="underline decoration-dotted underline-offset-4 hover:text-ink-300" onClick={() => setAdvanced(!advanced)}>
            {advanced ? 'Hide advanced' : 'Advanced'}
          </button>
          {advanced && (
            <Panel className="text-left">
              <div className="space-y-4">
                <div role="radiogroup" aria-label="Where the stories come from" className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['bundled', 'Built-in model', 'The game runs its own model. Nothing else to install.'],
                      ['ollama', 'Ollama', 'Use the Ollama you already have.'],
                    ] as const
                  ).map(([id, label, blurb]) => (
                    <button key={id} role="radio" aria-checked={sel.provider === id} onClick={() => chooseProvider(id)} className={cx('rounded-lg border p-3 text-left', sel.provider === id ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 hover:border-court-500')}>
                      <div className="text-sm font-semibold text-ink-100">{label}</div>
                      <div className="mt-0.5 text-xs text-ink-400">{blurb}</div>
                    </button>
                  ))}
                </div>

                {sel.provider === 'bundled' ? (
                  <div role="radiogroup" aria-label="Model" className="space-y-2">
                    {MODEL_CATALOG.map((m) => (
                      <button key={m.id} role="radio" aria-checked={sel.model === m.id} onClick={() => setSel({ provider: 'bundled', model: m.id })} className={cx('flex w-full items-start gap-3 rounded-lg border p-3 text-left', sel.model === m.id ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 hover:border-court-500')}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-100">
                            {m.label}
                            {recommended === m.id && <span className="rounded-full bg-win/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-win uppercase">Best for this computer</span>}
                          </div>
                          <div className="mt-0.5 text-xs text-ink-400">{m.blurb}</div>
                        </div>
                        <div className="shrink-0 font-mono text-xs text-ink-400">{gb(m.bytes)} GB</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <Field label="Model" hint="Any model name from ollama.com/library, for example a smaller one if your computer is slow.">
                      <input className={inputCls} value={sel.model} onChange={(e) => setSel({ provider: 'ollama', model: e.target.value })} spellCheck={false} />
                    </Field>
                    {status && status.provider === 'ollama' && status.models.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">Already on this computer</div>
                        <div className="flex flex-wrap gap-1.5">
                          {status.models.map((m) => (
                            <button key={m} onClick={() => setSel({ provider: 'ollama', model: m })} className={`rounded-md border px-2 py-1 font-mono text-[11px] ${m === sel.model ? 'border-hoop-500 text-hoop-400' : 'border-court-600 text-ink-300 hover:border-court-500'}`}>
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <label className="flex items-start gap-2 text-sm text-ink-300">
                  <input type="checkbox" checked={fastReplies} onChange={(e) => setFastReplies(e.target.checked)} className="mt-1 accent-hoop-500" />
                  <span>
                    Faster replies <span className="text-ink-500">(recommended)</span>
                    <span className="block text-xs text-ink-500">Skips the model's "thinking" step, so scenes arrive several times sooner. Turn off to let it reason in full.</span>
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void run({ ...sel, model: sel.model.trim() || (sel.provider === 'bundled' ? DEFAULT_BUNDLED_MODEL : DEFAULT_OLLAMA_MODEL) })}>
                    Use this setup
                  </Button>
                  <Button variant="ghost" onClick={() => setScreen('setup')}>
                    Use a cloud AI provider instead
                  </Button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </motion.div>
    </div>
  );
}
