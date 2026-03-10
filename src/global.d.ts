import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from './types/git';

export interface StoredRepoEntryDto {
  path: string;
  lastOpened: number;
  pinned: boolean;
}

export interface StoredRepoData {
  repos: StoredRepoEntryDto[];
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

type GitJobStatus = 'start' | 'progress' | 'done' | 'failed' | 'cancelled';

export interface GitJobEventDto {
  id: string;
  operation: string;
  status: GitJobStatus;
  message?: string;
  progress?: number;
  timestamp: number;
}

export type AiProviderDto = 'ollama' | 'gemini';

export interface AppSettingsDto {
  theme: 'dark' | 'light';
  language: 'de' | 'en';
  autoFetchIntervalMs: number;
  defaultBranch: string;
  confirmDangerousOps: boolean;
  commitTemplate: string;
  showSecondaryHistory: boolean;
  commitSignoffByDefault: boolean;
  aiAutoCommitEnabled: boolean;
  aiProvider: AiProviderDto;
  ollamaBaseUrl: string;
  ollamaModel: string;
  geminiModel: string;
  hasGeminiApiKey: boolean;
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

export interface AiAutoCommitCommitDto {
  hash: string;
  subject: string;
}

export interface AiAutoCommitResultDto {
  commits: AiAutoCommitCommitDto[];
  summary: string;
  turns: number;
}

export interface AiConnectionResultDto {
  ok: true;
  provider: AiProviderDto;
  model: string;
  detail: string;
}

export interface DeviceFlowStartDto {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export type DeviceFlowPollDto =
  | { status: 'pending'; interval: number | null }
  | { status: 'error'; error: string; errorDescription: string | null }
  | { status: 'success'; username: string | null };

export interface ElectronAPI {
  openDirectory: () => Promise<{ path: string; isRepo: boolean } | null>;
  selectDirectory: () => Promise<string | null>;
  setRepoPath: (repoPath: string) => Promise<boolean>;
  runGitCommand: (command: string, ...args: any[]) => Promise<{ success: boolean; data?: any; error?: string }>;
  addIgnoreRule: (pattern: string) => Promise<{ success: boolean; added?: boolean; pattern?: string; error?: string }>;
  gitFetch: () => Promise<{ success: boolean; data?: any; error?: string }>;
  gitPull: () => Promise<{ success: boolean; data?: any; error?: string }>;
  gitPush: () => Promise<{ success: boolean; data?: any; error?: string }>;
  gitClone: (cloneUrl: string, targetDir: string) => Promise<{ success: boolean; repoPath: string; error?: string }>;
  gitInit: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  getFileHistory: (filePath: string, commitHash?: string, limit?: number) => Promise<IpcResult<GitFileHistoryEntryDto[]>>;
  getFileBlame: (filePath: string, commitHash?: string) => Promise<IpcResult<GitFileBlameLineDto[]>>;
  onCloneProgress: (callback: (line: string) => void) => () => void;
  onJobEvent: (callback: (event: GitJobEventDto) => void) => () => void;
  getStoredRepos: () => Promise<StoredRepoData>;
  setStoredRepos: (data: StoredRepoData) => Promise<boolean>;
  getSettings: () => Promise<AppSettingsDto>;
  setSettings: (partial: Partial<AppSettingsDto>) => Promise<AppSettingsDto>;
  setGeminiApiKey: (apiKey: string) => Promise<AppSettingsDto>;
  clearGeminiApiKey: () => Promise<AppSettingsDto>;
  aiTestConnection: () => Promise<IpcResult<AiConnectionResultDto>>;
  aiListModels: () => Promise<IpcResult<string[]>>;
  ollamaTestConnection: () => Promise<IpcResult<AiConnectionResultDto>>;
  ollamaListModels: () => Promise<IpcResult<string[]>>;
  runAiAutoCommit: () => Promise<IpcResult<AiAutoCommitResultDto>>;
  githubAuth: (token: string) => Promise<boolean>;
  githubDeviceStart: () => Promise<IpcResult<DeviceFlowStartDto>>;
  githubDevicePoll: (deviceCode: string) => Promise<IpcResult<DeviceFlowPollDto>>;
  githubGetRepos: () => Promise<IpcResult<GitHubRepositoryDto[]>>;
  githubGetSavedAuthStatus: () => Promise<{ hasSavedToken: boolean; authenticated: boolean; username: string | null; oauthConfigured: boolean }>;
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
