import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from './types/git';

export interface StoredRepoData {
  repos: { path: string; lastOpened: number }[];
  activeRepo: string | null;
}

type IpcSuccessResult<T> = {
  success: true;
  data: T;
};

type IpcErrorResult = {
  success: false;
  error: string;
};

type IpcResult<T> = IpcSuccessResult<T> | IpcErrorResult;

export interface GitHubRepositoryDto {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  cloneUrl: string;
  htmlUrl: string;
}

export interface PullRequestDto {
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
}

export interface ElectronAPI {
  openDirectory: () => Promise<{ path: string; isRepo: boolean } | null>;
  selectDirectory: () => Promise<string | null>;
  setRepoPath: (repoPath: string) => Promise<boolean>;
  runGitCommand: (command: string, ...args: any[]) => Promise<{ success: boolean; data?: any; error?: string }>; 
  gitClone: (cloneUrl: string, targetDir: string) => Promise<{ success: boolean; repoPath: string; error?: string }>;
  gitInit: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>; 
  getFileHistory: (filePath: string, commitHash?: string, limit?: number) => Promise<IpcResult<GitFileHistoryEntryDto[]>>;
  getFileBlame: (filePath: string, commitHash?: string) => Promise<IpcResult<GitFileBlameLineDto[]>>;
  onCloneProgress: (callback: (line: string) => void) => () => void;
  getStoredRepos: () => Promise<StoredRepoData>;
  setStoredRepos: (data: StoredRepoData) => Promise<boolean>;
  githubAuth: (token: string) => Promise<boolean>;
  githubGetRepos: () => Promise<IpcResult<GitHubRepositoryDto[]>>;
  githubGetSavedAuthStatus: () => Promise<{ hasSavedToken: boolean; authenticated: boolean; username: string | null }>;
  githubLoginWithSavedToken: () => Promise<{ success: boolean; authenticated: boolean; username: string | null }>;
  githubCheckAuthStatus: () => Promise<{ authenticated: boolean; username: string | null }>;
  githubLogout: () => Promise<{ success: true } | { success: false; error: string }>;
  githubCreateRepo: (name: string, description: string, isPrivate: boolean) => Promise<IpcResult<GitHubRepositoryDto>>;
  githubGetPRs: (owner: string, repo: string, state: string) => Promise<IpcResult<PullRequestDto[]>>;
  githubCreatePR: (params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }) => Promise<
    IpcResult<{
      number: number;
      title: string;
      htmlUrl: string;
      state: string;
    }>
  >;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
