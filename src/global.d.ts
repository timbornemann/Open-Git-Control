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
  description?: string | null;
  updatedAt?: string;
}

export interface GitHubRepositoryPageDto {
  repos: GitHubRepositoryDto[];
  nextPage: number | null;
  hasMore: boolean;
  totalCount: number | null;
}

type GitJobStatus = 'start' | 'progress' | 'done' | 'failed' | 'cancelled';
type GitJobPhaseDto = 'snapshot' | 'grouping' | 'committing' | 'retry' | 'fallback' | 'done' | 'failed' | 'cancelled';

export type AiAutoCommitModeDto = 'normal' | 'retry' | 'fallback';

export interface GitJobEventDto {
  id: string;
  operation: string;
  status: GitJobStatus;
  message?: string;
  progress?: number;
  details?: {
    phase?: GitJobPhaseDto;
    mode?: AiAutoCommitModeDto | string;
    groupId?: number;
    groupSize?: number;
    remainingFiles?: number;
    processedFiles?: number;
    totalCommits?: number;
    lastCommit?: string | null;
    retryCount?: number;
    [key: string]: unknown;
  };
  timestamp: number;
}

export type UpdaterStateDto =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'no-update'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdaterStatusDto {
  isSupported: boolean;
  state: UpdaterStateDto;
  currentVersion: string;
  availableVersion: string | null;
  downloaded: boolean;
  downloadPercent: number | null;
  bytesPerSecond: number | null;
  transferred: number | null;
  total: number | null;
  lastCheckedAt: number | null;
  releaseNotes: string | null;
  error: string | null;
}

export interface UpdaterOneClickResultDto {
  success: boolean;
  action?: 'no-update' | 'downloaded';
  error?: string;
}

export type AiProviderDto = 'ollama' | 'gemini';
export type AppThemeDto = 'copper-night' | 'midnight-teal' | 'graphite-blue' | 'forest-copper' | 'porcelain-light' | 'ember-slate' | 'arctic-mint';
export type SecretScanStrictnessDto = 'low' | 'medium' | 'high';
export type SecretScanSourceDto = 'staged' | 'to-push';

export interface AppSettingsDto {
  theme: AppThemeDto;
  language: 'de' | 'en';
  autoFetchIntervalMs: number;
  defaultBranch: string;
  confirmDangerousOps: boolean;
  commitTemplate: string;
  showSecondaryHistory: boolean;
  commitSignoffByDefault: boolean;
  secretScanBeforePushEnabled: boolean;
  secretScanStrictness: SecretScanStrictnessDto;
  secretScanAllowlist: string;
  aiAutoCommitEnabled: boolean;
  aiProvider: AiProviderDto;
  ollamaBaseUrl: string;
  ollamaModel: string;
  geminiModel: string;
  hasGeminiApiKey: boolean;
  githubOauthClientId: string;
  githubHost: string;
}



