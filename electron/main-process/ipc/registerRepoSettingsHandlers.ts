import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import { AppSettings, normalizeSettings } from '../../settings';
import { StoredData, readStoreData, writeStoreData } from '../repoStore';
import {
  clearSavedGeminiApiKeySecurely,
  clearSavedGithubTokenSecurely,
  normalizeGeminiApiKey,
  saveGeminiApiKeySecurely,
} from '../secureStore';
import { readSettingsWithMigration, writeSettings } from '../settingsStore';
import { UpdaterManager } from '../updaterManager';

type RegisterRepoSettingsHandlersDeps = {
  updaterManager: UpdaterManager;
};

export function registerRepoSettingsHandlers({ updaterManager }: RegisterRepoSettingsHandlersDeps): void {
  ipcMain.handle('repos:getStored', async () => {
    const data = readStoreData();
    data.repos = data.repos.filter((r) => fs.existsSync(r.path));
    if (data.activeRepo && !data.repos.some((r) => r.path === data.activeRepo)) {
      data.activeRepo = data.repos.length > 0 ? data.repos[0].path : null;
    }
    writeStoreData(data);
    return data;
  });

  ipcMain.handle('repos:setStored', async (_event: any, data: StoredData) => {
    writeStoreData(data);
    return true;
  });

  ipcMain.handle('settings:get', async () => {
    return readSettingsWithMigration();
  });

  ipcMain.handle('settings:set', async (_event: any, partial: Partial<AppSettings>) => {
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
      clearSavedGithubTokenSecurely();
    }
    if (next.autoUpdateEnabled !== current.autoUpdateEnabled) {
      updaterManager.setAutoUpdatesEnabled(next.autoUpdateEnabled);
    }
    return next;
  });

  ipcMain.handle('settings:setGeminiApiKey', async (_event: any, apiKey: unknown) => {
    const normalized = normalizeGeminiApiKey(apiKey);
    const current = readSettingsWithMigration();
    const saved = saveGeminiApiKeySecurely(normalized);
    const next = normalizeSettings({
      ...current,
      hasGeminiApiKey: normalized ? saved : false,
    });
    writeSettings(next);
    return next;
  });

  ipcMain.handle('settings:clearGeminiApiKey', async () => {
    const current = readSettingsWithMigration();
    clearSavedGeminiApiKeySecurely();
    const next = normalizeSettings({ ...current, hasGeminiApiKey: false });
    writeSettings(next);
    return next;
  });

  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });
}
