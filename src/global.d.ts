import type { GitCommandName } from './shared/ipc/gitCommands';
import type { ElectronAPI } from './shared/ipc/contracts/electronApi';

export interface StoredRepoEntryDto {
  path: string;
  lastOpened: number;
  pinned: boolean;
  createdAt: number;
}

export type RepoSortByDto = 'lastOpenedDesc' | 'nameAsc' | 'nameDesc' | 'createdAtDesc' | 'createdAtAsc';

export interface StoredRepoData {
  repos: StoredRepoEntryDto[];
  activeRepo: string | null;
  sortBy?: RepoSortByDto;
}

export type IpcSuccessResult<T> = {
  success: true;
  data: T;
  error?: never;
};

export type IpcErrorResult = {
  success: false;
  error: string;
  data?: never;
};

export type IpcResult<T> = IpcSuccessResult<T> | IpcErrorResult;

export type GitCommandNameDto = GitCommandName;

export type GitCommandResultDto = IpcResult<string>;

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

export interface GitHubForkParamsDto {
  owner: string;
  repo: string;
  name?: string;
  defaultBranchOnly?: boolean;
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

export type UpdaterStateDto = 'idle' | 'checking' | 'update-available' | 'no-update' | 'downloading' | 'downloaded' | 'error';

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
export type AiCommitMessageStyleDto = 'conventional' | 'plain' | 'detailed';
export type AiCommitMessageLanguageDto = 'auto' | 'de' | 'en';
export type AppThemeDto =
  | 'copper-night'
  | 'midnight-teal'
  | 'graphite-blue'
  | 'forest-copper'
  | 'porcelain-light'
  | 'ember-slate'
  | 'arctic-mint'
  | 'mono-dark-red'
  | 'mono-light-red'
  | 'mono-dark-green'
  | 'mono-light-green';
export type SecretScanStrictnessDto = 'low' | 'medium' | 'high';
export type SecretScanSourceDto = 'staged' | 'to-push' | 'tag';
export type PlanningApiTokenLifetimeDto = 'day' | 'month' | 'year' | 'forever';
export type PlanningApiTokenSourceDto = 'environment' | 'saved' | 'session';

export interface AppSettingsDto {
  theme: AppThemeDto;
  language: 'de' | 'en';
  autoFetchIntervalMs: number;
  defaultBranch: string;
  confirmDangerousOps: boolean;
  commitTemplate: string;
  showSecondaryHistory: boolean;
  commitSignoffByDefault: boolean;
  autoUpdateEnabled: boolean;
  secretScanBeforePushEnabled: boolean;
  secretScanStrictness: SecretScanStrictnessDto;
  secretScanAllowlist: string;
  aiAutoCommitEnabled: boolean;
  aiProvider: AiProviderDto;
  aiCommitMessageStyle: AiCommitMessageStyleDto;
  aiCommitMessageLanguage: AiCommitMessageLanguageDto;
  ollamaBaseUrl: string;
  ollamaModel: string;
  geminiModel: string;
  hasGeminiApiKey: boolean;
  githubOauthClientId: string;
  githubHost: string;
}

export interface PlanningApiInfoDto {
  enabled: boolean;
  status: 'starting' | 'running' | 'disabled' | 'error';
  host: string;
  port: number | null;
  preferredPort: number;
  baseUrl: string | null;
  apiUrl: string | null;
  mcpUrl: string | null;
  docsUrl: string | null;
  openApiUrl: string | null;
  authRequired: boolean;
  authHeaderName: string;
  authToken: string | null;
  authTokenSource: PlanningApiTokenSourceDto;
  authTokenCreatedAt: number | null;
  authTokenExpiresAt: number | null;
  authTokenPersistent: boolean;
  authTokenManageable: boolean;
  authTokenStorageAvailable: boolean;
  error?: string;
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
  htmlUrl?: string | null;
}

export interface GitHubReleaseContextDto {
  existingTags: string[];
  lastReleaseTag: string | null;
  repositoryHtmlUrl?: string | null;
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
    tagLines: number;
  };
}

export interface AiGeneratedCommitMessageDto {
  title: string;
  description: string;
}

export type CommitStatsStateDto = 'missing' | 'queued' | 'loading' | 'ready' | 'error';

export interface CommitStatsDto {
  files: number;
  additions: number;
  deletions: number;
}

export interface CommitLogPageDto {
  raw: string;
  hasMore: boolean;
  stats: Record<string, CommitStatsDto>;
  repoPath: string;
}

export interface CommitStatsUpdateDto {
  repoPath: string;
  hash: string;
  stats: CommitStatsDto | null;
  state: 'loading' | 'ready' | 'error';
}

export interface WorkingTreeSnapshotDto {
  snapshotId: string;
  repoPath: string;
  statusRaw: string;
  changeCount: number;
  durationMs: number;
  largeMode: boolean;
}

export interface WorkingTreeStatsDto {
  snapshotId: string;
  staged: CommitStatsDto;
  unstaged: CommitStatsDto;
}

export interface DiffPreviewDto {
  text: string;
  truncated: boolean;
  bytes: number;
  lines: number;
}

export type RepositoryFileSourceDto = 'unstaged' | 'staged' | 'commit';

export interface MarkdownPreviewFileDto {
  text: string;
}

export interface RepoFileDataUrlDto {
  dataUrl: string;
  mimeType: string;
  bytes: number;
}

export type FileTimelineChangeDto = {
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  path: string;
  oldPath?: string;
};

export type FileTimelineCommitDto = {
  hash: string;
  author: string;
  date: string;
  subject: string;
  changes: FileTimelineChangeDto[];
};

export type {
  ElectronAPI,
  ElectronAiAPI,
  ElectronApiNamespaceKey,
  ElectronAppAPI,
  ElectronFlatAPI,
  ElectronGitAPI,
  ElectronGithubAPI,
  ElectronPlannerAPI,
  ElectronReleaseNotesAPI,
  ElectronReposAPI,
  ElectronSettingsAPI,
} from './shared/ipc/contracts/electronApi';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    api: ElectronAPI;
  }
}

export {};
