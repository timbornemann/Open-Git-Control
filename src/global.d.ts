export interface ElectronAPI {
  openDirectory: () => Promise<{path: string, isRepo: boolean} | null>;
  runGitCommand: (commandName: string, ...args: any[]) => Promise<{success: boolean, data?: any, error?: string}>;
  githubAuth: (token: string) => Promise<boolean>;
  githubGetRepos: () => Promise<{success: boolean, data?: any, error?: string}>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
