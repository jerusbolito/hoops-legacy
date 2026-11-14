import type { LLMConfig, ProviderPreset } from './types';

export const PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-5-5',
    needsKey: true,
    keyHint: 'sk-ant-…',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: '',
    needsKey: true,
    jsonMode: true,
    keyHint: 'sk-…',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: '',
    needsKey: true,
    keyHint: 'AIza…',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (any model)',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    needsKey: true,
    jsonMode: true,
    keyHint: 'sk-or-…',
  },
  { id: 'groq', label: 'Groq', kind: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: '', needsKey: true, jsonMode: true, keyHint: 'gsk_…' },
  { id: 'deepseek', label: 'DeepSeek', kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', needsKey: true, jsonMode: true },
  { id: 'mistral', label: 'Mistral', kind: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', defaultModel: '', needsKey: true, jsonMode: true },
  { id: 'xai', label: 'xAI (Grok)', kind: 'openai-compatible', baseUrl: 'https://api.x.ai/v1', defaultModel: '', needsKey: true, jsonMode: true, keyHint: 'xai-…' },
  { id: 'together', label: 'Together AI', kind: 'openai-compatible', baseUrl: 'https://api.together.xyz/v1', defaultModel: '', needsKey: true, jsonMode: true },
  {
    id: 'bundled',
    label: 'Built-in model (this computer)',
    kind: 'openai-compatible',
    baseUrl: '',
    defaultModel: 'gemma-4-12b',
    needsKey: false,
    jsonMode: true,
    note: 'Desktop app only. The game runs its own model on this computer. Nothing is sent anywhere.',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: '',
    needsKey: false,
    jsonMode: true,
    note: 'Start Ollama with browser access allowed: OLLAMA_ORIGINS="*" ollama serve',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: '',
    needsKey: false,
    note: 'In LM Studio: Developer → Start Server, and enable CORS.',
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    kind: 'openai-compatible',
    baseUrl: '',
    defaultModel: '',
    needsKey: false,
    note: 'Any endpoint that speaks the OpenAI /chat/completions format.',
  },
  {
    id: 'mock',
    label: 'Offline demo (no AI)',
    kind: 'mock',
    baseUrl: '',
    defaultModel: 'mock',
    needsKey: false,
    note: 'Uses built-in template stories. Good for trying the game without a key.',
  },
];

export function presetById(id: string): ProviderPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];
}

/** Best-effort provider detection from the shape of an API key. */
export function detectPreset(key: string): ProviderPreset | null {
  const k = key.trim();
  if (!k) return null;
  if (k.startsWith('sk-ant-')) return presetById('anthropic');
  if (k.startsWith('sk-or-')) return presetById('openrouter');
  if (k.startsWith('AIza')) return presetById('gemini');
  if (k.startsWith('gsk_')) return presetById('groq');
  if (k.startsWith('xai-')) return presetById('xai');
  if (k.startsWith('sk-proj-') || k.startsWith('sk-')) return presetById('openai');
  return null;
}

export function configFromPreset(p: ProviderPreset, apiKey = '', model?: string): LLMConfig {
  return { presetId: p.id, kind: p.kind, baseUrl: p.baseUrl, apiKey, model: model ?? p.defaultModel };
}
