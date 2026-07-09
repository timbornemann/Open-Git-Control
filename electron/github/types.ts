import type { GithubCheckRunDto, GithubStatusContextDto, GithubWorkflowRunDto, GitHubRepositoryDto, PullRequestDto } from '../../src/global';

export const DEVICE_CODE_PATH = '/login/device/code';
export const ACCESS_TOKEN_PATH = '/login/oauth/access_token';
export const DEFAULT_HOST = 'github.com';

export type DeviceFlowStartResult = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
};

export type DeviceFlowPollResult =
  | { status: 'success'; accessToken: string; tokenType: string; scope: string }
  | { status: 'pending'; interval?: number }
  | { status: 'error'; error: string; errorDescription?: string };

export type WebFlowExchangeParams = {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  configuredClientId?: string | null;
  configuredHost?: string | null;
};

export type WebFlowExchangeResult = {
  accessToken: string;
  tokenType: string;
  scope: string;
};

export type GitHubAuthSession = {
  octokit: any;
  token: string;
  username: string | null;
  host: string;
};

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export type CreateReleaseParams = {
  owner: string;
  repo: string;
  tagName: string;
  targetCommitish?: string;
  releaseName: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
};

export type GitHubReleaseDto = {
  id: number;
  tagName: string;
  name: string;
  htmlUrl: string;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
};

export type WorkflowRunState = 'queued' | 'in_progress' | 'completed' | 'requested' | 'waiting' | 'pending';
export type WorkflowRunConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'neutral' | 'stale' | null;

export type CheckRunStatus = 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';
export type CheckRunConclusion = WorkflowRunConclusion;

export type GithubRepositoryApi = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  clone_url: string;
  html_url: string;
  description?: string | null;
  updated_at?: string;
};

export type PullRequestApi = {
  number: number;
  title: string;
  state: string;
  user?: { login?: string | null } | null;
  created_at: string;
  updated_at: string;
  head?: { ref?: string | null; sha?: string | null } | null;
  base?: { ref?: string | null } | null;
  merged_at?: string | null;
  html_url: string;
  draft?: boolean;
};

export type WorkflowRunApi = {
  id: number;
  name?: string | null;
  display_title?: string | null;
  status?: string | null;
  conclusion?: string | null;
  event?: string | null;
  html_url: string;
  head_branch?: string | null;
  head_sha?: string | null;
  created_at: string;
  run_started_at?: string | null;
  updated_at: string;
};

export type CheckRunApi = {
  id: number;
  name?: string | null;
  status?: string | null;
  conclusion?: string | null;
  details_url?: string | null;
  html_url?: string | null;
  app?: { name?: string | null } | null;
  started_at?: string | null;
  completed_at?: string | null;
};

export type StatusContextApi = {
  id: number;
  context?: string | null;
  state?: string | null;
  description?: string | null;
  target_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type RepositoryTagApi = {
  name?: string | null;
};

export type RepositoryReleaseApi = {
  tag_name?: string | null;
};

export type GithubApiErrorLike = {
  status?: unknown;
  message?: unknown;
  response?: {
    data?: {
      message?: unknown;
    };
  };
};

export type GitHubOctokitProvider = () => any;

export type { GithubCheckRunDto, GithubStatusContextDto, GithubWorkflowRunDto, GitHubRepositoryDto, PullRequestDto };

export function oauthEndpointForHost(host: string, path: string): string {
  return 'https://' + host + path;
}
