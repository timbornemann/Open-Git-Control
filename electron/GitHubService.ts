const DEVICE_CODE_ENDPOINT = 'https://github.com/login/device/code';
const ACCESS_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';

type DeviceFlowStartResult = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
};

type DeviceFlowPollResult =
  | { status: 'success'; accessToken: string; tokenType: string; scope: string }
  | { status: 'pending'; interval?: number }
  | { status: 'error'; error: string; errorDescription?: string };

type WebFlowExchangeParams = {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  configuredClientId?: string | null;
  configuredHost?: string | null;
};

type WebFlowExchangeResult = {
  accessToken: string;
  tokenType: string;
  scope: string;
};

type MergeMethod = 'merge' | 'squash' | 'rebase';

type WorkflowRunState = 'queued' | 'in_progress' | 'completed' | 'requested' | 'waiting' | 'pending';
type WorkflowRunConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | 'neutral'
  | 'stale'
  | null;

type CheckRunStatus = 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';
type CheckRunConclusion = WorkflowRunConclusion;

const DEFAULT_HOST = 'github.com';

export class GitHubService {
  private octokit: any | null = null;
  private token: string | null = null;
  private username: string | null = null;
  private host: string = DEFAULT_HOST;

  private normalizeClientId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized || null;
  }

  normalizeHost(value: unknown): string {
    if (typeof value !== 'string') {
      return DEFAULT_HOST;
    }
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return DEFAULT_HOST;
    }

    const withoutProtocol = trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!withoutProtocol || /[^a-z0-9.\-:]/.test(withoutProtocol)) {
      return DEFAULT_HOST;
    }

    return withoutProtocol;
  }

  private getApiBaseUrl(configuredHost?: string | null): string {
    const host = this.normalizeHost(configuredHost || this.host);
    if (host === DEFAULT_HOST) {
      return 'https://api.github.com';
    }
    return `https://${host}/api/v3`;
  }

  private getOauthHost(configuredHost?: string | null): string {
    return this.normalizeHost(configuredHost || this.host);
  }

  private getOauthClientId(configuredClientId?: string | null): string | null {
    const settingsClientId = this.normalizeClientId(configuredClientId);
    if (settingsClientId) {
      return settingsClientId;
    }

    const envClientId = this.normalizeClientId(process.env.GITHUB_OAUTH_CLIENT_ID);
    return envClientId;
  }

  isDeviceFlowConfigured(configuredClientId?: string | null, configuredHost?: string | null): boolean {
    const host = this.getOauthHost(configuredHost);
    if (host !== DEFAULT_HOST) {
      return false;
    }
    return Boolean(this.getOauthClientId(configuredClientId));
  }

  getHost(): string {
    return this.host;
  }

  async authenticate(token: string, configuredHost?: string | null): Promise<boolean> {
    try {
      const host = this.normalizeHost(configuredHost);

      // Using new Function to prevent TypeScript from compiling dynamic import into require()
      const _importDynamic = new Function('modulePath', 'return import(modulePath)');
      const { Octokit } = await _importDynamic('octokit');
      this.octokit = new Octokit({ auth: token, baseUrl: this.getApiBaseUrl(host) });

      // Validate the token by calling the rate limit endpoint (works with any valid token)
      await this.octokit.rest.rateLimit.get();

      this.token = token;
      this.host = host;

      // Try fetching the username for display
      try {
        const { data } = await this.octokit.rest.users.getAuthenticated();
        this.username = data?.login || null;
        console.log('GitHub Authenticated as:', this.username, 'on host:', host);
      } catch {
        this.username = null;
        console.log('GitHub Authenticated (Token valid, but user scope not available). Host:', host);
      }

      return true;
    } catch (e) {
      console.error('GitHub Auth Error:', (e as Error).message);
      this.octokit = null;
      this.token = null;
      this.username = null;
      return false;
    }
  }

  async startDeviceFlow(configuredClientId?: string | null, configuredHost?: string | null): Promise<DeviceFlowStartResult> {
    const host = this.getOauthHost(configuredHost);
    if (host !== DEFAULT_HOST) {
      throw new Error('Device Flow wird aktuell nur fuer github.com unterstuetzt. Bitte PAT-Login nutzen.');
    }

    const clientId = this.getOauthClientId(configuredClientId);
    if (!clientId) {
      throw new Error('Device Flow nicht konfiguriert. Bitte GitHub OAuth Client ID in den Einstellungen setzen oder GITHUB_OAUTH_CLIENT_ID bereitstellen.');
    }

    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('scope', 'repo read:user');

    const response = await fetch(DEVICE_CODE_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Device Flow konnte nicht gestartet werden (${response.status}).`);
    }

    const payload = await response.json() as {
      device_code?: string;
      user_code?: string;
      verification_uri?: string;
      expires_in?: number;
      interval?: number;
      error?: string;
      error_description?: string;
    };

    if (payload.error) {
      throw new Error(payload.error_description || payload.error);
    }

    if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
      throw new Error('Unvollstaendige Device-Flow Antwort erhalten.');
    }

    return {
      deviceCode: payload.device_code,
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      expiresIn: Number(payload.expires_in || 900),
      interval: Number(payload.interval || 5),
    };
  }

  async pollDeviceFlow(deviceCode: string, configuredClientId?: string | null, configuredHost?: string | null): Promise<DeviceFlowPollResult> {
    const host = this.getOauthHost(configuredHost);
    if (host !== DEFAULT_HOST) {
      return {
        status: 'error',
        error: 'oauth_host_not_supported',
        errorDescription: 'Device Flow wird aktuell nur fuer github.com unterstuetzt.',
      };
    }

    const clientId = this.getOauthClientId(configuredClientId);
    if (!clientId) {
      return {
        status: 'error',
        error: 'oauth_not_configured',
        errorDescription: 'GitHub OAuth Client ID fehlt (Settings oder GITHUB_OAUTH_CLIENT_ID).',
      };
    }

    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('device_code', deviceCode);
    params.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

    const response = await fetch(ACCESS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      return {
        status: 'error',
        error: 'request_failed',
        errorDescription: `Token-Abfrage fehlgeschlagen (${response.status}).`,
      };
    }

    const payload = await response.json() as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
      interval?: number;
    };

    if (payload.error) {
      if (payload.error === 'authorization_pending') {
        return { status: 'pending' };
      }
      if (payload.error === 'slow_down') {
        return { status: 'pending', interval: Number(payload.interval || 10) };
      }
      return {
        status: 'error',
        error: payload.error,
        errorDescription: payload.error_description,
      };
    }

    if (!payload.access_token) {
      return {
        status: 'error',
        error: 'missing_access_token',
        errorDescription: 'Kein Access Token in der Antwort enthalten.',
      };
    }

    return {
      status: 'success',
      accessToken: payload.access_token,
      tokenType: payload.token_type || 'bearer',
      scope: payload.scope || '',
    };
  }

  async exchangeWebFlowCode(params: WebFlowExchangeParams): Promise<WebFlowExchangeResult> {
    const host = this.getOauthHost(params.configuredHost);
    if (host !== DEFAULT_HOST) {
      throw new Error('OAuth Browser Login wird aktuell nur fuer github.com unterstuetzt.');
    }

    const clientId = this.getOauthClientId(params.configuredClientId);
    if (!clientId) {
      throw new Error('OAuth Browser Login ist nicht konfiguriert (GitHub OAuth Client ID fehlt).');
    }

    const body = new URLSearchParams();
    body.set('client_id', clientId);
    body.set('code', params.code);
    body.set('redirect_uri', params.redirectUri);
    body.set('code_verifier', params.codeVerifier);

    const envClientSecret = this.normalizeClientId(process.env.GITHUB_OAUTH_CLIENT_SECRET);
    if (envClientSecret) {
      body.set('client_secret', envClientSecret);
    }

    const response = await fetch(ACCESS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`OAuth Token-Austausch fehlgeschlagen (${response.status}).`);
    }

    const payload = await response.json() as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (payload.error) {
      throw new Error(payload.error_description || payload.error);
    }

    if (!payload.access_token) {
      throw new Error('Kein Access Token in der OAuth-Antwort enthalten.');
    }

    return {
      accessToken: payload.access_token,
      tokenType: payload.token_type || 'bearer',
      scope: payload.scope || '',
    };
  }

  isAuthenticated(): boolean {
    return this.octokit !== null;
  }

  logout(): void {
    this.octokit = null;
    this.token = null;
    this.username = null;
  }

  getUsername(): string | null {
    return this.username;
  }

  async getMyRepositories(page: number = 1, perPage: number = 50, search: string = '') {
    if (!this.octokit) throw new Error('Not authenticated');

    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safePerPage = Number.isFinite(perPage) ? Math.max(10, Math.min(Math.floor(perPage), 100)) : 50;
    const normalizedSearch = (search || '').trim().toLowerCase();

    const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: safePerPage,
      page: safePage,
    });

    const mapped = data.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      cloneUrl: repo.clone_url,
      htmlUrl: repo.html_url,
      description: repo.description,
      updatedAt: repo.updated_at,
    }));

    const filtered = normalizedSearch
      ? mapped.filter((repo: any) => {
        const haystack = `${repo.name} ${repo.fullName} ${repo.description || ''}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      : mapped;

    return {
      repos: filtered,
      nextPage: data.length === safePerPage ? safePage + 1 : null,
      hasMore: data.length === safePerPage,
      totalCount: null,
    };
  }

  async createRepository(name: string, description: string, isPrivate: boolean) {
    if (!this.octokit) throw new Error('Not authenticated');

    const { data } = await this.octokit.rest.repos.createForAuthenticatedUser({
      name,
      description,
      private: isPrivate,
      auto_init: false,
    });

    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      private: data.private,
      cloneUrl: data.clone_url,
      htmlUrl: data.html_url,
      description: data.description,
      updatedAt: data.updated_at,
    };
  }

  async getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') {
    if (!this.octokit) throw new Error('Not authenticated');

    const { data } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state,
      per_page: 30,
      sort: 'updated',
      direction: 'desc',
    });

    return data.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      user: pr.user?.login || '',
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      head: pr.head?.ref || '',
      headSha: pr.head?.sha || '',
      base: pr.base?.ref || '',
      merged: pr.merged_at !== null,
      htmlUrl: pr.html_url,
      draft: pr.draft || false,
    }));
  }

  async getWorkflowRuns(owner: string, repo: string, params: { branch?: string; headSha?: string; perPage?: number } = {}) {
    if (!this.octokit) throw new Error('Not authenticated');

    const safePerPage = Number.isFinite(params.perPage)
      ? Math.max(1, Math.min(Math.floor(params.perPage as number), 100))
      : 20;

    const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      ...(params.branch ? { branch: params.branch } : {}),
      per_page: safePerPage,
    });

    const runs = (data.workflow_runs || []).filter((run: any) => {
      if (!params.headSha) return true;
      return run.head_sha === params.headSha;
    });

    return runs.map((run: any) => ({
      id: run.id,
      name: run.name || run.display_title || 'Workflow',
      status: (run.status || 'pending') as WorkflowRunState,
      conclusion: (run.conclusion ?? null) as WorkflowRunConclusion,
      event: run.event || 'unknown',
      htmlUrl: run.html_url,
      workflowName: run.display_title || run.name || 'Workflow',
      branch: run.head_branch || '',
      headSha: run.head_sha || '',
      createdAt: run.created_at,
      startedAt: run.run_started_at || run.created_at,
      updatedAt: run.updated_at,
    }));
  }

  async getStatusChecks(owner: string, repo: string, ref: string) {
    if (!this.octokit) throw new Error('Not authenticated');

    const normalizedRef = (ref || '').trim();
    if (!normalizedRef) {
      throw new Error('Ref is required');
    }

    const [checksResponse, statusesResponse] = await Promise.all([
      this.octokit.rest.checks.listForRef({ owner, repo, ref: normalizedRef, per_page: 100 }),
      this.octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref: normalizedRef, per_page: 100 }),
    ]);

    const checkRuns = (checksResponse.data.check_runs || []).map((run: any) => ({
      id: run.id,
      name: run.name || run.app?.name || 'Check',
      status: (run.status || 'pending') as CheckRunStatus,
      conclusion: (run.conclusion ?? null) as CheckRunConclusion,
      detailsUrl: run.details_url || run.html_url || null,
      appName: run.app?.name || null,
      startedAt: run.started_at || null,
      completedAt: run.completed_at || null,
    }));

    const statusContexts = (statusesResponse.data.statuses || []).map((status: any) => ({
      id: status.id,
      context: status.context || 'status',
      state: status.state || 'pending',
      description: status.description || null,
      targetUrl: status.target_url || null,
      createdAt: status.created_at || null,
      updatedAt: status.updated_at || null,
    }));

    return {
      state: statusesResponse.data.state || 'pending',
      sha: statusesResponse.data.sha || normalizedRef,
      checkRuns,
      statusContexts,
    };
  }

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
  ) {
    if (!this.octokit) throw new Error('Not authenticated');

    const { data } = await this.octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });

    return {
      number: data.number,
      title: data.title,
      htmlUrl: data.html_url,
      state: data.state,
    };
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    mergeMethod: MergeMethod,
    commitTitle?: string,
    commitMessage?: string,
  ) {
    if (!this.octokit) throw new Error('Not authenticated');

    const method: MergeMethod = mergeMethod === 'rebase' || mergeMethod === 'squash' ? mergeMethod : 'merge';
    const { data } = await this.octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: method,
      ...(commitTitle ? { commit_title: commitTitle } : {}),
      ...(commitMessage ? { commit_message: commitMessage } : {}),
    });

    return {
      sha: data.sha,
      merged: Boolean(data.merged),
      message: data.message || 'Merged',
    };
  }
}

export const githubService = new GitHubService();
