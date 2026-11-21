import type { BranchBackupRemoval, BranchBackupSelection, RepairBranchRequest } from '@/shared/ipc/branchRecovery';
import { invalidateResources } from '@/data/clientCache';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { getElectronApi, requireElectronAppApi, requireElectronGitApi } from './electronApi';

// The tutorial bridge also returns callable failure stubs for unimplemented methods.
function hasDeclaredMethod<T extends object>(api: T | undefined, method: keyof T): boolean {
  return Boolean(api && Object.prototype.hasOwnProperty.call(api, method) && typeof api[method] === 'function');
}

export const branchRecoveryClient = {
  isAvailable: () => hasDeclaredMethod(getElectronApi()?.git, 'inspectBranchRecovery'),
  inspect: (repoPath: string) => requireElectronGitApi().inspectBranchRecovery(repoPath),
  repair: async (request: RepairBranchRequest) => {
    const result = await requireElectronGitApi().repairBranch(request);
    if (result.success && result.data) {
      invalidateResources('git', normalizeRepoPathKey(request.repoPath));
    }
    return result;
  },
};

export const branchBackupClient = {
  isAvailable: () => hasDeclaredMethod(getElectronApi()?.app, 'getBranchBackupOverview'),
  overview: () => requireElectronAppApi().getBranchBackupOverview(),
  chooseDirectory: () => requireElectronAppApi().chooseBranchBackupDirectory(),
  resetDirectory: () => requireElectronAppApi().resetBranchBackupDirectory(),
  enable: (enabled: boolean) => requireElectronAppApi().setBranchBackupEnabled(enabled),
  select: (selection: BranchBackupSelection) => requireElectronAppApi().setBranchBackupSelection(selection),
  backupNow: (repoPath: string) => requireElectronAppApi().backupBranchesNow(repoPath),
  remove: (selection: BranchBackupRemoval) => requireElectronAppApi().removeBranchBackups(selection),
};
