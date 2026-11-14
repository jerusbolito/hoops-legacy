export type ProviderKind = 'anthropic' | 'openai-compatible' | 'gemini' | 'mock';

export interface ProviderPreset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  defaultModel: string;
  needsKey: boolean;
  /** Whether the endpoint accepts response_format: {type: 'json_object'} */
  jsonMode?: boolean;
  note?: string;
  keyHint?: string;
}

export interface LLMConfig {
  presetId: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * Local engine only (Ollama). Many local models "think" for thousands of tokens before they answer, which makes
   * every scene several times slower. On by default; turn off to let the model reason in full.
   */
  fastReplies?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  /** Ask the provider for a JSON object if it supports a JSON mode. */
  json?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMClient {
  config: LLMConfig;
  chat(req: ChatRequest): Promise<string>;
  listModels(): Promise<string[]>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly kind: 'auth' | 'rate_limit' | 'network' | 'refusal' | 'bad_request' | 'server' | 'unknown',
    public readonly status?: number,
  ) {
    super(message);
  }

  get retryable() {
    return this.kind === 'rate_limit' || this.kind === 'server' || this.kind === 'network';
  }
}

export function errorFromStatus(status: number, body: string): LLMError {
  const snippet = body.slice(0, 300);
  if (status === 401 || status === 403) return new LLMError(`Authentication failed (${status}). Check your API key. ${snippet}`, 'auth', status);
  if (status === 429) return new LLMError(`Rate limited (429). ${snippet}`, 'rate_limit', status);
  if (status >= 500) return new LLMError(`Provider error (${status}). ${snippet}`, 'server', status);
  return new LLMError(`Request failed (${status}). ${snippet}`, 'bad_request', status);
}
