import type { IpcRenderer } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import type { ElectronStorageAPI, StorageOverview } from '../../src/shared/ipc/storageMaintenance';

export function createStorageApi(ipc: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>): ElectronStorageAPI {
  return {
    getRepositoryUiPreferences: (legacy) => ipc.invoke(IpcChannel.RepositoryUiGet, legacy),
    updateRepositoryUiPreferences: (request) => ipc.invoke(IpcChannel.RepositoryUiUpdate, request),
    inspectStorage: () => ipc.invoke(IpcChannel.StorageInspect),
    runStorageMaintenance: (request) => ipc.invoke(IpcChannel.StorageRun, request),
    restoreRemovedRepository: (repoPath) => ipc.invoke(IpcChannel.StorageRestore, repoPath),
    getCompletedRecoveryBackups: () => ipc.invoke(IpcChannel.StorageRecoveryList),
    removeCompletedRecoveryBackups: (request) => ipc.invoke(IpcChannel.StorageRecoveryRemove, request),
    onStorageMaintenance: (callback) => {
      const handler = (_event: unknown, value: StorageOverview) => callback(value);
      ipc.on(IpcChannel.StorageEvent, handler);
      return () => ipc.removeListener(IpcChannel.StorageEvent, handler);
    },
  };
}
