import type { AppSettingsDto } from '../../../global';

export const DEFAULT_SETTINGS: AppSettingsDto = {
  theme: 'copper-night',
  language: 'de',
  autoFetchIntervalMs: 60_000,
  defaultBranch: 'main',
  confirmDangerousOps: true,
  commitTemplate: '',
  showSecondaryHistory: true,
  commitSignoffByDefault: false,
  autoUpdateEnabled: true,
  secretScanBeforePushEnabled: true,
  secretScanStrictness: 'medium',
  secretScanAllowlist: '',
  aiAutoCommitEnabled: false,
  aiProvider: 'ollama',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  geminiModel: 'gemini-3-flash-preview',
  hasGeminiApiKey: false,
  githubOauthClientId: '',
  githubHost: 'github.com',
};

export type RunGitCommandOptions = {
  skipDirtyGuard?: boolean;
  skipRemoteAheadDirtyGuard?: boolean;
  skipSecretScan?: boolean;
  skipAutoSetUpstreamOnPushFailure?: boolean;
  skipGithubRecoveryOnPushFailure?: boolean;
  skipAutoInitialCommitOnPushFailure?: boolean;
  confirmedAutoInitialCommit?: boolean;
};

export const GUARDED_COMMANDS = new Set(['checkout', 'merge', 'reset']);

export const SIDEBAR_COLLAPSE_STORAGE_KEY = 'open-git-control:sidebar-collapse-by-repo:v1';
export const LEGACY_SIDEBAR_COLLAPSE_STORAGE_KEY = 'git-organizer:sidebar-collapse-by-repo:v1';
export const SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY = 'open-git-control:sidebar-general-collapse:v1';
export const LEGACY_SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY = 'git-organizer:sidebar-general-collapse:v1';

export type SidebarCollapseState = {
  branchPanelCollapsed: boolean;
  tagPanelCollapsed: boolean;
  remotePanelCollapsed: boolean;
  submodulePanelCollapsed: boolean;
};

export type SidebarCollapseByRepo = Record<string, SidebarCollapseState>;

export type SidebarGeneralCollapseState = {
  repoPanelCollapsed: boolean;
};

export const DEFAULT_SIDEBAR_COLLAPSE_STATE: SidebarCollapseState = {
  branchPanelCollapsed: false,
  tagPanelCollapsed: false,
  remotePanelCollapsed: false,
  submodulePanelCollapsed: false,
};

export const DEFAULT_SIDEBAR_GENERAL_COLLAPSE_STATE: SidebarGeneralCollapseState = {
  repoPanelCollapsed: false,
};
