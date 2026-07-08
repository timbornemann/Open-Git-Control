import type { AppSettings, AiProvider as ConfiguredAiProvider } from '../../settings';

export type AiProviderName = ConfiguredAiProvider | 'openai';

export type AiTextRequest = {
  settings: AppSettings;
  systemPrompt: string;
  userPrompt: string;
  getGeminiApiKey: () => string;
  shouldCancel?: () => boolean;
  timeoutMs: number;
};

export type AiModelListRequest = {
  settings: AppSettings;
  getGeminiApiKey: () => string;
};

export type AiConnectionTestRequest = {
  settings: AppSettings;
  getGeminiApiKey: () => string;
};

export type AiConnectionResult = {
  ok: true;
  provider: AiProviderName;
  model: string;
  detail: string;
};

export interface AiProvider {
  readonly id: AiProviderName;
  getSelectedModel(settings: AppSettings): string;
  testConnection(request: AiConnectionTestRequest): Promise<AiConnectionResult>;
  listModels(request: AiModelListRequest): Promise<string[]>;
  generateText(request: AiTextRequest): Promise<string>;
}
