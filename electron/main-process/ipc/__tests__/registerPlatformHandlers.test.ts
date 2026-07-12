import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../src/types/ipcContract';

const { appGetVersionMock, handleMock } = vi.hoisted(() => ({
  appGetVersionMock: vi.fn(),
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getVersion: appGetVersionMock,
  },
  ipcMain: {
    handle: handleMock,
  },
}));

const {
  clearSavedGeminiApiKeySecurelyMock,
  clearSavedGithubTokenSecurelyMock,
  clearSavedOpenAiApiKeySecurelyMock,
  readSettingsWithMigrationMock,
  readStoreDataMock,
  saveGeminiApiKeySecurelyMock,
  saveOpenAiApiKeySecurelyMock,
  writeSettingsMock,
  writeStoreDataMock,
} = vi.hoisted(() => ({
  clearSavedGeminiApiKeySecurelyMock: vi.fn(),
  clearSavedGithubTokenSecurelyMock: vi.fn(),
  clearSavedOpenAiApiKeySecurelyMock: vi.fn(),
  readSettingsWithMigrationMock: vi.fn(),
  readStoreDataMock: vi.fn(),
  saveGeminiApiKeySecurelyMock: vi.fn(),
  saveOpenAiApiKeySecurelyMock: vi.fn(),
  writeSettingsMock: vi.fn(),
  writeStoreDataMock: vi.fn(),
}));

vi.mock('../../repoStore', () => ({
  readStoreData: readStoreDataMock,
  writeStoreData: writeStoreDataMock,
}));

vi.mock('../../settingsStore', () => ({
  readSettingsWithMigration: readSettingsWithMigrationMock,
  writeSettings: writeSettingsMock,
}));

vi.mock('../../secureStore', () => ({
  clearSavedGeminiApiKeySecurely: clearSavedGeminiApiKeySecurelyMock,
  clearSavedGithubTokenSecurely: clearSavedGithubTokenSecurelyMock,
  clearSavedOpenAiApiKeySecurely: clearSavedOpenAiApiKeySecurelyMock,
  normalizeGeminiApiKey: (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 500) : ''),
  normalizeOpenAiApiKey: (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 500) : ''),
  saveGeminiApiKeySecurely: saveGeminiApiKeySecurelyMock,
  saveOpenAiApiKeySecurely: saveOpenAiApiKeySecurelyMock,
}));

const getRegisteredHandlers = () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  handleMock.mockImplementation((channel: string, callback: (...args: any[]) => Promise<any>) => {
    handlers.set(channel, callback);
  });
  return handlers;
};

