import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { getDesktop } from '../../desktop/bridge';
import { createClient, testConnection } from '../../llm/client';
import { PRESETS, configFromPreset, detectPreset, presetById } from '../../llm/presets';
import type { LLMConfig } from '../../llm/types';
import { loadLLMConfig } from '../../state/persistence';
import { useStore } from '../../state/store';
import { Button, Field, Panel, Spinner, cx, inputCls } from '../components/ui';

export function SetupScreen() {
  const setLLM = useStore((s) => s.setLLM);
  const setScreen = useStore((s) => s.setScreen);
  const hasGame = useStore((s) => !!s.game);
  const existing = useMemo(() => loadLLMConfig(), []);

  const [presetId, setPresetId] = useState(existing?.config.presetId ?? 'anthropic');
  const [apiKey, setApiKey] = useState(existing?.config.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(existing?.config.baseUrl ?? presetById('anthropic').baseUrl);
  const [model, setModel] = useState(existing?.config.model ?? presetById('anthropic').defaultModel);
  const [remember, setRemember] = useState(existing?.remember ?? true);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [manualModel, setManualModel] = useState(false);
  const [userPicked, setUserPicked] = useState(!!existing);
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; msg?: string }>({ state: 'idle' });
  const [autoDetected, setAutoDetected] = useState<string | null>(null);

  const [fastReplies, setFastReplies] = useState(existing?.config.fastReplies !== false);
  const inDesktop = !!getDesktop();

  const preset = presetById(presetId);
  const config: LLMConfig = { presetId, kind: preset.kind, baseUrl, apiKey: apiKey.trim(), model: model.trim(), ...(presetId === 'ollama' ? { fastReplies } : {}) };

  const choosePreset = (id: string) => {
    const p = presetById(id);
    setPresetId(id);
    setBaseUrl(p.baseUrl);
    setModel(p.defaultModel);
    setModels([]);
    setModelsError(null);
    setManualModel(false);
    setTest({ state: 'idle' });
  };

  const onKey = (k: string) => {
    setApiKey(k);
    // Only guess the provider if the player hasn't chosen one: many providers
    // (DeepSeek, Together, Mistral…) use OpenAI-style "sk-" keys.
    if (userPicked) return;
    const d = detectPreset(k);
    if (d && d.id !== presetId) {
      choosePreset(d.id);
      setAutoDetected(d.label);
    }
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const list = await createClient(config).listModels();
      setModels(list);
      setManualModel(false);
      if (list.length && !list.includes(model)) setModel(list[0]);
      if (!list.length) setModelsError('The provider returned no models. Type a model id instead.');
    } catch (e) {
      setModels([]);
      setModelsError(`Could not list models: ${(e as Error).message.slice(0, 160)}`);
    } finally {
      setLoadingModels(false);
    }
  };

  // auto-load models once a key (or a keyless local endpoint) is present
  useEffect(() => {
    if (preset.kind === 'mock') return;
    if ((preset.needsKey && apiKey.trim().length > 15) || (!preset.needsKey && baseUrl)) {
      const t = setTimeout(fetchModels, 500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, apiKey, baseUrl]);

  const runTest = async () => {
    setTest({ state: 'running' });
    try {
      const out = await testConnection(config);
      setTest({ state: 'ok', msg: out });
    } catch (e) {
      setTest({ state: 'fail', msg: (e as Error).message });
    }
  };

  const canSave = preset.kind === 'mock' || (!!config.model && (!preset.needsKey || !!config.apiKey) && !!config.baseUrl);

  const save = () => {
    setLLM(preset.kind === 'mock' ? configFromPreset(preset) : config, remember);
    setScreen(hasGame ? 'game' : 'title');
  };

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <div className="text-5xl">🏀</div>
        <h1 className="mt-2 font-display text-5xl font-bold tracking-tight">
          HOOPS <span className="text-hoop-500">LEGACY</span>
        </h1>
        <p className="mt-2 text-ink-400">An AI-narrated basketball career. Bring your own model.</p>
      </motion.div>

      <Panel title="Story Engine">
        <div className="space-y-5">
          <Field label="API key" hint={autoDetected ? `Detected ${autoDetected} from the key format.` : 'Paste any provider key. Anthropic, OpenAI, Gemini, OpenRouter, Groq and xAI keys are auto-detected.'}>
            <input
              type="password"
              autoComplete="off"
              className={inputCls}
              placeholder={preset.needsKey ? (preset.keyHint ?? 'API key') : 'Not needed for this provider (optional)'}
              value={apiKey}
              onChange={(e) => onKey(e.target.value)}
              disabled={preset.kind === 'mock' || presetId === 'bundled'}
            />
          </Field>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">Provider</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESETS.filter((p) => p.id !== 'bundled' || inDesktop).map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setUserPicked(true);
                    setAutoDetected(null);
                    choosePreset(p.id);
                  }}
                  className={cx(
                    'rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors',
                    p.id === presetId ? 'border-hoop-500 bg-hoop-500/10 text-hoop-400' : 'border-court-600 text-ink-300 hover:border-court-500',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset.note && !(inDesktop && preset.id === 'ollama') && <p className="mt-2 rounded-md bg-court-800 px-3 py-2 font-mono text-xs text-ink-300">{preset.note}</p>}
          </div>

          {presetId === 'bundled' && (
            <div className="space-y-3 rounded-lg border border-court-600 bg-court-800/50 p-4">
              <p className="text-sm text-ink-300">The game manages the built-in model for you: it starts it, keeps it private to this computer, and updates its address each time. Choose which model to use on the startup screen.</p>
              <Button onClick={() => setScreen('desktop')}>Choose the model and start</Button>
            </div>
          )}

          {preset.kind !== 'mock' && presetId !== 'bundled' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Base URL">
                <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" />
              </Field>
              <Field
                label="Model"
                hint={
                  loadingModels ? (
                    'Loading models…'
                  ) : modelsError ? (
                    <span className="text-loss">
                      {modelsError}{' '}
                      <button className="text-hoop-400 hover:underline" onClick={fetchModels}>
                        Retry
                      </button>
                    </span>
                  ) : models.length ? (
                    <span>
                      {models.length} models available ·{' '}
                      <button className="text-hoop-400 hover:underline" onClick={() => setManualModel((m) => !m)}>
                        {manualModel ? 'pick from list' : 'type manually'}
                      </button>
                    </span>
                  ) : (
                    <button className="text-hoop-400 hover:underline" onClick={fetchModels}>
                      Fetch model list
                    </button>
                  )
                }
              >
                {models.length > 0 && !manualModel ? (
                  <select className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>
                    {!models.includes(model) && <option value={model}>{model || 'Choose a model…'}</option>}
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="model id" />
                )}
              </Field>
            </div>
          )}

          {presetId === 'ollama' && (
            <label className="flex items-start gap-2 text-sm text-ink-300">
              <input type="checkbox" checked={fastReplies} onChange={(e) => setFastReplies(e.target.checked)} className="mt-1 accent-hoop-500" />
              <span>
                Faster replies <span className="text-ink-500">(recommended)</span>
                <span className="block text-xs text-ink-500">Skips the model's "thinking" step. Scenes arrive several times sooner. Turn this off to let the model reason in full.</span>
              </span>
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-hoop-500" />
            Remember on this device (stored in this browser only; never included in save files)
          </label>

          <div className="flex flex-wrap items-center gap-3 border-t border-court-700 pt-4">
            {preset.kind !== 'mock' && presetId !== 'bundled' && (
              <Button variant="outline" onClick={runTest} disabled={!canSave || test.state === 'running'}>
                Test connection
              </Button>
            )}
            <Button onClick={save} disabled={!canSave}>
              {hasGame ? 'Save & return' : 'Continue'} →
            </Button>
            {test.state === 'running' && <Spinner label="Calling the model…" />}
            {test.state === 'ok' && <span className="text-sm text-win">✓ Connected: {test.msg}</span>}
          </div>
          {test.state === 'fail' && <p className="rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">{test.msg}</p>}
        </div>
      </Panel>
      <p className="mt-4 text-center text-xs text-ink-500">
        Your key is sent directly from your browser to the provider you choose. Story quality depends on the model; the game rules and stats are always computed locally.
      </p>
    </div>
  );
}
