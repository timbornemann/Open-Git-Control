import { IpcChannel } from '../../src/types/ipcContract';
import type { UntrackFilesApi } from '../../src/shared/ipc/untrackFiles';

export const createUntrackFilesApi = (ipc: { invoke(channel: string, ...args: unknown[]): Promise<any> }): UntrackFilesApi => ({
  inspectUntrackFiles: (request) => ipc.invoke(IpcChannel.GitInspectUntrackFiles, request),
  executeUntrackFiles: (request) => ipc.invoke(IpcChannel.GitExecuteUntrackFiles, request),
  cancelUntrackFiles: (id) => ipc.invoke(IpcChannel.GitCancelUntrackFiles, id),
});
