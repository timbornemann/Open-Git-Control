import { app, ipcMain } from 'electron';
import type { AppSettings } from '../../settings';
import { normalizeSettings } from '../../settings';
import type { StoredData } from '../repoStore';
import { readStoreData, writeStoreData } from '../repoStore';
import { IpcChannel } from '../../../src/types/ipcContract';
import {
  clearSavedGeminiApiKeySecurely,
  clearSavedGithubTokenSecurely,
  clearSavedOpenAiApiKeySecurely,
  normalizeGeminiApiKey,
  normalizeOpenAiApiKey,
  saveGeminiApiKeySecurely,
  saveOpenAiApiKeySecurely,
} from '../secureStore';
import { readSettingsWithMigration, writeSettings } from '../settingsStore';
import type { UpdaterManager } from '../updaterManager';
import type { GitHubService } from '../../GitHubService';

type RegisterRepoSettingsHandlersDeps = {
  updaterManager: UpdaterManager;
  githubService: Pick<GitHubService, 'logout'>;
};

function getEndpointOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

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
      openAiApiKey?: unknown;
      hasOpenAiApiKey?: unknown;
    };
    delete partialWithoutSecrets.geminiApiKey;
    delete partialWithoutSecrets.hasGeminiApiKey;
    delete partialWithoutSecrets.openAiApiKey;
    delete partialWithoutSecrets.hasOpenAiApiKey;

    let next = normalizeSettings({
      ...current,
      ...partialWithoutSecrets,
      hasGeminiApiKey: current.hasGeminiApiKey,
      hasOpenAiApiKey: current.hasOpenAiApiKey,
    });

    // A saved key belongs to the endpoint the user explicitly configured it
    // for. Do not carry it over to another host (or back to the default) where
    // it could otherwise be sent without a fresh user action.
    if (getEndpointOrigin(next.openAiBaseUrl) !== getEndpointOrigin(current.openAiBaseUrl)) {
      clearSavedOpenAiApiKeySecurely();
      next = normalizeSettings({ ...next, hasOpenAiApiKey: false });
    }

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

  ipcMain.handle(IpcChannel.SettingsSetOpenAiApiKey, async (_event: any, apiKey: unknown) => {
    const normalized = normalizeOpenAiApiKey(apiKey);
    const current = readSettingsWithMigration();
    const saved = saveOpenAiApiKeySecurely(normalized);
    if (normalized && !saved) {
      throw new Error('OS-backed encryption is not available. The OpenAI API key was not saved.');
    }
    const next = normalizeSettings({
      ...current,
      hasOpenAiApiKey: Boolean(normalized),
    });
    writeSettings(next);
    return next;
  });

  ipcMain.handle(IpcChannel.SettingsClearOpenAiApiKey, async () => {
    const current = readSettingsWithMigration();
    clearSavedOpenAiApiKeySecurely();
    const next = normalizeSettings({ ...current, hasOpenAiApiKey: false });
    writeSettings(next);
    return next;
  });

  ipcMain.handle(IpcChannel.AppGetVersion, async () => {
    return app.getVersion();
  });
}
