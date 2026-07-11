import type { StoredRepoData } from '../../../types/appDtos';

export interface ElectronReposAPI {
  getStoredRepos: () => Promise<StoredRepoData>;
  setStoredRepos: (data: StoredRepoData) => Promise<boolean>;
  resolveRepoPath: (repoPath: string) => Promise<string>;
  setRepoPath: (repoPath: string) => Promise<string>;
  clearRepoPath: () => Promise<boolean>;
}
