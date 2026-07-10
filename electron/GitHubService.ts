import { GitHubAuthService } from './github/GitHubAuthService';
import { GitHubPullRequestService } from './github/GitHubPullRequestService';
import { GitHubReleaseService } from './github/GitHubReleaseService';
import { GitHubRepositoryService } from './github/GitHubRepositoryService';
import { GitHubWorkflowService } from './github/GitHubWorkflowService';
import {
  DEFAULT_HOST,
  type CreateReleaseParams,
  type DeviceFlowPollResult,
  type DeviceFlowStartResult,
  type GitHubReleaseDto,
  type GitHubOctokit,
  type MergeMethod,
  type WebFlowExchangeParams,
  type WebFlowExchangeResult,
} from './github/types';

export type { CreateReleaseParams, DeviceFlowPollResult, DeviceFlowStartResult, GitHubReleaseDto, WebFlowExchangeParams, WebFlowExchangeResult };

export class GitHubService {
  private octokit: GitHubOctokit | null = null;
  private token: string | null = null;
  private username: string | null = null;
  private host: string = DEFAULT_HOST;
  private authenticationGeneration = 0;

  private readonly authService = new GitHubAuthService();
  private readonly repositories = new GitHubRepositoryService(() => this.requireOctokit());
  private readonly pullRequests = new GitHubPullRequestService(() => this.requireOctokit());
  private readonly workflows = new GitHubWorkflowService(() => this.requireOctokit());
  private readonly releases = new GitHubReleaseService(() => this.requireOctokit());

  private requireOctokit(): GitHubOctokit {
    if (!this.octokit) {
      throw new Error('Not authenticated');
    }
    return this.octokit;
  }

  normalizeHost(value: unknown): string {
    return this.authService.normalizeHost(value);
  }

  isDeviceFlowConfigured(configuredClientId?: string | null, _configuredHost?: string | null): boolean {
    return this.authService.isDeviceFlowConfigured(configuredClientId);
  }

  getHost(): string {
    return this.host;
  }

  getAuthenticationGeneration(): number {
    return this.authenticationGeneration;
  }

  cancelPendingAuthentication(): void {
    this.authenticationGeneration += 1;
  }

  async authenticate(token: string, configuredHost?: string | null, shouldApplySession: () => boolean = () => true): Promise<boolean> {
    const generation = ++this.authenticationGeneration;
    const session = await this.authService.authenticate(token, configuredHost);
    if (generation !== this.authenticationGeneration || !shouldApplySession()) {
      return false;
    }
    if (!session) {
      this.octokit = null;
      this.token = null;
      this.username = null;
      this.host = DEFAULT_HOST;
      return false;
    }

    this.octokit = session.octokit;
    this.token = session.token;
    this.username = session.username;
    this.host = session.host;
    return true;
  }

  startDeviceFlow(configuredClientId?: string | null, configuredHost?: string | null): Promise<DeviceFlowStartResult> {
    return this.authService.startDeviceFlow(configuredClientId, configuredHost || this.host);
  }

  pollDeviceFlow(deviceCode: string, configuredClientId?: string | null, configuredHost?: string | null): Promise<DeviceFlowPollResult> {
    return this.authService.pollDeviceFlow(deviceCode, configuredClientId, configuredHost || this.host);
  }

  exchangeWebFlowCode(params: WebFlowExchangeParams): Promise<WebFlowExchangeResult> {
    return this.authService.exchangeWebFlowCode({
      ...params,
      configuredHost: params.configuredHost || this.host,
    });
  }

  isAuthenticated(): boolean {
    return this.octokit !== null;
  }

  logout(): void {
    this.authenticationGeneration += 1;
    this.octokit = null;
    this.token = null;
    this.username = null;
    this.host = DEFAULT_HOST;
  }

  getUsername(): string | null {
    return this.username;
  }

  getMyRepositories(page: number = 1, perPage: number = 50, search: string = '') {
    return this.repositories.getMyRepositories(page, perPage, search);
  }

  createRepository(name: string, description: string, isPrivate: boolean) {
    return this.repositories.createRepository(name, description, isPrivate);
  }

  getRepository(owner: string, repo: string) {
    return this.repositories.getRepository(owner, repo);
  }

  forkRepository(
    owner: string,
    repo: string,
    options: {
      name?: string;
      defaultBranchOnly?: boolean;
    } = {},
  ) {
    return this.repositories.forkRepository(owner, repo, options);
  }

  getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') {
    return this.pullRequests.getPullRequests(owner, repo, state);
  }

  createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string) {
    return this.pullRequests.createPullRequest(owner, repo, title, body, head, base);
  }

  mergePullRequest(owner: string, repo: string, pullNumber: number, mergeMethod: MergeMethod, commitTitle?: string, commitMessage?: string) {
    return this.pullRequests.mergePullRequest(owner, repo, pullNumber, mergeMethod, commitTitle, commitMessage);
  }

  getWorkflowRuns(owner: string, repo: string, params: { branch?: string; headSha?: string; perPage?: number } = {}) {
    return this.workflows.getWorkflowRuns(owner, repo, params);
  }

  getStatusChecks(owner: string, repo: string, ref: string) {
    return this.workflows.getStatusChecks(owner, repo, ref);
  }

  listRepositoryTags(owner: string, repo: string, perPage: number = 200): Promise<string[]> {
    return this.releases.listRepositoryTags(owner, repo, perPage);
  }

  getLatestReleaseTag(owner: string, repo: string): Promise<string | null> {
    return this.releases.getLatestReleaseTag(owner, repo);
  }

  createRelease(params: CreateReleaseParams): Promise<GitHubReleaseDto> {
    return this.releases.createRelease(params);
  }

  uploadReleaseAsset(params: {
    owner: string;
    repo: string;
    releaseId: number;
    filePath: string;
    name?: string;
  }) {
    return this.releases.uploadReleaseAsset(params);
  }
}

export const githubService = new GitHubService();
