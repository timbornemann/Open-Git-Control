import type { AppSettings } from '../../settings';
import type { AiConnectionResult, AiConnectionTestRequest, AiModelListRequest, AiProvider, AiTextRequest } from './AiProvider';
import { AI_DISCOVERY_TIMEOUT_MS, fetchJsonWithTimeout, fetchWithTimeout, safeString, uniqueSorted } from './providerUtils';

export class OllamaProvider implements AiProvider {
  readonly id = 'ollama' as const;

  getSelectedModel(settings: AppSettings): string {
    return settings.ollamaModel.trim();
  }

  async testConnection({ settings }: AiConnectionTestRequest): Promise<AiConnectionResult> {
    const model = this.getSelectedModel(settings);
    if (!model) throw new Error('Ollama Modell fehlt.');

    const json = await fetchJsonWithTimeout<{ version?: unknown }>(
      `${settings.ollamaBaseUrl}/api/version`,
      {},
      AI_DISCOVERY_TIMEOUT_MS,
      'Ollama nicht erreichbar',
    );
    const modelInfo = await fetchJsonWithTimeout<{ capabilities?: unknown }>(
      `${settings.ollamaBaseUrl}/api/show`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      },
      AI_DISCOVERY_TIMEOUT_MS,
      `Ollama Modell "${model}" ist nicht verfuegbar`,
    );
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
    const data = await fetchJsonWithTimeout<{ models?: Array<{ name?: unknown; model?: unknown }> }>(
      `${settings.ollamaBaseUrl}/api/tags`,
      {},
      AI_DISCOVERY_TIMEOUT_MS,
      'Ollama Modelle konnten nicht geladen werden',
    );
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
      async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Ollama Anfrage fehlgeschlagen (${response.status}): ${text || response.statusText}`);
        }

        return response.json();
      },
    );

    const data = response as { message?: { content?: unknown } };
    return safeString(data.message?.content).trim();
  }
}
