import type { AppSettings } from '../settings';
import type { AiConnectionResult, AiProvider, AiTextRequest } from './providers/AiProvider';
import { GeminiProvider, normalizeGeminiModel } from './providers/GeminiProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { OpenAiProvider } from './providers/OpenAiProvider';

export type { AiTextRequest };
export { normalizeGeminiModel };

const geminiProvider = new GeminiProvider();
const ollamaProvider = new OllamaProvider();
const openAiProvider = new OpenAiProvider();

export function getSelectedAiModel(settings: AppSettings): string {
  return getConfiguredProvider(settings).getSelectedModel(settings);
}

export class AiProviderClient {
  async testConnection(
    settings: AppSettings,
    getGeminiApiKey: () => string,
  ): Promise<{ ok: true; provider: AppSettings['aiProvider']; model: string; detail: string }> {
    const result = await getConfiguredProvider(settings).testConnection({ settings, getGeminiApiKey });
    return result as AiConnectionResult & { provider: AppSettings['aiProvider'] };
  }

  async listModels(settings: AppSettings, getGeminiApiKey: () => string): Promise<string[]> {
    return getConfiguredProvider(settings).listModels({ settings, getGeminiApiKey });
  }

  async generateText(request: AiTextRequest): Promise<string> {
    return getConfiguredProvider(request.settings).generateText(request);
  }
}

const getConfiguredProvider = (settings: AppSettings): AiProvider => {
  switch (settings.aiProvider) {
    case 'gemini':
      return geminiProvider;
    case 'ollama':
      return ollamaProvider;
    default:
      return openAiProvider;
  }
};
