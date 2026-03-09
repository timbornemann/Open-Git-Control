export interface StoredRepoData {
  repos: { path: string; lastOpened: number }[];
  activeRepo: string | null;
}

export interface ElectronAPI {
  openDirectory: () => Promise<{ path: string; isRepo: boolean } | null>;
  selectDirectory: () => Promise<string | null>;
  setRepoPath: (repoPath: string) => Promise<boolean>;
  runGitCommand: (command: string, ...args: any[]) => Promise<{ success: boolean; data?: any; error?: any }>;
  gitClone: (cloneUrl: string, targetDir: string) => Promise<{ success: boolean; repoPath: string; error?: string }>;
  gitInit: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  onCloneProgress: (callback: (line: string) => void) => () => void;
  getStoredRepos: () => Promise<StoredRepoData>;
  setStoredRepos: (data: StoredRepoData) => Promise<boolean>;
  githubAuth: (token: string) => Promise<boolean>;
  githubGetRepos: () => Promise<{ success: boolean; data?: any[]; error?: any }>;
  githubCheckAuthStatus: () => Promise<{ authenticated: boolean; username: string | null }>;
  githubLogout: () => Promise<{ success: boolean; error?: any }>;
  githubCreateRepo: (
    name: string,
    description: string,
    isPrivate: boolean
  ) => Promise<{
    success: boolean;
    data?: {
      id: number;
      name: string;
      fullName: string;
      private: boolean;
      cloneUrl: string;
      sshUrl: string;
      htmlUrl: string;
    };
    error?: any;
  }>;
  githubGetPRs: (
    owner: string,
    repo: string,
    state: string
  ) => Promise<{
    success: boolean;
    data?: {
      number: number;
      title: string;
      state: string;
      user: string;
      createdAt: string;
      updatedAt: string;
      head: string;
      base: string;
      merged: boolean;
      htmlUrl: string;
      draft: boolean;
    }[];
    error?: any;
  }>;
  githubCreatePR: (params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }) => Promise<{
    success: boolean;
    data?: {
      number: number;
      title: string;
      htmlUrl: string;
      state: string;
    };
    error?: any;
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
