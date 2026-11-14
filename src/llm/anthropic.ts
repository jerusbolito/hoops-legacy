import Anthropic from '@anthropic-ai/sdk';
import { LLMError, type ChatRequest, type LLMClient, type LLMConfig } from './types';

/** Models that accept server-side refusal fallbacks with `fallbacks: "default"`. */
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1|fable-5-2|mythos-5-1|mythos-5-2)$/;
/** Models that accept output_config.effort. */
const EFFORT_MODELS = /^claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[5678]|sonnet-4-6)/;

function toLLMError(e: unknown): LLMError {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new LLMError(`Authentication failed: ${e.message}`, 'auth', e.status);
  }
  if (e instanceof Anthropic.RateLimitError) return new LLMError(`Rate limited: ${e.message}`, 'rate_limit', 429);
  if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError) {
    return new LLMError(`Request rejected: ${e.message}`, 'bad_request', e.status);
  }
  if (e instanceof Anthropic.APIConnectionError) return new LLMError(`Network error: ${e.message}`, 'network');
  if (e instanceof Anthropic.APIError) return new LLMError(`Anthropic API error ${e.status ?? ''}: ${e.message}`, 'server', e.status);
  return new LLMError(String(e), 'unknown');
}

export function anthropicClient(config: LLMConfig): LLMClient {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined,
    // The player's own key is sent straight from their browser to Anthropic.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });

  return {
    config,
    async chat(req: ChatRequest) {
      const model = config.model;
      const useFallback = FALLBACK_MODELS.test(model);
      try {
        const res = await client.beta.messages.create(
          {
            model,
            max_tokens: req.maxTokens ?? 16000,
            system: req.system,
            messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
            // Narration is chat-like: low effort keeps turns snappy.
            ...(EFFORT_MODELS.test(model) ? { output_config: { effort: 'low' as const } } : {}),
            ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          },
          { signal: req.signal },
        );
        if (res.stop_reason === 'refusal') {
          throw new LLMError('The model declined to write this scene.', 'refusal');
        }
        const text = res.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
        if (!text) throw new LLMError('Empty response from model.', 'unknown');
        return text;
      } catch (e) {
        if (e instanceof LLMError) throw e;
        throw toLLMError(e);
      }
    },
    async listModels() {
      try {
        const ids: string[] = [];
        for await (const m of client.models.list({ limit: 100 })) ids.push(m.id);
        return ids;
      } catch (e) {
        throw toLLMError(e);
      }
    },
  };
}
