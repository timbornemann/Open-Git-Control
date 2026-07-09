import type { AppSettingsDto } from '../../../global';

export interface ElectronSettingsAPI {
  getSettings: () => Promise<AppSettingsDto>;
  setSettings: (partial: Partial<AppSettingsDto>) => Promise<AppSettingsDto>;
  setGeminiApiKey: (apiKey: string) => Promise<AppSettingsDto>;
  clearGeminiApiKey: () => Promise<AppSettingsDto>;
}
