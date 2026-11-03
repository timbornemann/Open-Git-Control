import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { requireElectronGitApi } from './electronApi';

export const workingTreeReads = {
  async getWorkingTreeStatus(...args: Parameters<ElectronAPI['getWorkingTreeStatus']>): ReturnType<ElectronAPI['getWorkingTreeStatus']> {
    return requireElectronGitApi().getWorkingTreeStatus(...args);
  },
  async getWorkingTreeSnapshot(...args: Parameters<ElectronAPI['getWorkingTreeSnapshot']>): ReturnType<ElectronAPI['getWorkingTreeSnapshot']> {
    return requireElectronGitApi().getWorkingTreeSnapshot(...args);
  },
  async getWorkingTreeStats(...args: Parameters<ElectronAPI['getWorkingTreeStats']>): ReturnType<ElectronAPI['getWorkingTreeStats']> {
    return requireElectronGitApi().getWorkingTreeStats(...args);
  },
  // The activity coordinator owns scheduling and caching for inactive repos.
  async getRepositoryChangeSummary(...args: Parameters<ElectronAPI['getRepositoryChangeSummary']>): ReturnType<ElectronAPI['getRepositoryChangeSummary']> {
    return requireElectronGitApi().getRepositoryChangeSummary(...args);
  },
};
