import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { autoUpdaterMock, getAllWindowsMock, getVersionMock } = vi.hoisted(() => ({
  autoUpdaterMock: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: true,
    allowPrerelease: true,
    disableWebInstaller: false,
    setFeedURL: vi.fn(),
    netSession: { webRequest: { onBeforeRequest: vi.fn() } },
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    on: vi.fn(),
    quitAndInstall: vi.fn(),
  },
  getAllWindowsMock: vi.fn(),
  getVersionMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getVersion: getVersionMock },
  BrowserWindow: { getAllWindows: getAllWindowsMock },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: autoUpdaterMock,
}));

import { UpdaterManager } from '../updaterManager';
import type { UpdaterStatusPayload } from '../updaterManager';
import { fixtureManifest } from './releaseArtifactFixtures';

const updateInfo = () => ({
  ...fixtureManifest(process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'windows', '2.0.0'),
  tag: 'v2.0.0',
  releaseNotes: 'New release',
});

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform });
};

type UpdaterManagerInternals = {
  setUpdaterStatus: (patch: Partial<UpdaterStatusPayload>) => void;
};

const setStatus = (manager: UpdaterManager, patch: Partial<UpdaterStatusPayload>): void => {
  (manager as unknown as UpdaterManagerInternals).setUpdaterStatus(patch);
};

const missingReleaseMetadataError = (metadataFile = 'latest.yml') =>
  new Error(
    `Cannot find ${metadataFile} in the latest release artifacts (https://github.com/timbornemann/Open-Git-Control/releases/download/v2.1.0/${metadataFile}): HttpError: 404\nHeaders: {"content-type":"text/plain"}`,
  );

