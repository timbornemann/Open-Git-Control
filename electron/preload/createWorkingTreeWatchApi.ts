import type { IpcRenderer, IpcRendererEvent } from 'electron';
import type { WorkingTreeWatchApi, WorkingTreeChange } from '../../src/shared/ipc/workingTreeWatch';
import { IpcChannel } from '../../src/types/ipcContract';

export const createWorkingTreeWatchApi = (ipc: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>): WorkingTreeWatchApi => ({
  watchWorkingTree: (request) => ipc.invoke(IpcChannel.GitWorkingTreeWatch, request),
  onWorkingTreeChanged: (callback) => {
    const handler = (_event: IpcRendererEvent, change: WorkingTreeChange) => callback(change);
    ipc.on(IpcChannel.GitWorkingTreeChanged, handler);
    return () => ipc.removeListener(IpcChannel.GitWorkingTreeChanged, handler);
  },
});
