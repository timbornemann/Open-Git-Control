import type { StoredRepoData } from '../../../types/appDtos';

export interface ElectronReposAPI {
  getStoredRepos: () => Promise<StoredRepoData>;
  setStoredRepos: (data: StoredRepoData) => Promise<boolean>;
  setRepoPath: (repoPath: string) => Promise<boolean>;
  clearRepoPath: () => Promise<boolean>;
}