describe('platform IPC handlers', () => {
  beforeEach(() => {
    handleMock.mockReset();
    appGetVersionMock.mockReset();
    readStoreDataMock.mockReset();
    writeStoreDataMock.mockReset();
    readSettingsWithMigrationMock.mockReset();
    writeSettingsMock.mockReset();
    saveGeminiApiKeySecurelyMock.mockReset();
    clearSavedGeminiApiKeySecurelyMock.mockReset();
    clearSavedGithubTokenSecurelyMock.mockReset();
    saveOpenAiApiKeySecurelyMock.mockReset();
    clearSavedOpenAiApiKeySecurelyMock.mockReset();
  });

  it('wraps diagnostics report success and failure responses', async () => {
    const { registerDiagnosticsHandlers } = await import('../registerDiagnosticsHandlers');
    const handlers = getRegisteredHandlers();
    const buildDiagnosticsReport = vi.fn().mockResolvedValue({
      generatedAt: '2026-07-09T12:00:00Z',
      appVersion: '1.2.3',
      platform: 'win32',
      activeRepo: 'C:/repo',
      report: 'ok',
    });

    registerDiagnosticsHandlers({ buildDiagnosticsReport });

    await expect(handlers.get(IpcChannel.DiagnosticsReport)?.({})).resolves.toEqual({
      success: true,
      data: {
        generatedAt: '2026-07-09T12:00:00Z',
        appVersion: '1.2.3',
        platform: 'win32',
        activeRepo: 'C:/repo',
        report: 'ok',
      },
    });

    buildDiagnosticsReport.mockRejectedValueOnce(new Error('boom'));
    await expect(handlers.get(IpcChannel.DiagnosticsReport)?.({})).resolves.toEqual({
      success: false,
      error: 'boom',
    });

    buildDiagnosticsReport.mockRejectedValueOnce('bad');
    await expect(handlers.get(IpcChannel.DiagnosticsReport)?.({})).resolves.toEqual({
      success: false,
      error: 'Diagnostics konnten nicht erstellt werden.',
    });
  });

  it('registers updater IPC handlers as thin updater-manager delegates', async () => {
    const { registerUpdaterHandlers } = await import('../registerUpdaterHandlers');
    const handlers = getRegisteredHandlers();
    const updaterManager = {
      getStatus: vi.fn().mockReturnValue({ state: 'idle' }),
      checkForAppUpdates: vi.fn().mockResolvedValue({ checked: true }),
      runOneClickUpdate: vi.fn().mockResolvedValue({ started: true }),
      downloadAvailableUpdate: vi.fn().mockResolvedValue({ downloaded: true }),
      installDownloadedUpdate: vi.fn().mockResolvedValue({ installed: true }),
    };

    registerUpdaterHandlers({ updaterManager } as any);

    await expect(handlers.get(IpcChannel.UpdaterGetStatus)?.({})).resolves.toEqual({ state: 'idle' });
    await expect(handlers.get(IpcChannel.UpdaterCheck)?.({})).resolves.toEqual({ checked: true });
    await expect(handlers.get(IpcChannel.UpdaterRunOneClick)?.({})).resolves.toEqual({ started: true });
    await expect(handlers.get(IpcChannel.UpdaterDownload)?.({})).resolves.toEqual({ downloaded: true });
    await expect(handlers.get(IpcChannel.UpdaterInstall)?.({})).resolves.toEqual({ installed: true });
  });

  it('handles repository persistence, sanitized settings updates and app version', async () => {
    const { registerRepoSettingsHandlers } = await import('../registerRepoSettingsHandlers');
    const handlers = getRegisteredHandlers();
    const updaterManager = {
      setAutoUpdatesEnabled: vi.fn(),
    };
    const githubService = { logout: vi.fn() };
    const currentSettings = {
      language: 'de',
      githubHost: 'github.com',
      autoUpdateEnabled: false,
      hasGeminiApiKey: true,
    };
    readSettingsWithMigrationMock.mockReturnValue(currentSettings);
    readStoreDataMock.mockReturnValue({ repos: [{ path: 'C:/repo' }] });
    appGetVersionMock.mockReturnValue('9.8.7');

    registerRepoSettingsHandlers({ updaterManager, githubService } as any);

    await expect(handlers.get(IpcChannel.ReposGetStored)?.({})).resolves.toEqual({ repos: [{ path: 'C:/repo' }] });
    await expect(handlers.get(IpcChannel.ReposSetStored)?.({}, { repos: [] })).resolves.toBe(true);
    expect(writeStoreDataMock).toHaveBeenCalledWith({ repos: [] });

    await expect(
      handlers.get(IpcChannel.SettingsSet)?.(
        {},
        {
          language: 'en',
          githubHost: 'github.enterprise.local',
          autoUpdateEnabled: true,
          geminiApiKey: 'must-not-be-persisted',
          hasGeminiApiKey: false,
        },
      ),
    ).resolves.toEqual(expect.objectContaining({ language: 'en', githubHost: 'github.enterprise.local', autoUpdateEnabled: true, hasGeminiApiKey: true }));

    expect(writeSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ language: 'en', hasGeminiApiKey: true }));
    expect(writeSettingsMock.mock.calls[0][0]).not.toHaveProperty('geminiApiKey');
    expect(clearSavedGithubTokenSecurelyMock).toHaveBeenCalled();
    expect(clearSavedGithubTokenSecurelyMock.mock.invocationCallOrder[0]).toBeLessThan(writeSettingsMock.mock.invocationCallOrder[0]);
    expect(githubService.logout).toHaveBeenCalledOnce();
    expect(updaterManager.setAutoUpdatesEnabled).toHaveBeenCalledWith(true);

    await expect(handlers.get(IpcChannel.AppGetVersion)?.({})).resolves.toBe('9.8.7');
  });

  it('keeps the old GitHub host settings and session when token deletion fails', async () => {
    const { registerRepoSettingsHandlers } = await import('../registerRepoSettingsHandlers');
    const handlers = getRegisteredHandlers();
    const updaterManager = { setAutoUpdatesEnabled: vi.fn() };
    const githubService = { logout: vi.fn() };
    readSettingsWithMigrationMock.mockReturnValue({
      language: 'en',
      githubHost: 'github.com',
      autoUpdateEnabled: false,
      hasGeminiApiKey: false,
      hasOpenAiApiKey: false,
    });
    clearSavedGithubTokenSecurelyMock.mockImplementationOnce(() => {
      throw new Error('GitHub token file is locked.');
    });
    registerRepoSettingsHandlers({ updaterManager, githubService } as any);

    await expect(handlers.get(IpcChannel.SettingsSet)?.({}, { language: 'de', githubHost: 'github.enterprise.test', autoUpdateEnabled: true })).rejects.toThrow(
      'GitHub token file is locked.',
    );

    expect(writeSettingsMock).not.toHaveBeenCalled();
    expect(githubService.logout).not.toHaveBeenCalled();
    expect(updaterManager.setAutoUpdatesEnabled).not.toHaveBeenCalled();
  });

  it('updates and clears Gemini API key state through secure storage', async () => {
    const { registerRepoSettingsHandlers } = await import('../registerRepoSettingsHandlers');
    const handlers = getRegisteredHandlers();
    readSettingsWithMigrationMock.mockReturnValue({
      language: 'de',
      githubHost: 'github.com',
      autoUpdateEnabled: false,
      hasGeminiApiKey: false,
    });
    saveGeminiApiKeySecurelyMock.mockReturnValue(true);

    registerRepoSettingsHandlers({ updaterManager: { setAutoUpdatesEnabled: vi.fn() }, githubService: { logout: vi.fn() } } as any);

    await expect(handlers.get(IpcChannel.SettingsSetGeminiApiKey)?.({}, '  key  ')).resolves.toEqual(expect.objectContaining({ hasGeminiApiKey: true }));
    expect(saveGeminiApiKeySecurelyMock).toHaveBeenCalledWith('key');
    expect(writeSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ hasGeminiApiKey: true }));

    await expect(handlers.get(IpcChannel.SettingsClearGeminiApiKey)?.({})).resolves.toEqual(expect.objectContaining({ hasGeminiApiKey: false }));
    expect(clearSavedGeminiApiKeySecurelyMock).toHaveBeenCalled();
    expect(writeSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ hasGeminiApiKey: false }));
  });

  it('does not claim API-key persistence when OS-backed encryption is unavailable', async () => {
    const { registerRepoSettingsHandlers } = await import('../registerRepoSettingsHandlers');
    const handlers = getRegisteredHandlers();
    readSettingsWithMigrationMock.mockReturnValue({
      language: 'en',
      githubHost: 'github.com',
      autoUpdateEnabled: false,
      hasGeminiApiKey: false,
      hasOpenAiApiKey: false,
    });
    saveGeminiApiKeySecurelyMock.mockReturnValue(false);
    saveOpenAiApiKeySecurelyMock.mockReturnValue(false);

    registerRepoSettingsHandlers({ updaterManager: { setAutoUpdatesEnabled: vi.fn() }, githubService: { logout: vi.fn() } } as any);

    await expect(handlers.get(IpcChannel.SettingsSetGeminiApiKey)?.({}, 'gemini-key')).rejects.toThrow('Gemini API key was not saved');
    await expect(handlers.get(IpcChannel.SettingsSetOpenAiApiKey)?.({}, 'openai-key')).rejects.toThrow('OpenAI API key was not saved');
    expect(writeSettingsMock).not.toHaveBeenCalled();
  });

  it('does not clear API-key settings when secure file deletion fails', async () => {
    const { registerRepoSettingsHandlers } = await import('../registerRepoSettingsHandlers');
    const handlers = getRegisteredHandlers();
    readSettingsWithMigrationMock.mockReturnValue({
      language: 'de',
      githubHost: 'github.com',
      autoUpdateEnabled: false,
      hasGeminiApiKey: true,
      hasOpenAiApiKey: true,
    });
    clearSavedGeminiApiKeySecurelyMock.mockImplementationOnce(() => {
      throw new Error('Gemini key is locked');
    });
    clearSavedOpenAiApiKeySecurelyMock.mockImplementationOnce(() => {
      throw new Error('OpenAI key is locked');
    });

    registerRepoSettingsHandlers({ updaterManager: { setAutoUpdatesEnabled: vi.fn() }, githubService: { logout: vi.fn() } } as any);

    await expect(handlers.get(IpcChannel.SettingsClearGeminiApiKey)?.({})).rejects.toThrow('Gemini key is locked');
    await expect(handlers.get(IpcChannel.SettingsClearOpenAiApiKey)?.({})).rejects.toThrow('OpenAI key is locked');
    expect(writeSettingsMock).not.toHaveBeenCalled();
  });

  it('reads settings, manages the OpenAI key, and skips side effects when host/auto-update are unchanged', async () => {
    const { registerRepoSettingsHandlers } = await import('../registerRepoSettingsHandlers');
    const handlers = getRegisteredHandlers();
    const currentSettings = {
      language: 'de',
      githubHost: 'github.com',
      autoUpdateEnabled: false,
      hasGeminiApiKey: false,
      hasOpenAiApiKey: false,
    };
    readSettingsWithMigrationMock.mockReturnValue(currentSettings);
    saveOpenAiApiKeySecurelyMock.mockReturnValue(true);
    const updaterManager = { setAutoUpdatesEnabled: vi.fn() };
    const githubService = { logout: vi.fn() };

    registerRepoSettingsHandlers({ updaterManager, githubService } as any);

    await expect(handlers.get(IpcChannel.SettingsGet)?.({})).resolves.toEqual(currentSettings);

    // Host and auto-update unchanged => no logout, token clear or updater toggle.
    await handlers.get(IpcChannel.SettingsSet)?.({}, { language: 'en' });
    expect(githubService.logout).not.toHaveBeenCalled();
    expect(clearSavedGithubTokenSecurelyMock).not.toHaveBeenCalled();
    expect(updaterManager.setAutoUpdatesEnabled).not.toHaveBeenCalled();

    await expect(handlers.get(IpcChannel.SettingsSetOpenAiApiKey)?.({}, '  sk-test  ')).resolves.toEqual(expect.objectContaining({ hasOpenAiApiKey: true }));
    expect(saveOpenAiApiKeySecurelyMock).toHaveBeenCalledWith('sk-test');

    await expect(handlers.get(IpcChannel.SettingsClearOpenAiApiKey)?.({})).resolves.toEqual(expect.objectContaining({ hasOpenAiApiKey: false }));
    expect(clearSavedOpenAiApiKeySecurelyMock).toHaveBeenCalled();
  });

  it('clears a saved OpenAI key when its endpoint origin changes', async () => {
    const { registerRepoSettingsHandlers } = await import('../registerRepoSettingsHandlers');
    const handlers = getRegisteredHandlers();
    readSettingsWithMigrationMock.mockReturnValue({
      language: 'en',
      githubHost: 'github.com',
      autoUpdateEnabled: false,
      hasGeminiApiKey: false,
      hasOpenAiApiKey: true,
      openAiBaseUrl: 'https://api.openai.com/v1',
    });

    registerRepoSettingsHandlers({ updaterManager: { setAutoUpdatesEnabled: vi.fn() }, githubService: { logout: vi.fn() } } as any);

    await expect(handlers.get(IpcChannel.SettingsSet)?.({}, { openAiBaseUrl: 'https://gateway.example.test/v1' })).resolves.toEqual(
      expect.objectContaining({ openAiBaseUrl: 'https://gateway.example.test/v1', hasOpenAiApiKey: false }),
    );

    expect(clearSavedOpenAiApiKeySecurelyMock).toHaveBeenCalledTimes(1);
    expect(writeSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ hasOpenAiApiKey: false }));
  });

  it('does not clear a saved OpenAI key for an invalid intermediate endpoint value', async () => {
    const { registerRepoSettingsHandlers } = await import('../registerRepoSettingsHandlers');
    const handlers = getRegisteredHandlers();
    readSettingsWithMigrationMock.mockReturnValue({
      language: 'en',
      githubHost: 'github.com',
      autoUpdateEnabled: false,
      hasGeminiApiKey: false,
      hasOpenAiApiKey: true,
      openAiBaseUrl: 'https://gateway.example.test/v1',
    });

    registerRepoSettingsHandlers({ updaterManager: { setAutoUpdatesEnabled: vi.fn() }, githubService: { logout: vi.fn() } } as any);

    await expect(handlers.get(IpcChannel.SettingsSet)?.({}, { openAiBaseUrl: 'https:' })).resolves.toEqual(
      expect.objectContaining({ openAiBaseUrl: 'https://gateway.example.test/v1', hasOpenAiApiKey: true }),
    );
    expect(clearSavedOpenAiApiKeySecurelyMock).not.toHaveBeenCalled();
  });
});
