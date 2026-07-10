import { app, ipcMain } from 'electron';
import type { AppSettings } from '../../settings';
import { normalizeSettings } from '../../settings';
import type { StoredData } from '../repoStore';
import { readStoreData, writeStoreData } from '../repoStore';
import { IpcChannel } from '../../../src/types/ipcContract';
import { clearSavedGeminiApiKeySecurely, clearSavedGithubTokenSecurely, normalizeGeminiApiKey, saveGeminiApiKeySecurely } from '../secureStore';
import { readSettingsWithMigration, writeSettings } from '../settingsStore';
import type { UpdaterManager } from '../updaterManager';
import type { GitHubService } from '../../GitHubService';

type RegisterRepoSettingsHandlersDeps = {
  updaterManager: UpdaterManager;
  githubService: Pick<GitHubService, 'logout'>;
};

export function registerRepoSettingsHandlers({ updaterManager, githubService }: RegisterRepoSettingsHandlersDeps): void {
  ipcMain.handle(IpcChannel.ReposGetStored, async () => {
    return readStoreData();
  });

  ipcMain.handle(IpcChannel.ReposSetStored, async (_event: any, data: StoredData) => {
    writeStoreData(data);
    return true;
  });

  ipcMain.handle(IpcChannel.SettingsGet, async () => {
    return readSettingsWithMigration();
  });

  ipcMain.handle(IpcChannel.SettingsSet, async (_event: any, partial: Partial<AppSettings>) => {
    const current = readSettingsWithMigration();
    const partialWithoutSecrets = { ...partial } as Partial<AppSettings> & {
      geminiApiKey?: unknown;
      hasGeminiApiKey?: unknown;
    };
    delete partialWithoutSecrets.geminiApiKey;
    delete partialWithoutSecrets.hasGeminiApiKey;

    const next = normalizeSettings({
      ...current,
      ...partialWithoutSecrets,
      hasGeminiApiKey: current.hasGeminiApiKey,
    });

    writeSettings(next);
    if (next.githubHost !== current.githubHost) {
      githubService.logout();
      clearSavedGithubTokenSecurely();
    }
    if (next.autoUpdateEnabled !== current.autoUpdateEnabled) {
      updaterManager.setAutoUpdatesEnabled(next.autoUpdateEnabled);
    }
    return next;
  });

  ipcMain.handle(IpcChannel.SettingsSetGeminiApiKey, async (_event: any, apiKey: unknown) => {
    const normalized = normalizeGeminiApiKey(apiKey);
    const current = readSettingsWithMigration();
    const saved = saveGeminiApiKeySecurely(normalized);
    if (normalized && !saved) {
      throw new Error('OS-backed encryption is not available. The Gemini API key was not saved.');
    }
    const next = normalizeSettings({
      ...current,
      hasGeminiApiKey: Boolean(normalized),
    });
    writeSettings(next);
    return next;
  });

  ipcMain.handle(IpcChannel.SettingsClearGeminiApiKey, async () => {
    const current = readSettingsWithMigration();
    clearSavedGeminiApiKeySecurely();
    const next = normalizeSettings({ ...current, hasGeminiApiKey: false });
    writeSettings(next);
    return next;
  });

  ipcMain.handle(IpcChannel.AppGetVersion, async () => {
    return app.getVersion();
  });
}
