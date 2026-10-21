import { IpcChannel } from '../../src/types/ipcContract';
import type { BranchChangeApi } from '../../src/shared/ipc/branchChange';

export const createBranchChangeApi = (ipc: { invoke(channel: string, ...args: unknown[]): Promise<any> }): BranchChangeApi => ({
  inspectBranchChange: (request) => ipc.invoke(IpcChannel.GitInspectBranchChange, request),
  executeBranchChange: (request) => ipc.invoke(IpcChannel.GitExecuteBranchChange, request),
  listParkedBranchChanges: (repo) => ipc.invoke(IpcChannel.GitListParkedBranchChanges, repo),
  restoreBranchChange: (request) => ipc.invoke(IpcChannel.GitRestoreBranchChange, request),
  cancelBranchChange: (repo) => ipc.invoke(IpcChannel.GitCancelBranchChange, repo),
});
