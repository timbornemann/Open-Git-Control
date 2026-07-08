import { ipcMain } from 'electron';
import type { UpdaterManager } from '../updaterManager';
import { IpcChannel } from '../../../src/types/ipcContract';

type RegisterUpdaterHandlersDeps = {
  updaterManager: UpdaterManager;
};

export function registerUpdaterHandlers({ updaterManager }: RegisterUpdaterHandlersDeps): void {
  ipcMain.handle(IpcChannel.UpdaterGetStatus, async () => {
    return updaterManager.getStatus();
  });

  ipcMain.handle(IpcChannel.UpdaterCheck, async () => {
    return updaterManager.checkForAppUpdates();
  });

  ipcMain.handle(IpcChannel.UpdaterRunOneClick, async () => {
    return updaterManager.runOneClickUpdate();
  });

  ipcMain.handle(IpcChannel.UpdaterDownload, async () => {
    return updaterManager.downloadAvailableUpdate();
  });

  ipcMain.handle(IpcChannel.UpdaterInstall, async () => {
    return updaterManager.installDownloadedUpdate();
  });
}
