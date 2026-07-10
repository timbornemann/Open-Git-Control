import type { AppSettings } from '../settings';
import type { AiProviderClient } from './AiProviderClient';

export const CHAT_TIMEOUT_MS = 90_000;

export async function runProviderText(
  providerClient: AiProviderClient,
  settings: AppSettings,
  systemPrompt: string,
  userPrompt: string,
  getGeminiApiKey: () => string,
  shouldCancel?: () => boolean,
  timeoutMs = CHAT_TIMEOUT_MS,
  getOpenAiApiKey: () => string = () => '',
): Promise<string> {
  return providerClient.generateText({
    settings,
    systemPrompt,
    userPrompt,
    getGeminiApiKey,
    getOpenAiApiKey,
    shouldCancel,
    timeoutMs,
  });
}
