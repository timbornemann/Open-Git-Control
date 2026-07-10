import type { AppSettings, AiProvider as ConfiguredAiProvider } from '../../settings';

export type AiProviderName = ConfiguredAiProvider;

export type AiTextRequest = {
  settings: AppSettings;
  systemPrompt: string;
  userPrompt: string;
  getGeminiApiKey: () => string;
  getOpenAiApiKey: () => string;
  shouldCancel?: () => boolean;
  timeoutMs: number;
};

export type AiModelListRequest = {
  settings: AppSettings;
  getGeminiApiKey: () => string;
  getOpenAiApiKey: () => string;
};

export type AiConnectionTestRequest = {
  settings: AppSettings;
  getGeminiApiKey: () => string;
  getOpenAiApiKey: () => string;
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
