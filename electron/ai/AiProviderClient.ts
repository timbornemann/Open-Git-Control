import { AppSettings } from '../settings';

export type AiTextRequest = {
  settings: AppSettings;
  systemPrompt: string;
  userPrompt: string;
  getGeminiApiKey: () => string;
  shouldCancel?: () => boolean;
  timeoutMs: number;
};

const safeString = (value: unknown, fallback = ''): string => (
  typeof value === 'string' ? value : fallback
);

export function normalizeGeminiModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
}

export function getSelectedAiModel(settings: AppSettings): string {
  return settings.aiProvider === 'gemini'
    ? normalizeGeminiModel(settings.geminiModel)
    : settings.ollamaModel.trim();
}

export class AiProviderClient {
  async testConnection(
    settings: AppSettings,
    getGeminiApiKey: () => string,
  ): Promise<{ ok: true; provider: AppSettings['aiProvider']; model: string; detail: string }> {
    if (settings.aiProvider === 'gemini') {
      const apiKey = getGeminiApiKey().trim();
      if (!apiKey) {
        throw new Error('Gemini API key fehlt.');
      }

      const model = normalizeGeminiModel(settings.geminiModel);
      if (!model) {
        throw new Error('Gemini Modell fehlt.');
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(apiKey)}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini nicht erreichbar (${response.status}): ${text || response.statusText}`);
      }

      return { ok: true, provider: 'gemini', model, detail: 'Gemini API erreichbar' };
    }

    const response = await fetch(`${settings.ollamaBaseUrl}/api/version`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama nicht erreichbar (${response.status}): ${text || response.statusText}`);
    }

    const json = (await response.json()) as { version?: unknown };
    return { ok: true, provider: 'ollama', model: settings.ollamaModel, detail: `Ollama ${safeString(json.version, 'unknown')}` };
  }

  async listModels(settings: AppSettings, getGeminiApiKey: () => string): Promise<string[]> {
    if (settings.aiProvider === 'gemini') {
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
      return this.uniqueSorted(
        models
          .filter(model => {
            const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
            return methods.includes('generateContent');
          })
          .map(model => normalizeGeminiModel(safeString(model.name)))
          .filter(Boolean),
      );
    }

    const response = await fetch(`${settings.ollamaBaseUrl}/api/tags`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama Modelle konnten nicht geladen werden (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as { models?: Array<{ name?: unknown; model?: unknown }> };
    const models = Array.isArray(data.models) ? data.models : [];
    return this.uniqueSorted(
      models
        .map(model => safeString(model.name || model.model).trim())
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
    if (settings.aiProvider === 'gemini') {
      return this.runGeminiText(settings, systemPrompt, userPrompt, getGeminiApiKey, shouldCancel, timeoutMs);
    }

    return this.runOllamaText(settings, systemPrompt, userPrompt, shouldCancel, timeoutMs);
  }

  private async runGeminiText(
    settings: AppSettings,
    systemPrompt: string,
    userPrompt: string,
    getGeminiApiKey: () => string,
    shouldCancel: (() => boolean) | undefined,
    timeoutMs: number,
  ): Promise<string> {
    const apiKey = getGeminiApiKey().trim();
    if (!apiKey) {
      throw new Error('Gemini API key fehlt.');
    }

    const model = normalizeGeminiModel(settings.geminiModel);
    if (!model) {
      throw new Error('Gemini Modell fehlt.');
    }

    const response = await this.fetchWithTimeout(
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

  private async runOllamaText(
    settings: AppSettings,
    systemPrompt: string,
    userPrompt: string,
    shouldCancel: (() => boolean) | undefined,
    timeoutMs: number,
  ): Promise<string> {
    const response = await this.fetchWithTimeout(
      `${settings.ollamaBaseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.ollamaModel,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          options: { temperature: 0.1 },
        }),
      },
      timeoutMs,
      shouldCancel,
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama Anfrage fehlgeschlagen (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as { message?: { content?: unknown } };
    return safeString(data.message?.content).trim();
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    shouldCancel?: () => boolean,
  ): Promise<Response> {
    const controller = new AbortController();
    let abortedByTimeout = false;
    let abortedByCancel = false;
    const timeout = setTimeout(() => {
      abortedByTimeout = true;
      controller.abort();
    }, timeoutMs);
    const cancelPoll = setInterval(() => {
      if (!shouldCancel?.()) return;
      abortedByCancel = true;
      controller.abort();
    }, 120);

    try {
      if (shouldCancel?.()) {
        abortedByCancel = true;
        controller.abort();
      }
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : '';
      if (errorName === 'AbortError') {
        if (abortedByCancel || shouldCancel?.()) {
          throw new Error('KI Auto-Commit wurde abgebrochen.');
        }
        if (abortedByTimeout) {
          throw new Error(`KI Anfrage Zeitlimit ueberschritten (${Math.round(timeoutMs / 1000)}s).`);
        }
        throw new Error(`KI Anfrage Zeitlimit ueberschritten (${Math.round(timeoutMs / 1000)}s).`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      clearInterval(cancelPoll);
    }
  }

  private uniqueSorted(values: string[]): string[] {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }
}
