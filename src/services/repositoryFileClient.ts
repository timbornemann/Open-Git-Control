import type { ElectronGitAPI } from '@/shared/ipc/contracts/git';
import { requireElectronGitApi } from './electronApi';

export const repositoryFileClient = {
  async getGitLfsStatus(...args: Parameters<ElectronGitAPI['getGitLfsStatus']>): ReturnType<ElectronGitAPI['getGitLfsStatus']> {
    return requireElectronGitApi().getGitLfsStatus(...args);
  },
  async trackWithGitLfs(...args: Parameters<ElectronGitAPI['trackWithGitLfs']>): ReturnType<ElectronGitAPI['trackWithGitLfs']> {
    return requireElectronGitApi().trackWithGitLfs(...args);
  },
  async getRepositoryFilePreview(...args: Parameters<ElectronGitAPI['getRepositoryFilePreview']>): ReturnType<ElectronGitAPI['getRepositoryFilePreview']> {
    return requireElectronGitApi().getRepositoryFilePreview(...args);
  },
  async getRepositoryFileInfo(...args: Parameters<ElectronGitAPI['getRepositoryFileInfo']>): ReturnType<ElectronGitAPI['getRepositoryFileInfo']> {
    return requireElectronGitApi().getRepositoryFileInfo(...args);
  },
  async saveRepositoryFile(...args: Parameters<ElectronGitAPI['saveRepositoryFile']>): ReturnType<ElectronGitAPI['saveRepositoryFile']> {
    return requireElectronGitApi().saveRepositoryFile(...args);
  },
};
