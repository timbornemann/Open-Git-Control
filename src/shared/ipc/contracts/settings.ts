import type { AppSettingsDto } from '../../../types/appDtos';

export interface ElectronSettingsAPI {
  getSettings: () => Promise<AppSettingsDto>;
  setSettings: (partial: Partial<AppSettingsDto>) => Promise<AppSettingsDto>;
  setGeminiApiKey: (apiKey: string) => Promise<AppSettingsDto>;
  clearGeminiApiKey: () => Promise<AppSettingsDto>;
  setOpenAiApiKey: (apiKey: string) => Promise<AppSettingsDto>;
  clearOpenAiApiKey: () => Promise<AppSettingsDto>;
}
