import { CommitFileDetail } from './utils/gitParsing';

export interface ElectronAPI {
  openDirectory: () => Promise<{ path: string, isRepo: boolean } | null>;
  selectDirectory: () => Promise<string | null>;
  runGitCommand: (command: string, ...args: any[]) => Promise<{ success: boolean, data?: any, error?: any }>;
  gitClone: (cloneUrl: string, targetDir: string) => Promise<{ success: boolean; repoPath: string; error?: string }>;
  onCloneProgress: (callback: (line: string) => void) => () => void;
  githubAuth: (token: string) => Promise<boolean>;
  githubGetRepos: () => Promise<{ success: boolean, data?: any[], error?: any }>;
  githubCheckAuthStatus: () => Promise<{ authenticated: boolean; username: string | null }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
