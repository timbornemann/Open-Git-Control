import type { AiCommitMessageLanguageDto, AiCommitMessageStyleDto, AiProviderDto } from './aiDtos';

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
  openAiBaseUrl: string;
  openAiModel: string;
  hasOpenAiApiKey: boolean;
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

export interface DiagnosticsReportDto {
  generatedAt: string;
  appVersion: string;
  platform: string;
  activeRepo: string | null;
  report: string;
}
