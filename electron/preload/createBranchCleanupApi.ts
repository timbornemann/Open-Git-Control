import type { IpcRenderer } from 'electron';
import type { BranchCleanupApi } from '../../src/shared/ipc/branchCleanup';
import { IpcChannel } from '../../src/types/ipcContract';

export function createBranchCleanupApi(ipc: Pick<IpcRenderer, 'invoke'>): BranchCleanupApi {
  return {
    inspectBranchCleanup: (request) => ipc.invoke(IpcChannel.GitInspectBranchCleanup, request),
    executeBranchCleanup: (request) => ipc.invoke(IpcChannel.GitExecuteBranchCleanup, request),
    cancelBranchCleanup: (id) => ipc.invoke(IpcChannel.GitCancelBranchCleanup, id),
    getBranchCleanupPreferences: (repo) => ipc.invoke(IpcChannel.GitBranchCleanupPreferencesGet, repo),
    saveBranchCleanupPreferences: (repo, preferences) => ipc.invoke(IpcChannel.GitBranchCleanupPreferencesSave, repo, preferences),
  };
}
