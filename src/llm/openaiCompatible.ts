import { presetById } from './presets';
import { LLMError, errorFromStatus, type ChatRequest, type LLMClient, type LLMConfig } from './types';

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new LLMError(
      `Could not reach ${new URL(url).host}. If this is a local server, make sure it is running and allows browser (CORS) requests.`,
      'network',
    );
  }
}

/** OpenAI, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Ollama, LM Studio, and any /chat/completions endpoint. */
export function openAICompatibleClient(config: LLMConfig): LLMClient {
  const preset = presetById(config.presetId);
  let jsonMode = preset.jsonMode ?? false;
  // Local engines (Ollama, and the built-in llama.cpp one) accept this for thinking models and skip the reasoning.
  // If some server rejects it we stop sending it.
  let skipThinking = (config.presetId === 'ollama' || config.presetId === 'bundled') && config.fastReplies !== false;

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) h.Authorization = `Bearer ${config.apiKey}`;
    if (config.presetId === 'openrouter') {
      h['HTTP-Referer'] = location.origin;
      h['X-Title'] = 'Come Up';
    }
    return h;
  };

  return {
    config,
    async chat(req: ChatRequest) {
      if (!config.baseUrl) throw new LLMError('No base URL configured.', 'bad_request');
      const body: Record<string, unknown> = {
        model: config.model,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        max_tokens: req.maxTokens ?? 4000,
      };
      if (req.json && jsonMode) body.response_format = { type: 'json_object' };
      if (skipThinking) body.reasoning_effort = 'none';

      let res = await doFetch(joinUrl(config.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal: req.signal,
      });
      // Some models reject response_format, max_tokens or reasoning_effort; retry once without them.
      if (res.status === 400 && (body.response_format || body.max_tokens || body.reasoning_effort)) {
        const text = await res.text();
        if (/reasoning|think/i.test(text)) {
          skipThinking = false;
          delete body.reasoning_effort;
        }
        if (/response_format|json/i.test(text)) jsonMode = false;
        delete body.response_format;
        if (/max_tokens/i.test(text)) {
          delete body.max_tokens;
          body.max_completion_tokens = req.maxTokens ?? 4000;
        }
        res = await doFetch(joinUrl(config.baseUrl, 'chat/completions'), {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(body),
          signal: req.signal,
        });
      }
      if (!res.ok) throw errorFromStatus(res.status, await res.text());
      const data = await res.json();
      const choice = data?.choices?.[0];
      const content: string | undefined = choice?.message?.content;
      if (choice?.finish_reason === 'content_filter') throw new LLMError('The model declined to write this scene.', 'refusal');
      if (!content) throw new LLMError('Empty response from model.', 'unknown');
      return content;
    },
    async listModels() {
      const res = await doFetch(joinUrl(config.baseUrl, 'models'), { headers: headers() });
      if (!res.ok) throw errorFromStatus(res.status, await res.text());
      const data = await res.json();
      const list: { id: string }[] = data?.data ?? data?.models ?? [];
      return list.map((m) => m.id).filter(Boolean).sort();
    },
  };
}
