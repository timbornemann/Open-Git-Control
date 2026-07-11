import type { AppSettings } from '../../settings';
import type { AiConnectionResult, AiConnectionTestRequest, AiModelListRequest, AiProvider, AiTextRequest } from './AiProvider';
import { AI_DISCOVERY_TIMEOUT_MS, fetchWithTimeout, safeString, uniqueSorted } from './providerUtils';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

const getOpenAiBaseUrl = (settings: AppSettings): string => {
  const configured = settings.openAiBaseUrl?.trim().replace(/\/+$/, '');
  const baseUrl = configured || DEFAULT_OPENAI_BASE_URL;

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol.toLowerCase() !== 'https:' || parsed.username || parsed.password) {
      throw new Error('OpenAI Base URL muss HTTPS verwenden.');
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch (error) {
    if (error instanceof Error && error.message === 'OpenAI Base URL muss HTTPS verwenden.') {
      throw error;
    }
    throw new Error('OpenAI Base URL ist ungueltig.');
  }
};

const getOpenAiModel = (settings: AppSettings): string => {
  return settings.openAiModel?.trim() || DEFAULT_OPENAI_MODEL;
};

const NON_TEXT_MODEL_PATTERNS = [
  /(^|[-_.])(embedding|embed)([-_.]|$)/i,
  /(^|[-_.])(whisper|transcri(?:be|ption))([-_.]|$)/i,
  /(^|[-_.])(tts|speech)([-_.]|$)/i,
  /(^|[-_.])(dall-e|image|vision-preview)([-_.]|$)/i,
  /(^|[-_.])(moderation)([-_.]|$)/i,
  /(^|[-_.])(realtime|audio)([-_.]|$)/i,
];

export const isLikelyTextChatModel = (modelId: string): boolean => {
  const normalized = modelId.trim();
  return Boolean(normalized) && !NON_TEXT_MODEL_PATTERNS.some((pattern) => pattern.test(normalized));
};

export class OpenAiProvider implements AiProvider {
  readonly id = 'openai' as const;

  getSelectedModel(settings: AppSettings): string {
    return getOpenAiModel(settings);
  }

  async testConnection({ settings, getOpenAiApiKey }: AiConnectionTestRequest): Promise<AiConnectionResult> {
    const apiKey = getOpenAiApiKey().trim();
    if (!apiKey) {
      throw new Error('OpenAI API key fehlt.');
    }

    const model = this.getSelectedModel(settings);
    if (!isLikelyTextChatModel(model)) {
      throw new Error(`OpenAI Modell "${model}" ist kein unterstuetztes Text-Chat-Modell.`);
    }

    // Use the same endpoint as generation. GET /models only proves that an ID
    // exists; embedding/image/audio models otherwise appeared as healthy even
    // though every real chat request failed.
    const response = await fetchWithTimeout(
      `${getOpenAiBaseUrl(settings)}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
          max_completion_tokens: 1,
        }),
      },
      AI_DISCOVERY_TIMEOUT_MS,
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI nicht erreichbar (${response.status}): ${text || response.statusText}`);
    }

    return { ok: true, provider: this.id, model, detail: 'OpenAI API erreichbar' };
  }

  async listModels({ settings, getOpenAiApiKey }: AiModelListRequest): Promise<string[]> {
    const apiKey = getOpenAiApiKey().trim();
    if (!apiKey) {
      throw new Error('OpenAI API key fehlt.');
    }

    const response = await fetchWithTimeout(
      `${getOpenAiBaseUrl(settings)}/models`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      AI_DISCOVERY_TIMEOUT_MS,
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI Modelle konnten nicht geladen werden (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(data.data) ? data.data : [];
    return uniqueSorted(models.map((model) => safeString(model.id).trim()).filter(isLikelyTextChatModel));
  }

  async generateText({ settings, systemPrompt, userPrompt, getOpenAiApiKey, shouldCancel, timeoutMs }: AiTextRequest): Promise<string> {
    const apiKey = getOpenAiApiKey().trim();
    if (!apiKey) {
      throw new Error('OpenAI API key fehlt.');
    }

    const response = await fetchWithTimeout(
      `${getOpenAiBaseUrl(settings)}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.getSelectedModel(settings),
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      },
      timeoutMs,
      shouldCancel,
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI Anfrage fehlgeschlagen (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    return safeString(data.choices?.[0]?.message?.content).trim();
  }
}