export interface GitHubCreateReleaseParamsDto {
  owner: string;
  repo: string;
  tagName: string;
  targetCommitish?: string;
  releaseName: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface GitHubReleaseDto {
  id: number;
  tagName: string;
  name: string;
  htmlUrl: string;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
}

export interface ReleaseCommitDto {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

export interface GitHubReleaseContextDto {
  existingTags: string[];
  lastReleaseTag: string | null;
  commitsSinceLastRelease: ReleaseCommitDto[];
  commitsTarget: string;
  fallbackUsed: boolean;
}

export interface PullRequestDto {
  number: number;
  title: string;
  state: string;
  user: string;
  createdAt: string;
  updatedAt: string;
  head: string;
  headSha: string;
  base: string;
  merged: boolean;
  htmlUrl: string;
  draft: boolean;
}


export type CiBadgeStateDto = 'success' | 'failure' | 'pending' | 'neutral' | 'unknown';

export interface GithubWorkflowRunDto {
  id: number;
  name: string;
  workflowName: string;
  status: string;
  conclusion: string | null;
  event: string;
  htmlUrl: string;
  branch: string;
  headSha: string;
  createdAt: string;
  startedAt: string;
  updatedAt: string;
}

export interface GithubCheckRunDto {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
  appName: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GithubStatusContextDto {
  id: number;
  context: string;
  state: string;
  description: string | null;
  targetUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface GithubStatusChecksDto {
  state: string;
  sha: string;
  checkRuns: GithubCheckRunDto[];
  statusContexts: GithubStatusContextDto[];
}

export interface PullRequestCiDto {
  badge: CiBadgeStateDto;
  summary: string;
  workflowRuns: GithubWorkflowRunDto[];
  statusChecks: GithubStatusChecksDto | null;
  updatedAt: number;
}

export type PullRequestMergeMethodDto = 'merge' | 'squash' | 'rebase';

export interface AiAutoCommitCommitDto {
  hash: string;
  subject: string;
}

export interface AiAutoCommitResultDto {
  commits: AiAutoCommitCommitDto[];
  summary: string;
  turns: number;
  modeTransitions: string[];
  processedFiles: number;
  remainingFiles: number;
  commitPlanStats: {
    groupCount: number;
    retries: number;
    fallbackCommits: number;
    totalCommits: number;
    totalFilesProcessed: number;
  };
  warnings: string[];
  diagnostics: string[];
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

export interface GitStashEntryDto {
  index: number;
  name: string;
  hash: string;
  branch: string;
  subject: string;
}

export interface DiagnosticsReportDto {
  generatedAt: string;
  appVersion: string;
  platform: string;
  activeRepo: string | null;
  report: string;
}

export interface SecretScanFindingDto {
  id: string;
  ruleId: string;
  severity: 'medium' | 'high' | 'critical';
  source: SecretScanSourceDto;
  filePath: string;
  lineNumber: number;
  contextLine: string;
}

export interface SecretScanResultDto {
  scanned: boolean;
  strictness: SecretScanStrictnessDto;
  findings: SecretScanFindingDto[];
  notes: string[];
  stats: {
    checkedLines: number;
    stagedLines: number;
    toPushLines: number;
  };
}

export interface ElectronAPI {
  openDirectory: () => Promise<{ path: string; isRepo: boolean } | null>;
  selectDirectory: () => Promise<string | null>;
  setRepoPath: (repoPath: string) => Promise<boolean>;
  runGitCommand: (command: string, ...args: any[]) => Promise<{ success: boolean; data?: any; error?: string }>;
  startInteractiveRebase: (baseHash: string, todoLines: string[]) => Promise<{ success: boolean; data?: any; error?: string }>;
  applyPatch: (patch: string, options?: { cached?: boolean; reverse?: boolean }) => Promise<{ success: boolean; data?: any; error?: string }>;
  getStashes: () => Promise<IpcResult<GitStashEntryDto[]>>;
  getRepoOriginUrl: (repoPath: string) => Promise<IpcResult<string | null>>;
  addIgnoreRule: (pattern: string) => Promise<{ success: boolean; added?: boolean; pattern?: string; error?: string }>;
  gitFetch: () => Promise<{ success: boolean; data?: any; error?: string }>;
  gitPull: () => Promise<{ success: boolean; data?: any; error?: string }>;
  gitPush: () => Promise<{ success: boolean; data?: any; error?: string }>;
  scanPushSecrets: () => Promise<IpcResult<SecretScanResultDto>>;
  gitClone: (cloneUrl: string, targetDir: string) => Promise<{ success: boolean; repoPath: string; error?: string }>;
  gitInit: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  getFileHistory: (filePath: string, commitHash?: string, limit?: number) => Promise<IpcResult<GitFileHistoryEntryDto[]>>;
  getFileBlame: (filePath: string, commitHash?: string) => Promise<IpcResult<GitFileBlameLineDto[]>>;
  openSubmodule: (submodulePath: string) => Promise<{ success: boolean; error?: string }>;
  onCloneProgress: (callback: (line: string) => void) => () => void;
  onJobEvent: (callback: (event: GitJobEventDto) => void) => () => void;
  getStoredRepos: () => Promise<StoredRepoData>;
  setStoredRepos: (data: StoredRepoData) => Promise<boolean>;
  getSettings: () => Promise<AppSettingsDto>;
  setSettings: (partial: Partial<AppSettingsDto>) => Promise<AppSettingsDto>;
  setGeminiApiKey: (apiKey: string) => Promise<AppSettingsDto>;
  clearGeminiApiKey: () => Promise<AppSettingsDto>;
  getAppVersion: () => Promise<string>;
  getUpdaterStatus: () => Promise<UpdaterStatusDto>;
  checkForAppUpdates: () => Promise<{ success: boolean; error?: string }>;
  runOneClickAppUpdate: () => Promise<UpdaterOneClickResultDto>;
  downloadAppUpdate: () => Promise<{ success: boolean; error?: string }>;
  installAppUpdate: () => Promise<{ success: boolean; error?: string }>;
  onUpdaterEvent: (callback: (event: UpdaterStatusDto) => void) => () => void;
  aiTestConnection: () => Promise<IpcResult<AiConnectionResultDto>>;
  aiListModels: () => Promise<IpcResult<string[]>>;
  ollamaTestConnection: () => Promise<IpcResult<AiConnectionResultDto>>;
  ollamaListModels: () => Promise<IpcResult<string[]>>;
  runAiAutoCommit: () => Promise<IpcResult<AiAutoCommitResultDto>>;
  cancelAiAutoCommit: () => Promise<{ success: boolean; canceled: boolean }>;
  githubAuth: (token: string, host?: string) => Promise<boolean>;
  githubDeviceStart: () => Promise<IpcResult<DeviceFlowStartDto>>;
  githubDevicePoll: (deviceCode: string) => Promise<IpcResult<DeviceFlowPollDto>>;
  githubWebLogin: () => Promise<IpcResult<{ username: string | null }>>;
  githubGetRepos: (params?: { page?: number; perPage?: number; search?: string }) => Promise<IpcResult<GitHubRepositoryPageDto>>;
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

  githubCreateRelease: (params: GitHubCreateReleaseParamsDto) => Promise<IpcResult<GitHubReleaseDto>>;
  githubGetReleaseContext: (params: { owner: string; repo: string; targetCommitish?: string }) => Promise<IpcResult<GitHubReleaseContextDto>>;
  aiGenerateReleaseNotes: (params: {
    tagName: string;
    releaseName: string;
    lastReleaseTag?: string | null;
    commits: ReleaseCommitDto[];
    language: 'de' | 'en';
  }) => Promise<IpcResult<{ markdown: string }>>;

  githubGetWorkflowRuns: (params: { owner: string; repo: string; branch?: string; headSha?: string; perPage?: number }) => Promise<IpcResult<GithubWorkflowRunDto[]>>;
  githubGetStatusChecks: (params: { owner: string; repo: string; ref: string }) => Promise<IpcResult<GithubStatusChecksDto>>;
  githubMergePR: (params: {
    owner: string;
    repo: string;
    pullNumber: number;
    mergeMethod: PullRequestMergeMethodDto;
    commitTitle?: string;
    commitMessage?: string;
  }) => Promise<IpcResult<{ sha: string; merged: boolean; message: string }>>;
  getDiagnosticsReport: () => Promise<IpcResult<DiagnosticsReportDto>>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};



