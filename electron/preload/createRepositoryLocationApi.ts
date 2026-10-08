import type { IpcRenderer } from 'electron';
import type { ElectronReposAPI } from '../../src/shared/ipc/contracts/repos';
import { IpcChannel } from '../../src/types/ipcContract';

export const createRepositoryLocationApi = (ipc: Pick<IpcRenderer, 'invoke'>): Pick<ElectronReposAPI, 'recheckRepository' | 'selectRepositoryLocation'> => ({
  recheckRepository: (request) => ipc.invoke(IpcChannel.ReposRecheck, request),
  selectRepositoryLocation: (request) => ipc.invoke(IpcChannel.ReposSelectLocation, request),
});
