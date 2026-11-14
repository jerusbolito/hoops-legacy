import { LLMError, errorFromStatus, type ChatRequest, type LLMClient, type LLMConfig } from './types';

export function geminiClient(config: LLMConfig): LLMClient {
  const base = config.baseUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey };

  return {
    config,
    async chat(req: ChatRequest) {
      const model = config.model.replace(/^models\//, '');
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 8000,
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
        },
      };
      let res: Response;
      try {
        res = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: req.signal,
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        throw new LLMError('Could not reach Google Gemini.', 'network');
      }
      if (!res.ok) throw errorFromStatus(res.status, await res.text());
      const data = await res.json();
      const cand = data?.candidates?.[0];
      if (!cand && data?.promptFeedback?.blockReason) throw new LLMError('The model declined to write this scene.', 'refusal');
      if (cand?.finishReason === 'SAFETY') throw new LLMError('The model declined to write this scene.', 'refusal');
      const text: string = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
      if (!text) throw new LLMError('Empty response from Gemini.', 'unknown');
      return text;
    },
    async listModels() {
      const res = await fetch(`${base}/models?pageSize=200`, { headers });
      if (!res.ok) throw errorFromStatus(res.status, await res.text());
      const data = await res.json();
      return (data?.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: { name: string }) => m.name.replace(/^models\//, ''))
        .sort();
    },
  };
}
