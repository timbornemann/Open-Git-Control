import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import { CancellationToken } from 'builder-util-runtime';
import { IpcChannel } from '../../src/types/ipcContract';

export type UpdaterState = 'idle' | 'checking' | 'update-available' | 'no-update' | 'downloading' | 'downloaded' | 'error';

export type UpdaterStatusPayload = {
  isSupported: boolean;
  state: UpdaterState;
  currentVersion: string;
  availableVersion: string | null;
  downloaded: boolean;
  downloadPercent: number | null;
  bytesPerSecond: number | null;
  transferred: number | null;
  total: number | null;
  lastCheckedAt: number | null;
  releaseNotes: string | null;
  error: string | null;
};

const AUTO_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const UPDATER_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const UPDATER_STATE_WAIT_TIMEOUT_MS = 5 * 1000;
const UPDATER_STATE_POLL_INTERVAL_MS = 150;

function formatUpdaterError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Unbekannter Update-Fehler.';
}

function normalizeReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string | null {
  if (!releaseNotes) return null;
  if (typeof releaseNotes === 'string') {
    const trimmed = releaseNotes.trim();
    return trimmed || null;
  }

  const normalized = releaseNotes
    .map((item) => {
      if (item && typeof item.note === 'string') return item.note.trim();
      return '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return normalized || null;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // Timeout reporting must still settle if updater cancellation throws.
      } finally {
        reject(new Error(timeoutMessage));
      }
    }, timeoutMs);

    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    operation
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export class UpdaterManager {
  private autoUpdateInterval: NodeJS.Timeout | null = null;

  private automaticDownloadsEnabled = true;

  private updaterStatus: UpdaterStatusPayload;

  private activeDownloadCancellationToken: CancellationToken | null = null;

  constructor(private readonly isDev: boolean) {
    this.updaterStatus = {
      isSupported: !isDev,
      state: 'idle',
      currentVersion: app.getVersion(),
      availableVersion: null,
      downloaded: false,
      downloadPercent: null,
      bytesPerSecond: null,
      transferred: null,
      total: null,
      lastCheckedAt: null,
      releaseNotes: null,
      error: null,
    };
  }

  getStatus(): UpdaterStatusPayload {
    return {
      ...this.updaterStatus,
      currentVersion: app.getVersion(),
    };
  }

  private emitUpdaterEvent(): void {
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      browserWindow.webContents.send(IpcChannel.UpdaterEvent, this.updaterStatus);
    }
  }

  private setUpdaterStatus(patch: Partial<UpdaterStatusPayload>): void {
    this.updaterStatus = {
      ...this.updaterStatus,
      ...patch,
    };
    this.emitUpdaterEvent();
  }

  private clearAutoUpdateInterval(): void {
    if (this.autoUpdateInterval) {
      clearInterval(this.autoUpdateInterval);
      this.autoUpdateInterval = null;
    }
  }

  private ensureUpdateCheckInterval(): void {
    if (this.autoUpdateInterval) return;
    this.autoUpdateInterval = setInterval(() => {
      void this.checkForAppUpdates();
    }, AUTO_UPDATE_CHECK_INTERVAL_MS);
    this.autoUpdateInterval.unref();
  }

  private maybeDownloadAvailableUpdate(): void {
    if (!this.automaticDownloadsEnabled || !this.updaterStatus.isSupported) return;
    if (this.updaterStatus.state !== 'update-available') return;

    void this.downloadAvailableUpdate();
  }

  private waitForUpdaterState(targetStates: UpdaterState[], timeoutMs: number): Promise<UpdaterStatusPayload> {
    if (targetStates.includes(this.updaterStatus.state)) {
      return Promise.resolve(this.updaterStatus);
    }

    return new Promise((resolve, reject) => {
      let interval: NodeJS.Timeout | null = null;

      const timeout = setTimeout(() => {
        if (interval) {
          clearInterval(interval);
        }
        reject(new Error(`Updater status timeout while waiting for: ${targetStates.join(', ')}`));
      }, timeoutMs);

      interval = setInterval(() => {
        if (targetStates.includes(this.updaterStatus.state)) {
          clearTimeout(timeout);
          if (interval) {
            clearInterval(interval);
          }
          resolve(this.updaterStatus);
        }
      }, UPDATER_STATE_POLL_INTERVAL_MS);

      if (typeof timeout.unref === 'function') {
        timeout.unref();
      }
      if (interval && typeof interval.unref === 'function') {
        interval.unref();
      }
    });
  }

  private async waitForOneClickDownload(): Promise<{ success: boolean; action?: 'downloaded'; error?: string }> {
    let stateAfterDownload: UpdaterStatusPayload;
    try {
      stateAfterDownload = await this.waitForUpdaterState(['downloaded', 'error'], UPDATER_DOWNLOAD_TIMEOUT_MS);
    } catch (error: unknown) {
      // This caller may only be observing a download that was started by an
      // automatic update check. Do not overwrite its still-valid progress
      // state just because the caller stopped waiting.
      return { success: false, error: formatUpdaterError(error) };
    }

    if (stateAfterDownload.state === 'downloaded') {
      return { success: true, action: 'downloaded' };
    }

    return { success: false, error: stateAfterDownload.error || 'Update konnte nicht heruntergeladen werden.' };
  }

  async checkForAppUpdates(): Promise<{ success: boolean; error?: string }> {
    if (!this.updaterStatus.isSupported) {
      return { success: false, error: 'Auto-Updates sind nur in der installierten App verfuegbar.' };
    }

    if (this.updaterStatus.state === 'checking' || this.updaterStatus.state === 'downloading' || this.updaterStatus.state === 'downloaded') {
      return { success: true };
    }

    this.setUpdaterStatus({
      state: 'checking',
      currentVersion: app.getVersion(),
      lastCheckedAt: Date.now(),
      error: null,
      downloadPercent: null,
      bytesPerSecond: null,
      transferred: null,
      total: null,
      downloaded: false,
    });

    try {
      // electron-updater does not expose a cancellation token for the network
      // request performed by checkForUpdates(). Await the real operation
      // instead of reporting a timeout while it continues in the background.
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (error: unknown) {
      const message = formatUpdaterError(error);
      this.setUpdaterStatus({
        state: 'error',
        error: message,
        lastCheckedAt: Date.now(),
      });
      return { success: false, error: message };
    }
  }

  async downloadAvailableUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!this.updaterStatus.isSupported) {
      return { success: false, error: 'Auto-Updates sind nur in der installierten App verfuegbar.' };
    }

    if (this.updaterStatus.state === 'downloaded' || this.updaterStatus.state === 'downloading') {
      return { success: true };
    }

    if (this.updaterStatus.state !== 'update-available') {
      return { success: false, error: 'Es ist kein herunterladbares Update verfuegbar.' };
    }

    this.setUpdaterStatus({
      state: 'downloading',
      downloadPercent: 0,
      bytesPerSecond: null,
      transferred: null,
      total: null,
      error: null,
    });

    const cancellationToken = new CancellationToken();
    this.activeDownloadCancellationToken?.cancel();
    this.activeDownloadCancellationToken?.dispose();
    this.activeDownloadCancellationToken = cancellationToken;
    try {
      await withTimeout(
        autoUpdater.downloadUpdate(cancellationToken),
        UPDATER_DOWNLOAD_TIMEOUT_MS,
        'Der Update-Download hat das Zeitlimit ueberschritten und wurde abgebrochen.',
        () => cancellationToken.cancel(),
      );
      return { success: true };
    } catch (error: unknown) {
      const message = formatUpdaterError(error);
      this.setUpdaterStatus({
        state: 'error',
        error: message,
      });
      return { success: false, error: message };
    } finally {
      if (this.activeDownloadCancellationToken === cancellationToken) {
        this.activeDownloadCancellationToken = null;
      }
      cancellationToken.dispose();
    }
  }

  installDownloadedUpdate(): { success: boolean; error?: string } {
    if (!this.updaterStatus.isSupported) {
      return { success: false, error: 'Auto-Updates sind nur in der installierten App verfuegbar.' };
    }

    if (this.updaterStatus.state !== 'downloaded') {
      return { success: false, error: 'Es wurde noch kein Update heruntergeladen.' };
    }

    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });

    return { success: true };
  }

  async runOneClickUpdate(): Promise<{ success: boolean; action?: 'no-update' | 'downloaded'; error?: string }> {
    if (!this.updaterStatus.isSupported) {
      return { success: false, error: 'Auto-Updates sind nur in der installierten App verfuegbar.' };
    }

    if (this.updaterStatus.state === 'downloaded') {
      return { success: true, action: 'downloaded' };
    }

    if (this.updaterStatus.state === 'downloading') {
      return this.waitForOneClickDownload();
    }

    let stateAfterCheck: UpdaterStatusPayload;

    if (this.updaterStatus.state === 'update-available') {
      stateAfterCheck = this.updaterStatus;
    } else {
      const checkResult = await this.checkForAppUpdates();
      if (!checkResult.success) {
        return checkResult;
      }

      try {
        stateAfterCheck = await this.waitForUpdaterState(
          ['no-update', 'update-available', 'downloading', 'downloaded', 'error'],
          UPDATER_STATE_WAIT_TIMEOUT_MS,
        );
      } catch (error: unknown) {
        // electron-updater can complete its check promise before DNS/network
        // work emits the terminal state. The short UI wait is not a failed
        // update check, so keep the live `checking` status and let its event
        // settle it instead of recording a false permanent error.
        if (this.updaterStatus.state === 'checking') return { success: true };
        const message = formatUpdaterError(error);
        this.setUpdaterStatus({
          state: 'error',
          error: message,
          lastCheckedAt: Date.now(),
        });
        return { success: false, error: message };
      }
    }

    if (stateAfterCheck.state === 'no-update') {
      return { success: true, action: 'no-update' };
    }

    if (stateAfterCheck.state === 'downloaded') {
      return { success: true, action: 'downloaded' };
    }

    if (stateAfterCheck.state === 'downloading') {
      return this.waitForOneClickDownload();
    }

    if (stateAfterCheck.state === 'error') {
      return { success: false, error: stateAfterCheck.error || 'Update-Pruefung fehlgeschlagen.' };
    }

    const downloadResult = await this.downloadAvailableUpdate();
    if (!downloadResult.success) {
      return downloadResult;
    }

    return this.waitForOneClickDownload();
  }

  setAutoUpdatesEnabled(enabled: boolean): void {
    this.automaticDownloadsEnabled = enabled;

    if (!this.updaterStatus.isSupported) {
      return;
    }

    // Availability checks remain active even when automatic downloads are
    // disabled, so the renderer can still advertise a new version. The user
    // setting controls only background download and automatic promotion.
    this.ensureUpdateCheckInterval();

    if (enabled && this.updaterStatus.state === 'update-available') {
      this.maybeDownloadAvailableUpdate();
      return;
    }

    if (this.updaterStatus.state === 'idle' || this.updaterStatus.state === 'no-update' || this.updaterStatus.state === 'error') {
      void this.checkForAppUpdates();
    }
  }

  configureAutoUpdates(autoUpdatesEnabled = true): void {
    this.automaticDownloadsEnabled = autoUpdatesEnabled;

    if (this.isDev) {
      this.setUpdaterStatus({
        isSupported: false,
        currentVersion: app.getVersion(),
        state: 'idle',
        error: null,
      });
      return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      this.setUpdaterStatus({
        state: 'checking',
        currentVersion: app.getVersion(),
        lastCheckedAt: Date.now(),
        error: null,
        downloadPercent: null,
        bytesPerSecond: null,
        transferred: null,
        total: null,
        downloaded: false,
      });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.setUpdaterStatus({
        state: 'update-available',
        availableVersion: info.version || null,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        error: null,
        downloaded: false,
      });
      this.maybeDownloadAvailableUpdate();
    });

    autoUpdater.on('update-not-available', () => {
      this.setUpdaterStatus({
        state: 'no-update',
        availableVersion: null,
        releaseNotes: null,
        downloaded: false,
        downloadPercent: null,
        bytesPerSecond: null,
        transferred: null,
        total: null,
        error: null,
        lastCheckedAt: Date.now(),
      });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.setUpdaterStatus({
        state: 'downloading',
        downloadPercent: Number.isFinite(progress.percent) ? progress.percent : 0,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
        error: null,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.setUpdaterStatus({
        state: 'downloaded',
        availableVersion: info.version || this.updaterStatus.availableVersion,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes) || this.updaterStatus.releaseNotes,
        downloaded: true,
        downloadPercent: 100,
        error: null,
      });
    });

    autoUpdater.on('error', (error: Error) => {
      this.setUpdaterStatus({
        state: 'error',
        error: formatUpdaterError(error),
        lastCheckedAt: Date.now(),
      });
    });

    this.setAutoUpdatesEnabled(autoUpdatesEnabled);
  }

  dispose(): void {
    this.clearAutoUpdateInterval();
    this.activeDownloadCancellationToken?.cancel();
    this.activeDownloadCancellationToken?.dispose();
    this.activeDownloadCancellationToken = null;
  }
}
