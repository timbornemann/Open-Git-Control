import type { AppSettings } from '../../settings';
import type { AiConnectionResult, AiConnectionTestRequest, AiModelListRequest, AiProvider, AiTextRequest } from './AiProvider';
import { AI_DISCOVERY_TIMEOUT_MS, fetchWithTimeout, safeString, uniqueSorted } from './providerUtils';

export class OllamaProvider implements AiProvider {
  readonly id = 'ollama' as const;

  getSelectedModel(settings: AppSettings): string {
    return settings.ollamaModel.trim();
  }

  async testConnection({ settings }: AiConnectionTestRequest): Promise<AiConnectionResult> {
    const model = this.getSelectedModel(settings);
    if (!model) throw new Error('Ollama Modell fehlt.');

    const response = await fetchWithTimeout(`${settings.ollamaBaseUrl}/api/version`, {}, AI_DISCOVERY_TIMEOUT_MS);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama nicht erreichbar (${response.status}): ${text || response.statusText}`);
    }

    const json = (await response.json()) as { version?: unknown };
    const showResponse = await fetchWithTimeout(
      `${settings.ollamaBaseUrl}/api/show`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      },
      AI_DISCOVERY_TIMEOUT_MS,
    );
    if (!showResponse.ok) {
      const text = await showResponse.text();
      throw new Error(`Ollama Modell "${model}" ist nicht verfuegbar (${showResponse.status}): ${text || showResponse.statusText}`);
    }
    const modelInfo = (await showResponse.json()) as { capabilities?: unknown };
    const capabilities = Array.isArray(modelInfo.capabilities) ? modelInfo.capabilities : [];
    if (capabilities.length > 0 && !capabilities.includes('completion')) {
      throw new Error(`Ollama Modell "${model}" unterstuetzt keine Textgenerierung.`);
    }
    return {
      ok: true,
      provider: this.id,
      model,
      detail: `Ollama ${safeString(json.version, 'unknown')}`,
    };
  }

  async listModels({ settings }: AiModelListRequest): Promise<string[]> {
    const response = await fetchWithTimeout(`${settings.ollamaBaseUrl}/api/tags`, {}, AI_DISCOVERY_TIMEOUT_MS);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama Modelle konnten nicht geladen werden (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as { models?: Array<{ name?: unknown; model?: unknown }> };
    const models = Array.isArray(data.models) ? data.models : [];
    return uniqueSorted(models.map((model) => safeString(model.name || model.model).trim()).filter(Boolean));
  }

  async generateText({ settings, systemPrompt, userPrompt, shouldCancel, timeoutMs }: AiTextRequest): Promise<string> {
    const response = await fetchWithTimeout(
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
}
