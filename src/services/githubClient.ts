import type {
  DeviceFlowPollDto,
  DeviceFlowStartDto,
  ElectronAPI,
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
} from '../global';
import { getElectronApi, requireElectronApi } from './electronApi';

export const githubClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async openExternalUrl(url: string): Promise<{ success: boolean; error?: string }> {
    return requireElectronApi().openExternalUrl(url);
  },

  async checkAuthStatus(): Promise<{ authenticated: boolean; username: string | null }> {
    return requireElectronApi().githubCheckAuthStatus();
  },

  async auth(token: string, host?: string): Promise<boolean> {
    return requireElectronApi().githubAuth(token, host);
  },

  async deviceStart(): Promise<IpcResult<DeviceFlowStartDto>> {
    return requireElectronApi().githubDeviceStart();
  },

  async devicePoll(deviceCode: string): Promise<IpcResult<DeviceFlowPollDto>> {
    return requireElectronApi().githubDevicePoll(deviceCode);
  },

  async webLogin(): Promise<IpcResult<{ username: string | null }>> {
    return requireElectronApi().githubWebLogin();
  },

  async getRepositories(params?: { page?: number; perPage?: number; search?: string }): Promise<IpcResult<GitHubRepositoryPageDto>> {
    return requireElectronApi().githubGetRepos(params);
  },

  async getSavedAuthStatus(): ReturnType<ElectronAPI['githubGetSavedAuthStatus']> {
    return requireElectronApi().githubGetSavedAuthStatus();
  },

  async loginWithSavedToken(): ReturnType<ElectronAPI['githubLoginWithSavedToken']> {
    return requireElectronApi().githubLoginWithSavedToken();
  },

  async logout(): ReturnType<ElectronAPI['githubLogout']> {
    return requireElectronApi().githubLogout();
  },

  async createRepository(
    name: string,
    description: string,
    isPrivate: boolean,
  ): Promise<IpcResult<GitHubRepositoryDto>> {
    return requireElectronApi().githubCreateRepo(name, description, isPrivate);
  },

  async forkRepository(params: GitHubForkParamsDto): Promise<IpcResult<GitHubRepositoryDto>> {
    return requireElectronApi().githubForkRepo(params);
  },

  async getPullRequests(owner: string, repo: string, state: string): Promise<IpcResult<PullRequestDto[]>> {
    return requireElectronApi().githubGetPRs(owner, repo, state);
  },

  async createPullRequest(...args: Parameters<ElectronAPI['githubCreatePR']>): ReturnType<ElectronAPI['githubCreatePR']> {
    return requireElectronApi().githubCreatePR(...args);
  },

  async getWorkflowRuns(params: { owner: string; repo: string; branch?: string; headSha?: string; perPage?: number }): Promise<IpcResult<GithubWorkflowRunDto[]>> {
    return requireElectronApi().githubGetWorkflowRuns(params);
  },

  async getStatusChecks(params: { owner: string; repo: string; ref: string }): Promise<IpcResult<GithubStatusChecksDto>> {
    return requireElectronApi().githubGetStatusChecks(params);
  },

  async mergePullRequest(params: {
    owner: string;
    repo: string;
    pullNumber: number;
    mergeMethod: PullRequestMergeMethodDto;
  }): Promise<IpcResult<{ sha: string; merged: boolean; message: string }>> {
    return requireElectronApi().githubMergePR(params);
  },

  async getReleaseContext(params: {
    owner: string;
    repo: string;
    targetCommitish?: string;
  }): Promise<IpcResult<GitHubReleaseContextDto>> {
    return requireElectronApi().githubGetReleaseContext(params);
  },

  async createRelease(params: GitHubCreateReleaseParamsDto): Promise<IpcResult<GitHubReleaseDto>> {
    return requireElectronApi().githubCreateRelease(params);
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
    return requireElectronApi().aiGenerateReleaseNotes(params);
  },
};
