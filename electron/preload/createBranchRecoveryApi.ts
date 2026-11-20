import type { IpcRenderer } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import type { ElectronBranchRecoveryAPI } from '../../src/shared/ipc/branchRecovery';

export function createBranchRecoveryApi(ipc: Pick<IpcRenderer, 'invoke'>): ElectronBranchRecoveryAPI {
  return {
    getRepositoryHead: (repoPath) => ipc.invoke(IpcChannel.GitRepositoryHead, repoPath),
    inspectBranchRecovery: (repoPath) => ipc.invoke(IpcChannel.GitInspectBranchRecovery, repoPath),
    repairBranch: (request) => ipc.invoke(IpcChannel.GitRepairBranch, request),
  };
}
