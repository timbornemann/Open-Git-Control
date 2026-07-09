import type {
  DeviceFlowPollDto,
  DeviceFlowStartDto,
  GitHubCreateReleaseParamsDto,
  GitHubForkParamsDto,
  GitHubReleaseContextDto,
  GitHubReleaseDto,
  GitHubRepositoryPageDto,
  GitHubRepositoryDto,
  GithubStatusChecksDto,
  GithubWorkflowRunDto,
  IpcResult,
  PullRequestDto,
  PullRequestMergeMethodDto,
  ReleaseCommitDto,
} from '@/global';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { getElectronApi, requireElectronAiApi, requireElectronAppApi, requireElectronGithubApi } from './electronApi';

export const githubClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async openExternalUrl(url: string): Promise<{ success: boolean; error?: string }> {
    return requireElectronAppApi().openExternalUrl(url);
  },

  async checkAuthStatus(): Promise<{ authenticated: boolean; username: string | null }> {
    return requireElectronGithubApi().githubCheckAuthStatus();
  },

  async auth(token: string, host?: string): Promise<boolean> {
    return requireElectronGithubApi().githubAuth(token, host);
  },

  async deviceStart(): Promise<IpcResult<DeviceFlowStartDto>> {
    return requireElectronGithubApi().githubDeviceStart();
  },

  async devicePoll(deviceCode: string): Promise<IpcResult<DeviceFlowPollDto>> {
    return requireElectronGithubApi().githubDevicePoll(deviceCode);
  },

  async webLogin(): Promise<IpcResult<{ username: string | null }>> {
    return requireElectronGithubApi().githubWebLogin();
  },

  async getRepositories(params?: { page?: number; perPage?: number; search?: string }): Promise<IpcResult<GitHubRepositoryPageDto>> {
    return requireElectronGithubApi().githubGetRepos(params);
  },

  async getSavedAuthStatus(): ReturnType<ElectronAPI['githubGetSavedAuthStatus']> {
    return requireElectronGithubApi().githubGetSavedAuthStatus();
  },

  async loginWithSavedToken(): ReturnType<ElectronAPI['githubLoginWithSavedToken']> {
    return requireElectronGithubApi().githubLoginWithSavedToken();
  },

  async logout(): ReturnType<ElectronAPI['githubLogout']> {
    return requireElectronGithubApi().githubLogout();
  },

  async createRepository(name: string, description: string, isPrivate: boolean): Promise<IpcResult<GitHubRepositoryDto>> {
    return requireElectronGithubApi().githubCreateRepo(name, description, isPrivate);
  },

  async forkRepository(params: GitHubForkParamsDto): Promise<IpcResult<GitHubRepositoryDto>> {
    return requireElectronGithubApi().githubForkRepo(params);
  },

  async getPullRequests(owner: string, repo: string, state: string): Promise<IpcResult<PullRequestDto[]>> {
    return requireElectronGithubApi().githubGetPRs(owner, repo, state);
  },

  async createPullRequest(...args: Parameters<ElectronAPI['githubCreatePR']>): ReturnType<ElectronAPI['githubCreatePR']> {
    return requireElectronGithubApi().githubCreatePR(...args);
  },

  async getWorkflowRuns(params: {
    owner: string;
    repo: string;
    branch?: string;
    headSha?: string;
    perPage?: number;
  }): Promise<IpcResult<GithubWorkflowRunDto[]>> {
    return requireElectronGithubApi().githubGetWorkflowRuns(params);
  },

  async getStatusChecks(params: { owner: string; repo: string; ref: string }): Promise<IpcResult<GithubStatusChecksDto>> {
    return requireElectronGithubApi().githubGetStatusChecks(params);
  },

  async mergePullRequest(params: {
    owner: string;
    repo: string;
    pullNumber: number;
    mergeMethod: PullRequestMergeMethodDto;
  }): Promise<IpcResult<{ sha: string; merged: boolean; message: string }>> {
    return requireElectronGithubApi().githubMergePR(params);
  },

  async getReleaseContext(params: { owner: string; repo: string; targetCommitish?: string }): Promise<IpcResult<GitHubReleaseContextDto>> {
    return requireElectronGithubApi().githubGetReleaseContext(params);
  },

  async createRelease(params: GitHubCreateReleaseParamsDto): Promise<IpcResult<GitHubReleaseDto>> {
    return requireElectronGithubApi().githubCreateRelease(params);
  },

  async generateReleaseNotes(params: {
    tagName: string;
    releaseName: string;
    lastReleaseTag?: string | null;
    commits: ReleaseCommitDto[];
    repositoryHtmlUrl?: string | null;
    language: 'de' | 'en';
    versionBump: 'major' | 'minor' | 'patch';
    hints?: string[];
  }): Promise<IpcResult<{ markdown: string }>> {
    return requireElectronAiApi().aiGenerateReleaseNotes(params);
  },
};
