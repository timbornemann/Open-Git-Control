import { requireElectronGitApi } from './electronApi';
import type { BranchChangeApi } from '@/shared/ipc/branchChange';
import { cachedClient } from '@/data/clientCache';

export const branchChangeClient = cachedClient<BranchChangeApi>('git', {
  inspectBranchChange: (request) => requireElectronGitApi().inspectBranchChange(request),
  executeBranchChange: (request) => requireElectronGitApi().executeBranchChange(request),
  listParkedBranchChanges: (repo) => requireElectronGitApi().listParkedBranchChanges(repo),
  restoreBranchChange: (request) => requireElectronGitApi().restoreBranchChange(request),
  cancelBranchChange: (repo) => requireElectronGitApi().cancelBranchChange(repo),
});
