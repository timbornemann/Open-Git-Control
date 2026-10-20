import type { IpcRenderer } from 'electron';
import type { ElectronUserNotesAPI } from '../../src/shared/ipc/contracts/userNotes';
import { IpcChannel } from '../../src/types/ipcContract';

export function createUserNotesApi(ipc: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>): ElectronUserNotesAPI {
  return {
    getUserNotesStatus: () => ipc.invoke(IpcChannel.UserNotesGetStatus),
    getUserNote: (identity) => ipc.invoke(IpcChannel.UserNotesGetNote, identity),
    checkUserNotes: () => ipc.invoke(IpcChannel.UserNotesCheck),
    acknowledgeUserNotes: (identities) => ipc.invoke(IpcChannel.UserNotesAcknowledge, identities),
    onUserNotesChanged: (callback) => {
      const listener = (_event: unknown, status: Parameters<typeof callback>[0]) => callback(status);
      ipc.on(IpcChannel.UserNotesChanged, listener);
      return () => ipc.removeListener(IpcChannel.UserNotesChanged, listener);
    },
  };
}
