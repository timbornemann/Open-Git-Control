import type { IpcRenderer } from 'electron';
import type { ElectronAppAPI } from '../../src/shared/ipc/contracts/app';
import { IpcChannel } from '../../src/types/ipcContract';

export function createUpdaterApi(
  ipc: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>,
): Pick<
  ElectronAppAPI,
  'getUpdaterStatus' | 'checkForAppUpdates' | 'runOneClickAppUpdate' | 'downloadAppUpdate' | 'installAppUpdate' | 'onUpdaterEvent' | 'openRecoveryUpdater'
> {
  return {
    getUpdaterStatus: () => ipc.invoke(IpcChannel.UpdaterGetStatus),
    checkForAppUpdates: () => ipc.invoke(IpcChannel.UpdaterCheck),
    runOneClickAppUpdate: () => ipc.invoke(IpcChannel.UpdaterRunOneClick),
    downloadAppUpdate: () => ipc.invoke(IpcChannel.UpdaterDownload),
    installAppUpdate: () => ipc.invoke(IpcChannel.UpdaterInstall),
    openRecoveryUpdater: () => ipc.invoke(IpcChannel.UpdaterOpenRecovery),
    onUpdaterEvent: (callback) => {
      const handler = (_event: unknown, payload: Parameters<typeof callback>[0]) => callback(payload);
      ipc.on(IpcChannel.UpdaterEvent, handler);
      return () => ipc.removeListener(IpcChannel.UpdaterEvent, handler);
    },
  };
}
