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
  | { status: 'success'; username: string | null; tokenPersisted?: boolean };
