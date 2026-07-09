import type { StoredRepoData } from '../../../global';

export interface ElectronReposAPI {
  getStoredRepos: () => Promise<StoredRepoData>;
  setStoredRepos: (data: StoredRepoData) => Promise<boolean>;
  setRepoPath: (repoPath: string) => Promise<boolean>;
  clearRepoPath: () => Promise<boolean>;
}
