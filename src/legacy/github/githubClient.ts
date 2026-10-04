/** Retired GitHub renderer client, retained for internal regression coverage only. */
import type { ReleaseCommitDto } from '@/types/releaseNotes';
import type { ReadRequest } from '@/shared/cache/resource';
import { cachedClient } from '@/data/clientCache';
import type {
  DeviceFlowPollDto,
  DeviceFlowStartDto,
  GitHubCreateReleaseParamsDto,
  GitHubInspectReleaseTargetParamsDto,
  GitHubReleaseTargetDto,
  GitHubForkParamsDto,
  GitHubReleaseContextDto,
  GitHubReleaseDto,
  GitHubRepositoryPageDto,
  GitHubRepositoryDto,
  GithubStatusChecksDto,
  GithubWorkflowRunDto,
  PullRequestDto,
  PullRequestMergeMethodDto,
} from '@/types/githubDtos';
import type { IpcResult } from '@/types/ipc';
import type { LegacyGithubAPI } from './contracts';
import { requireElectronAiApi, requireElectronAppApi } from '@/services/electronApi';
import { getLegacyGithubApi, requireLegacyGithubApi } from './electronApi';

export const githubClient = cachedClient('github', {
  isAvailable(): boolean {
    return Boolean(getLegacyGithubApi());
  },

  async openExternalUrl(url: string): Promise<{ success: boolean; error?: string }> {
    return requireElectronAppApi().openExternalUrl(url);
  },

  async checkAuthStatus(): Promise<{ authenticated: boolean; username: string | null }> {
    return requireLegacyGithubApi().githubCheckAuthStatus();
  },

  async auth(token: string, host?: string): Promise<{ success: boolean; tokenPersisted?: boolean; error?: string }> {
    return requireLegacyGithubApi().githubAuth(token, host);
  },

  async cancelAuth(): ReturnType<LegacyGithubAPI['githubCancelAuth']> {
    return requireLegacyGithubApi().githubCancelAuth();
  },

  async deviceStart(): Promise<IpcResult<DeviceFlowStartDto>> {
    return requireLegacyGithubApi().githubDeviceStart();
  },

  async devicePoll(deviceCode: string): Promise<IpcResult<DeviceFlowPollDto>> {
    return requireLegacyGithubApi().githubDevicePoll(deviceCode);
  },

  async webLogin(): Promise<IpcResult<{ username: string | null; tokenPersisted?: boolean }>> {
    return requireLegacyGithubApi().githubWebLogin();
  },

  async getRepositories(params?: { page?: number; perPage?: number; search?: string; readRequest?: ReadRequest }): Promise<IpcResult<GitHubRepositoryPageDto>> {
    return requireLegacyGithubApi().githubGetRepos(params);
  },

  async getSavedAuthStatus(): ReturnType<LegacyGithubAPI['githubGetSavedAuthStatus']> {
    return requireLegacyGithubApi().githubGetSavedAuthStatus();
  },

  async loginWithSavedToken(): ReturnType<LegacyGithubAPI['githubLoginWithSavedToken']> {
    return requireLegacyGithubApi().githubLoginWithSavedToken();
  },

  async logout(): ReturnType<LegacyGithubAPI['githubLogout']> {
    return requireLegacyGithubApi().githubLogout();
  },

  async createRepository(name: string, description: string, isPrivate: boolean): Promise<IpcResult<GitHubRepositoryDto>> {
    return requireLegacyGithubApi().githubCreateRepo(name, description, isPrivate);
  },

  async createRepositoryWithReadme(name: string, description: string, isPrivate: boolean) {
    return requireLegacyGithubApi().githubCreateRepoWithReadme(name, description, isPrivate);
  },

  async getCatalogSnapshot() {
    return requireLegacyGithubApi().githubGetCatalogSnapshot();
  },

  async saveCatalogSnapshot(repos: GitHubRepositoryDto[]) {
    return requireLegacyGithubApi().githubSaveCatalogSnapshot(repos);
  },

  async forkRepository(params: GitHubForkParamsDto): Promise<IpcResult<GitHubRepositoryDto>> {
    return requireLegacyGithubApi().githubForkRepo(params);
  },

  async getRepository(owner: string, repo: string) {
    return requireLegacyGithubApi().githubGetRepository(owner, repo);
  },

  async getBranches(owner: string, repo: string) {
    return requireLegacyGithubApi().githubGetBranches(owner, repo);
  },

  async getPullRequests(owner: string, repo: string, state: string): Promise<IpcResult<PullRequestDto[]>> {
    return requireLegacyGithubApi().githubGetPRs(owner, repo, state);
  },

  async createPullRequest(...args: Parameters<LegacyGithubAPI['githubCreatePR']>): ReturnType<LegacyGithubAPI['githubCreatePR']> {
    return requireLegacyGithubApi().githubCreatePR(...args);
  },

  async getWorkflowRuns(params: {
    owner: string;
    repo: string;
    branch?: string;
    headSha?: string;
    perPage?: number;
  }): Promise<IpcResult<GithubWorkflowRunDto[]>> {
    return requireLegacyGithubApi().githubGetWorkflowRuns(params);
  },

  async getWorkflowRunsPage(params: { owner: string; repo: string; branch?: string; status?: string; page?: number; perPage?: number }) {
    return requireLegacyGithubApi().githubGetWorkflowRunsPage(params);
  },

  async getWorkflowJobsPage(params: { owner: string; repo: string; runId: number; page?: number; perPage?: number }) {
    return requireLegacyGithubApi().githubGetWorkflowJobsPage(params);
  },

  async rerunFailedJobs(owner: string, repo: string, runId: number) {
    return requireLegacyGithubApi().githubRerunFailedJobs(owner, repo, runId);
  },

  async cancelWorkflowRun(owner: string, repo: string, runId: number) {
    return requireLegacyGithubApi().githubCancelWorkflowRun(owner, repo, runId);
  },

  async getStatusChecks(params: { owner: string; repo: string; ref: string }): Promise<IpcResult<GithubStatusChecksDto>> {
    return requireLegacyGithubApi().githubGetStatusChecks(params);
  },

  async mergePullRequest(params: {
    owner: string;
    repo: string;
    pullNumber: number;
    mergeMethod: PullRequestMergeMethodDto;
    expectedHeadSha?: string;
  }): Promise<IpcResult<{ sha: string; merged: boolean; message: string }>> {
    return requireLegacyGithubApi().githubMergePR(params);
  },

  async getReleaseContext(params: { owner: string; repo: string; targetCommitish?: string; repoPath?: string }): Promise<IpcResult<GitHubReleaseContextDto>> {
    return requireLegacyGithubApi().githubGetReleaseContext(params);
  },

  async createRelease(params: GitHubCreateReleaseParamsDto): Promise<IpcResult<GitHubReleaseDto>> {
    return requireLegacyGithubApi().githubCreateRelease(params);
  },

  async inspectReleaseTarget(params: GitHubInspectReleaseTargetParamsDto): Promise<IpcResult<GitHubReleaseTargetDto>> {
    return requireLegacyGithubApi().githubInspectReleaseTarget(params);
  },

  async uploadReleaseAsset(...args: Parameters<LegacyGithubAPI['githubUploadReleaseAsset']>): ReturnType<LegacyGithubAPI['githubUploadReleaseAsset']> {
    return requireLegacyGithubApi().githubUploadReleaseAsset(...args);
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
  }): Promise<IpcResult<{ markdown: string; source: 'ai' | 'fallback'; warning?: string }>> {
    return requireElectronAiApi().aiGenerateReleaseNotes(params);
  },
});
