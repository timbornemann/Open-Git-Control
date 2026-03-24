import { ipcMain } from 'electron';
import { UpdaterManager } from '../updaterManager';

type RegisterUpdaterHandlersDeps = {
  updaterManager: UpdaterManager;
};

export function registerUpdaterHandlers({ updaterManager }: RegisterUpdaterHandlersDeps): void {
  ipcMain.handle('updater:getStatus', async () => {
    return updaterManager.getStatus();
  });

  ipcMain.handle('updater:check', async () => {
    return updaterManager.checkForAppUpdates();
  });

  ipcMain.handle('updater:runOneClick', async () => {
    return updaterManager.runOneClickUpdate();
  });

  ipcMain.handle('updater:download', async () => {
    return updaterManager.downloadAvailableUpdate();
  });

  ipcMain.handle('updater:install', async () => {
    return updaterManager.installDownloadedUpdate();
  });
}
