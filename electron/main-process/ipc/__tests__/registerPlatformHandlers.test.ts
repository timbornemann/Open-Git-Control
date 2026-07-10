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
  readSettingsWithMigrationMock,
  readStoreDataMock,
  saveGeminiApiKeySecurelyMock,
  writeSettingsMock,
  writeStoreDataMock,
} = vi.hoisted(() => ({
  clearSavedGeminiApiKeySecurelyMock: vi.fn(),
  clearSavedGithubTokenSecurelyMock: vi.fn(),
  readSettingsWithMigrationMock: vi.fn(),
  readStoreDataMock: vi.fn(),
  saveGeminiApiKeySecurelyMock: vi.fn(),
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
  normalizeGeminiApiKey: (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 500) : ''),
  saveGeminiApiKeySecurely: saveGeminiApiKeySecurelyMock,
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
    expect(githubService.logout).toHaveBeenCalledOnce();
    expect(updaterManager.setAutoUpdatesEnabled).toHaveBeenCalledWith(true);

    await expect(handlers.get(IpcChannel.AppGetVersion)?.({})).resolves.toBe('9.8.7');
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
});