describe('UpdaterManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPlatform('win32');
    getVersionMock.mockReturnValue('1.0.0');
    getAllWindowsMock.mockReturnValue([]);
    autoUpdaterMock.autoDownload = true;
    autoUpdaterMock.autoInstallOnAppQuit = true;
    autoUpdaterMock.checkForUpdates.mockReset();
    autoUpdaterMock.downloadUpdate.mockReset();
    autoUpdaterMock.on.mockReset();
    autoUpdaterMock.quitAndInstall.mockReset();
    autoUpdaterMock.setFeedURL.mockReset();
    autoUpdaterMock.netSession.webRequest.onBeforeRequest.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    vi.useRealTimers();
  });

  it('makes no automatic network checks when availability checks are disabled, while manual checks still work', async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    const manager = new UpdaterManager(false);
    manager.configureAutoUpdates(true, false);
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false);
    await manager.checkForAppUpdates();
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it('does not start a follow-up download when a check finishes after automatic checking was disabled', async () => {
    let finish!: () => void;
    autoUpdaterMock.checkForUpdates.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const manager = new UpdaterManager(false);
    manager.configureAutoUpdates(true);
    manager.setAutomaticChecksEnabled(false);
    autoUpdaterMock.on.mock.calls.find(([event]) => event === 'update-available')?.[1](updateInfo());
    finish();
    await Promise.resolve();
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
    expect(manager.getStatus().state).toBe('update-available');
    manager.dispose();
  });

  it('cancels an active download and stops future periodic checks when checks are disabled', async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    autoUpdaterMock.downloadUpdate.mockImplementation(
      (token) =>
        new Promise((_resolve, reject) => {
          token.onCancel(() => reject(new Error('cancelled')));
        }),
    );
    const manager = new UpdaterManager(false);
    manager.configureAutoUpdates(true);
    autoUpdaterMock.on.mock.calls.find(([event]) => event === 'update-available')?.[1](updateInfo());
    manager.setAutomaticChecksEnabled(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getStatus()).toMatchObject({ state: 'update-available', error: null });
    autoUpdaterMock.checkForUpdates.mockClear();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('waits for an already-running download instead of turning it into a five-second error', async () => {
    const manager = new UpdaterManager(false);
    setStatus(manager, { state: 'downloading', error: null });

    const update = manager.runOneClickUpdate();
    await vi.advanceTimersByTimeAsync(5_100);

    expect(manager.getStatus()).toMatchObject({ state: 'downloading', error: null });
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();

    setStatus(manager, { state: 'downloaded', downloaded: true });
    await vi.advanceTimersByTimeAsync(150);
    await expect(update).resolves.toEqual({ success: true, action: 'downloaded' });
  });

  it('keeps a slow update check in checking state after the short UI wait expires', async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    const manager = new UpdaterManager(false);

    const update = manager.runOneClickUpdate();
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(update).resolves.toEqual({ success: true });
    expect(manager.getStatus()).toMatchObject({ state: 'checking', error: null });
  });

  it('keeps waiting for a non-cancellable update check instead of timing out ahead of it', async () => {
    let resolveCheck!: () => void;
    autoUpdaterMock.checkForUpdates.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const manager = new UpdaterManager(false);

    const check = manager.checkForAppUpdates();
    let settled = false;
    void check.finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(45_100);

    expect(settled).toBe(false);
    resolveCheck();
    await expect(check).resolves.toEqual({ success: true });
    expect(manager.getStatus()).toMatchObject({ state: 'checking', error: null });
  });

  it.each(['latest.yml', 'latest-mac.yml', 'latest-linux.yml'])(
    'reports a published release without %s as pending instead of exposing the raw HTTP error',
    async (metadataFile) => {
      autoUpdaterMock.checkForUpdates.mockRejectedValue(missingReleaseMetadataError(metadataFile));
      const manager = new UpdaterManager(false);

      await expect(manager.runOneClickUpdate()).resolves.toEqual({ success: true, action: 'release-pending' });
      expect(manager.getStatus()).toMatchObject({
        state: 'release-pending',
        availableVersion: '2.1.0',
        releaseNotes: null,
        downloaded: false,
        error: null,
      });
      expect(JSON.stringify(manager.getStatus())).not.toContain(metadataFile);
      expect(JSON.stringify(manager.getStatus())).not.toContain('HttpError');
    },
  );

  it('replaces technical HTTP details from other updater failures with a safe message', async () => {
    autoUpdaterMock.checkForUpdates.mockRejectedValue(
      new Error('HttpError: 503\nHeaders: {"server":"github.com"}\n    at ElectronHttpExecutor.handleResponse (node_modules/httpExecutor.js:121:20)'),
    );
    const manager = new UpdaterManager(false);

    await expect(manager.checkForAppUpdates()).resolves.toEqual({
      success: false,
      error: 'Die Update-Pruefung konnte nicht abgeschlossen werden. Bitte versuche es spaeter erneut.',
    });
    expect(manager.getStatus()).toMatchObject({
      state: 'error',
      error: 'Die Update-Pruefung konnte nicht abgeschlossen werden. Bitte versuche es spaeter erneut.',
    });
  });

  it('cancels the underlying download when its timeout expires', async () => {
    let receivedToken: { cancelled: boolean } | null = null;
    autoUpdaterMock.downloadUpdate.mockImplementation((token: { cancelled: boolean }) => {
      receivedToken = token;
      return new Promise(() => {});
    });
    const manager = new UpdaterManager(false);
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    manager.configureAutoUpdates(false);
    const updateAvailable = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-available')?.[1];
    updateAvailable?.(updateInfo());

    const download = manager.downloadAvailableUpdate();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 100);

    await expect(download).resolves.toEqual({
      success: false,
      error: 'Der Update-Download hat das Zeitlimit ueberschritten und wurde abgebrochen.',
    });
    expect(receivedToken).toMatchObject({ cancelled: true });
    expect(manager.getStatus()).toMatchObject({ state: 'error', downloaded: false });
  });

  it('keeps checking for available versions without downloading when automatic updates are disabled', async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    const manager = new UpdaterManager(false);

    manager.configureAutoUpdates(false);
    await Promise.resolve();

    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false);
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1);
    const updateAvailable = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-available')?.[1];
    expect(updateAvailable).toBeTypeOf('function');
    updateAvailable?.(updateInfo());

    expect(manager.getStatus()).toMatchObject({ state: 'update-available', availableVersion: '2.0.0', releaseNotes: 'New release' });
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
  });

  it.each([
    { platform: 'win32', downloadState: 'downloading', initiallyInstallsOnQuit: true },
    { platform: 'win32', downloadState: 'downloaded', initiallyInstallsOnQuit: true },
    { platform: 'linux', downloadState: 'downloading', initiallyInstallsOnQuit: true },
    { platform: 'linux', downloadState: 'downloaded', initiallyInstallsOnQuit: true },
    { platform: 'darwin', downloadState: 'downloading', initiallyInstallsOnQuit: false },
    { platform: 'darwin', downloadState: 'downloaded', initiallyInstallsOnQuit: false },
  ] as const)(
    'disables installation on quit for a $downloadState update on $platform while keeping manual installation available',
    async ({ platform, downloadState, initiallyInstallsOnQuit }) => {
      setPlatform(platform);
      autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
      autoUpdaterMock.downloadUpdate.mockResolvedValue([]);
      const manager = new UpdaterManager(false);
      manager.configureAutoUpdates(true);

      const updateAvailable = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-available')?.[1];
      const updateDownloaded = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-downloaded')?.[1];
      expect(updateAvailable).toBeTypeOf('function');
      expect(updateDownloaded).toBeTypeOf('function');
      updateAvailable?.(updateInfo());
      await Promise.resolve();
      if (downloadState === 'downloaded') {
        updateDownloaded?.(updateInfo());
      }

      expect(manager.getStatus().state).toBe(downloadState);
      expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(initiallyInstallsOnQuit);
      manager.setAutoUpdatesEnabled(false);
      if (downloadState === 'downloading') {
        updateDownloaded?.(updateInfo());
      }

      expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false);
      expect(manager.getStatus()).toMatchObject({ state: 'downloaded', downloaded: true, availableVersion: '2.0.0' });
      expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled();

      expect(manager.installDownloadedUpdate()).toEqual({ success: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true);
      manager.dispose();
    },
  );

  it('continues to download an advertised version in the background when automatic updates are enabled', async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    autoUpdaterMock.downloadUpdate.mockResolvedValue([]);
    const manager = new UpdaterManager(false);

    manager.configureAutoUpdates(true);
    const updateAvailable = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-available')?.[1];
    updateAvailable?.(updateInfo());
    await Promise.resolve();

    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(true);
    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toMatchObject({ state: 'downloading', availableVersion: '2.0.0' });
  });

  it('pins update checks and downloads to the official public GitHub repository', () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    const manager = new UpdaterManager(false);
    manager.configureAutoUpdates(false);
    expect(autoUpdaterMock.setFeedURL).toHaveBeenCalledExactlyOnceWith({ provider: 'github', owner: 'timbornemann', repo: 'Open-Git-Control', private: false });
    expect(autoUpdaterMock.allowDowngrade).toBe(false);
    expect(autoUpdaterMock.allowPrerelease).toBe(false);
    expect(autoUpdaterMock.disableWebInstaller).toBe(true);
    const listener = autoUpdaterMock.netSession.webRequest.onBeforeRequest.mock.calls[0][1];
    const callback = vi.fn();
    listener({ url: 'https://evil.example/installer.exe', method: 'GET' }, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith({ cancel: true });
    manager.dispose();
  });

  it('blocks automatic downloads for unapproved release references', () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    const manager = new UpdaterManager(false);
    manager.configureAutoUpdates(true);
    const info = updateInfo();
    info.files[0].url = 'https://evil.example/update.exe';
    const updateAvailable = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-available')?.[1];
    updateAvailable?.(info);
    expect(manager.getStatus()).toMatchObject({ state: 'error', downloaded: false });
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('reports a rejected metadata event as a failed update check', async () => {
    autoUpdaterMock.checkForUpdates.mockImplementation(async () => {
      const info = updateInfo();
      info.files[0].url = 'https://evil.example/update.exe';
      const updateAvailable = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-available')?.[1];
      updateAvailable?.(info);
    });
    const manager = new UpdaterManager(false);
    manager.configureAutoUpdates(false);
    await expect(manager.checkForAppUpdates()).resolves.toMatchObject({ success: false, error: expect.stringContaining('Release-Metadaten') });
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('revalidates metadata before a manual download', async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    const manager = new UpdaterManager(false);
    manager.configureAutoUpdates(false);
    const info = updateInfo();
    const updateAvailable = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-available')?.[1];
    updateAvailable?.(info);
    expect(manager.getStatus().state).toBe('update-available');
    info.tag = 'v2.0.1';
    await expect(manager.downloadAvailableUpdate()).resolves.toMatchObject({ success: false });
    expect(manager.getStatus().state).toBe('error');
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
    manager.dispose();
  });
});
