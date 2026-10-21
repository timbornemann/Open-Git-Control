import { requireElectronGitApi } from './electronApi';
import type { BranchChangeApi } from '@/shared/ipc/branchChange';

export const branchChangeClient: BranchChangeApi = {
  inspectBranchChange: (request) => requireElectronGitApi().inspectBranchChange(request),
  executeBranchChange: (request) => requireElectronGitApi().executeBranchChange(request),
  listParkedBranchChanges: (repo) => requireElectronGitApi().listParkedBranchChanges(repo),
  restoreBranchChange: (request) => requireElectronGitApi().restoreBranchChange(request),
  cancelBranchChange: (repo) => requireElectronGitApi().cancelBranchChange(repo),
};
