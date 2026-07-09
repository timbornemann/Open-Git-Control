import {
  ACCESS_TOKEN_PATH,
  DEFAULT_HOST,
  DEVICE_CODE_PATH,
  type DeviceFlowPollResult,
  type DeviceFlowStartResult,
  type GitHubAuthSession,
  type GitHubOctokit,
  type WebFlowExchangeParams,
  type WebFlowExchangeResult,
  oauthEndpointForHost,
} from './types';

type OctokitConstructor = new (options: { auth: string; baseUrl: string }) => GitHubOctokit;

export class GitHubAuthService {
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

  getApiBaseUrl(configuredHost?: string | null): string {
    const host = this.normalizeHost(configuredHost);
    if (host === DEFAULT_HOST) {
      return 'https://api.github.com';
    }
    return `https://${host}/api/v3`;
  }

  private getOauthHost(configuredHost?: string | null): string {
    return this.normalizeHost(configuredHost);
  }

  private getOauthClientId(configuredClientId?: string | null): string | null {
    const settingsClientId = this.normalizeClientId(configuredClientId);
    if (settingsClientId) {
      return settingsClientId;
    }

    const envClientId = this.normalizeClientId(process.env.GITHUB_OAUTH_CLIENT_ID);
    return envClientId;
  }

  isDeviceFlowConfigured(configuredClientId?: string | null): boolean {
    return Boolean(this.getOauthClientId(configuredClientId));
  }

  async authenticate(token: string, configuredHost?: string | null): Promise<GitHubAuthSession | null> {
    try {
      const host = this.normalizeHost(configuredHost);

      // Using new Function prevents TypeScript from compiling dynamic import into require().
      const _importDynamic = new Function('modulePath', 'return import(modulePath)');
      const { Octokit } = (await _importDynamic('octokit')) as { Octokit: OctokitConstructor };
      const octokit = new Octokit({ auth: token, baseUrl: this.getApiBaseUrl(host) });

      await octokit.rest.rateLimit.get();

      let username: string | null = null;
      try {
        const { data } = await octokit.rest.users.getAuthenticated();
        username = data?.login || null;
        console.log('GitHub Authenticated as:', username, 'on host:', host);
      } catch {
        console.log('GitHub Authenticated (Token valid, but user scope not available). Host:', host);
      }

      return {
        octokit,
        token,
        username,
        host,
      };
    } catch (e) {
      console.error('GitHub Auth Error:', (e as Error).message);
      return null;
    }
  }

  async startDeviceFlow(configuredClientId?: string | null, configuredHost?: string | null): Promise<DeviceFlowStartResult> {
    const host = this.getOauthHost(configuredHost);

    const clientId = this.getOauthClientId(configuredClientId);
    if (!clientId) {
      throw new Error('Device Flow nicht konfiguriert. Bitte GitHub OAuth Client ID in den Einstellungen setzen oder GITHUB_OAUTH_CLIENT_ID bereitstellen.');
    }

    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('scope', 'repo read:user');

    const response = await fetch(oauthEndpointForHost(host, DEVICE_CODE_PATH), {
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

    const payload = (await response.json()) as {
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

    const response = await fetch(oauthEndpointForHost(host, ACCESS_TOKEN_PATH), {
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

    const payload = (await response.json()) as {
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

    const response = await fetch(oauthEndpointForHost(host, ACCESS_TOKEN_PATH), {
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

    const payload = (await response.json()) as {
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
}
