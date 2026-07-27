import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { autoUpdaterMock, getAllWindowsMock, getVersionMock } = vi.hoisted(() => ({
  autoUpdaterMock: {
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
    getVersionMock.mockReturnValue('1.0.0');
    getAllWindowsMock.mockReturnValue([]);
    autoUpdaterMock.checkForUpdates.mockReset();
    autoUpdaterMock.downloadUpdate.mockReset();
    autoUpdaterMock.on.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
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
    setStatus(manager, { state: 'update-available', error: null });

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

    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1);
    const updateAvailable = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-available')?.[1];
    expect(updateAvailable).toBeTypeOf('function');
    updateAvailable?.({ version: '2.0.0', releaseNotes: 'New release' });

    expect(manager.getStatus()).toMatchObject({ state: 'update-available', availableVersion: '2.0.0', releaseNotes: 'New release' });
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
  });

  it('continues to download an advertised version in the background when automatic updates are enabled', async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    autoUpdaterMock.downloadUpdate.mockResolvedValue([]);
    const manager = new UpdaterManager(false);

    manager.configureAutoUpdates(true);
    const updateAvailable = autoUpdaterMock.on.mock.calls.find(([eventName]) => eventName === 'update-available')?.[1];
    updateAvailable?.({ version: '2.0.0', releaseNotes: 'New release' });
    await Promise.resolve();

    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toMatchObject({ state: 'downloading', availableVersion: '2.0.0' });
  });
});
