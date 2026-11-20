import type { RepairBranchRequest } from '@/shared/ipc/branchRecovery';
import { invalidateResources } from '@/data/clientCache';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { getElectronApi, requireElectronAppApi, requireElectronGitApi } from './electronApi';

export const branchRecoveryClient = {
  isAvailable: () => typeof getElectronApi()?.git?.inspectBranchRecovery === 'function',
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
  isAvailable: () => typeof getElectronApi()?.app?.getBranchBackupOverview === 'function',
  overview: () => requireElectronAppApi().getBranchBackupOverview(),
  chooseDirectory: () => requireElectronAppApi().chooseBranchBackupDirectory(),
  enable: (enabled: boolean) => requireElectronAppApi().setBranchBackupEnabled(enabled),
};
