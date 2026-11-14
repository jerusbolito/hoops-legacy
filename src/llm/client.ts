import { anthropicClient } from './anthropic';
import { geminiClient } from './gemini';
import { openAICompatibleClient } from './openaiCompatible';
import { LLMError, type ChatRequest, type LLMClient, type LLMConfig } from './types';

/** Mock client: returns an empty string so the narrative layer uses its templates. */
function mockClient(config: LLMConfig): LLMClient {
  return {
    config,
    async chat() {
      throw new LLMError('Offline demo mode', 'unknown');
    },
    async listModels() {
      return ['mock'];
    },
  };
}

export function createClient(config: LLMConfig): LLMClient {
  switch (config.kind) {
    case 'anthropic':
      return anthropicClient(config);
    case 'gemini':
      return geminiClient(config);
    case 'openai-compatible':
      return openAICompatibleClient(config);
    case 'mock':
      return mockClient(config);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** chat() with backoff for transient failures (Anthropic SDK also retries internally). */
export async function chatWithRetry(client: LLMClient, req: ChatRequest, attempts = 3): Promise<string> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await client.chat(req);
    } catch (e) {
      last = e;
      if (!(e instanceof LLMError) || !e.retryable || req.signal?.aborted) throw e;
      await sleep(800 * 2 ** i + Math.random() * 300);
    }
  }
  throw last;
}

/** Quick round-trip used by the setup screen's "Test connection" button. */
export async function testConnection(config: LLMConfig): Promise<string> {
  if (config.kind === 'mock') return 'Offline demo mode ready.';
  if (!config.model) throw new LLMError('Pick a model first.', 'bad_request');
  const client = createClient(config);
  const text = await client.chat({
    system: 'You are a connection test. Reply with a JSON object only.',
    messages: [{ role: 'user', content: 'Reply with {"ok": true, "line": "<a 6-word hype line about basketball>"}' }],
    json: true,
    maxTokens: 2000,
  });
  return text.slice(0, 200);
}
