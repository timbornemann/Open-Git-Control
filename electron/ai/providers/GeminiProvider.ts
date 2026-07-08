import type { AppSettings } from '../../settings';
import type {
  AiConnectionResult,
  AiConnectionTestRequest,
  AiModelListRequest,
  AiProvider,
  AiTextRequest,
} from './AiProvider';
import { fetchWithTimeout, safeString, uniqueSorted } from './providerUtils';

export function normalizeGeminiModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
}

export class GeminiProvider implements AiProvider {
  readonly id = 'gemini' as const;

  getSelectedModel(settings: AppSettings): string {
    return normalizeGeminiModel(settings.geminiModel);
  }

  async testConnection({ settings, getGeminiApiKey }: AiConnectionTestRequest): Promise<AiConnectionResult> {
    const apiKey = getGeminiApiKey().trim();
    if (!apiKey) {
      throw new Error('Gemini API key fehlt.');
    }

    const model = this.getSelectedModel(settings);
    if (!model) {
      throw new Error('Gemini Modell fehlt.');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini nicht erreichbar (${response.status}): ${text || response.statusText}`);
    }

    return { ok: true, provider: this.id, model, detail: 'Gemini API erreichbar' };
  }

  async listModels({ getGeminiApiKey }: AiModelListRequest): Promise<string[]> {
    const apiKey = getGeminiApiKey().trim();
    if (!apiKey) {
      throw new Error('Gemini API key fehlt.');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini Modelle konnten nicht geladen werden (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as { models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }> };
    const models = Array.isArray(data.models) ? data.models : [];
    return uniqueSorted(
      models
        .filter(model => {
          const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
          return methods.includes('generateContent');
        })
        .map(model => normalizeGeminiModel(safeString(model.name)))
        .filter(Boolean),
    );
  }

  async generateText({
    settings,
    systemPrompt,
    userPrompt,
    getGeminiApiKey,
    shouldCancel,
    timeoutMs,
  }: AiTextRequest): Promise<string> {
    const apiKey = getGeminiApiKey().trim();
    if (!apiKey) {
      throw new Error('Gemini API key fehlt.');
    }

    const model = this.getSelectedModel(settings);
    if (!model) {
      throw new Error('Gemini Modell fehlt.');
    }

    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      },
      timeoutMs,
      shouldCancel,
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini Anfrage fehlgeschlagen (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    };

    const parts = data.candidates?.[0]?.content?.parts || [];
    return parts
      .map((part) => safeString(part.text))
      .join('')
      .trim();
  }
}
