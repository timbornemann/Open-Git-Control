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

function getValidOpenAiEndpointOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol.toLowerCase() !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
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

    const hasOpenAiBaseUrlUpdate = Object.prototype.hasOwnProperty.call(partialWithoutSecrets, 'openAiBaseUrl');
    const requestedOpenAiOrigin = getValidOpenAiEndpointOrigin(partialWithoutSecrets.openAiBaseUrl);
    // Invalid/incomplete endpoint text is not a request to reset to the
    // default. Retain both the configured endpoint and its bound credential.
    if (hasOpenAiBaseUrlUpdate && requestedOpenAiOrigin === null) {
      delete partialWithoutSecrets.openAiBaseUrl;
    }

    let next = normalizeSettings({
      ...current,
      ...partialWithoutSecrets,
      hasGeminiApiKey: current.hasGeminiApiKey,
      hasOpenAiApiKey: current.hasOpenAiApiKey,
    });

    // A saved key belongs to the endpoint the user explicitly configured it
    // for. Do not carry it over to another host (or back to the default) where
    // it could otherwise be sent without a fresh user action.
    const githubHostChanged = next.githubHost !== current.githubHost;
    if (githubHostChanged) {
      // Deleting the host-bound credential is the commit precondition. If it
      // fails, leave both persisted settings and the live session untouched.
      clearSavedGithubTokenSecurely();
    }
    if (requestedOpenAiOrigin !== null && requestedOpenAiOrigin !== getEndpointOrigin(current.openAiBaseUrl)) {
      clearSavedOpenAiApiKeySecurely();
      next = normalizeSettings({ ...next, hasOpenAiApiKey: false });
    }

    writeSettings(next);
    if (githubHostChanged) {
      githubService.logout();
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
