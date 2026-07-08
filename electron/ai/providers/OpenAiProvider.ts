import type { AppSettings } from '../../settings';
import type {
  AiConnectionResult,
  AiConnectionTestRequest,
  AiModelListRequest,
  AiProvider,
  AiTextRequest,
} from './AiProvider';
import { fetchWithTimeout, safeString, uniqueSorted } from './providerUtils';

type OpenAiSettings = AppSettings & {
  openAiBaseUrl?: string;
  openAiModel?: string;
  openAiApiKey?: string;
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

const openAiSettings = (settings: AppSettings): OpenAiSettings => settings as OpenAiSettings;

const getOpenAiBaseUrl = (settings: AppSettings): string => {
  const configured = openAiSettings(settings).openAiBaseUrl?.trim().replace(/\/+$/, '');
  return configured || DEFAULT_OPENAI_BASE_URL;
};

const getOpenAiModel = (settings: AppSettings): string => {
  return openAiSettings(settings).openAiModel?.trim() || DEFAULT_OPENAI_MODEL;
};

const getOpenAiApiKey = (settings: AppSettings): string => {
  return openAiSettings(settings).openAiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim() || '';
};

export class OpenAiProvider implements AiProvider {
  readonly id = 'openai' as const;

  getSelectedModel(settings: AppSettings): string {
    return getOpenAiModel(settings);
  }

  async testConnection({ settings }: AiConnectionTestRequest): Promise<AiConnectionResult> {
    const apiKey = getOpenAiApiKey(settings);
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

  async listModels({ settings }: AiModelListRequest): Promise<string[]> {
    const apiKey = getOpenAiApiKey(settings);
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
    return uniqueSorted(
      models
        .map(model => safeString(model.id).trim())
        .filter(Boolean),
    );
  }

  async generateText({
    settings,
    systemPrompt,
    userPrompt,
    shouldCancel,
    timeoutMs,
  }: AiTextRequest): Promise<string> {
    const apiKey = getOpenAiApiKey(settings);
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
