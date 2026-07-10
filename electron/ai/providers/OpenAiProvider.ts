import type { AppSettings } from '../../settings';
import type { AiConnectionResult, AiConnectionTestRequest, AiModelListRequest, AiProvider, AiTextRequest } from './AiProvider';
import { fetchWithTimeout, safeString, uniqueSorted } from './providerUtils';

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
    const response = await fetch(`${getOpenAiBaseUrl(settings)}/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
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

    const response = await fetch(`${getOpenAiBaseUrl(settings)}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI Modelle konnten nicht geladen werden (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(data.data) ? data.data : [];
    return uniqueSorted(models.map((model) => safeString(model.id).trim()).filter(Boolean));
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
