import type {
  DeviceFlowPollDto,
  DeviceFlowStartDto,
  GitHubCreateReleaseParamsDto,
  GitHubForkParamsDto,
  GitHubReleaseAssetDto,
  GitHubReleaseContextDto,
  GitHubReleaseDto,
  GitHubRepositoryDetailsDto,
  GitHubRepositoryDto,
  GitHubRepositoryPageDto,
  GitHubUploadReleaseAssetParamsDto,
  GithubStatusChecksDto,
  GithubWorkflowRunDto,
  PullRequestDto,
  PullRequestMergeMethodDto,
  ReleaseCommitDto,
} from '../../../types/githubDtos';
import type { IpcResult } from '../../../types/ipc';

export type CreatePullRequestParamsDto = {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
};

export type CreatePullRequestResultDto = {
  number: number;
  title: string;
  htmlUrl: string;
  state: string;
};

export type ReleaseNotesGenerationParamsDto = {
  tagName: string;
  releaseName: string;
  lastReleaseTag?: string | null;
  commits: ReleaseCommitDto[];
  repositoryHtmlUrl?: string | null;
  language: 'de' | 'en';
  versionBump: 'major' | 'minor' | 'patch';
  hints?: string[];
};

export type WorkflowRunsRequestDto = {
  owner: string;
  repo: string;
  branch?: string;
  headSha?: string;
  perPage?: number;
};

export type StatusChecksRequestDto = {
  owner: string;
  repo: string;
  ref: string;
};

export type MergePullRequestParamsDto = {
  owner: string;
  repo: string;
  pullNumber: number;
  mergeMethod: PullRequestMergeMethodDto;
  commitTitle?: string;
  commitMessage?: string;
};

export type MergePullRequestResultDto = {
  sha: string;
  merged: boolean;
  message: string;
};

export type GithubAuthResultDto = {
  success: boolean;
  tokenPersisted?: boolean;
  error?: string;
};

export interface ElectronGithubAPI {
  githubAuth: (token: string, host?: string) => Promise<GithubAuthResultDto>;
  githubCancelAuth: () => Promise<{ success: true }>;
  githubDeviceStart: () => Promise<IpcResult<DeviceFlowStartDto>>;
  githubDevicePoll: (deviceCode: string) => Promise<IpcResult<DeviceFlowPollDto & { tokenPersisted?: boolean }>>;
  githubWebLogin: () => Promise<IpcResult<{ username: string | null; tokenPersisted?: boolean }>>;
  githubGetRepos: (params?: { page?: number; perPage?: number; search?: string }) => Promise<IpcResult<GitHubRepositoryPageDto>>;
  githubGetSavedAuthStatus: () => Promise<{ hasSavedToken: boolean; authenticated: boolean; username: string | null; oauthConfigured: boolean }>;
  githubLoginWithSavedToken: () => Promise<{
    success: boolean;
    authenticated: boolean;
    username: string | null;
    tokenPersisted?: boolean;
    error?: string;
  }>;
  githubCheckAuthStatus: () => Promise<{ authenticated: boolean; username: string | null }>;
  githubLogout: () => Promise<{ success: true } | { success: false; error: string }>;
  githubCreateRepo: (name: string, description: string, isPrivate: boolean) => Promise<IpcResult<GitHubRepositoryDto>>;
  githubForkRepo: (params: GitHubForkParamsDto) => Promise<IpcResult<GitHubRepositoryDto>>;
  githubGetRepository: (owner: string, repo: string) => Promise<IpcResult<GitHubRepositoryDetailsDto>>;
  githubGetPRs: (owner: string, repo: string, state: string) => Promise<IpcResult<PullRequestDto[]>>;
  githubCreatePR: (params: CreatePullRequestParamsDto) => Promise<IpcResult<CreatePullRequestResultDto>>;
  githubCreateRelease: (params: GitHubCreateReleaseParamsDto) => Promise<IpcResult<GitHubReleaseDto>>;
  githubUploadReleaseAsset: (params: GitHubUploadReleaseAssetParamsDto) => Promise<IpcResult<GitHubReleaseAssetDto>>;
  githubGetReleaseContext: (params: {
    owner: string;
    repo: string;
    targetCommitish?: string;
    repoPath?: string;
  }) => Promise<IpcResult<GitHubReleaseContextDto>>;
  githubGetWorkflowRuns: (params: WorkflowRunsRequestDto) => Promise<IpcResult<GithubWorkflowRunDto[]>>;
  githubGetStatusChecks: (params: StatusChecksRequestDto) => Promise<IpcResult<GithubStatusChecksDto>>;
  githubMergePR: (params: MergePullRequestParamsDto) => Promise<IpcResult<MergePullRequestResultDto>>;
}

export interface ElectronReleaseNotesAPI {
  aiGenerateReleaseNotes: (params: ReleaseNotesGenerationParamsDto) => Promise<IpcResult<{ markdown: string }>>;
}
