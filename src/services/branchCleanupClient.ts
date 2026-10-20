import type { BranchCleanupApi } from '@/shared/ipc/branchCleanup';
import { requireElectronGitApi } from './electronApi';

export const branchCleanupClient: BranchCleanupApi = {
  inspectBranchCleanup: (request) => requireElectronGitApi().inspectBranchCleanup(request),
  executeBranchCleanup: (request) => requireElectronGitApi().executeBranchCleanup(request),
  cancelBranchCleanup: (id) => requireElectronGitApi().cancelBranchCleanup(id),
  getBranchCleanupPreferences: (repo) => requireElectronGitApi().getBranchCleanupPreferences(repo),
  saveBranchCleanupPreferences: (repo, preferences) => requireElectronGitApi().saveBranchCleanupPreferences(repo, preferences),
};
