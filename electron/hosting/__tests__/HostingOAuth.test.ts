import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, get } from 'http';
import { createHash } from 'crypto';
import type { HostingConnection } from '../../../src/types/hostingDtos';
import { browserOAuthLogin, refreshOAuthCredential } from '../HostingOAuth';

const state = vi.hoisted(() => ({ open: vi.fn<(url: string) => Promise<void>>() }));
vi.mock('electron', () => ({ shell: { openExternal: state.open } }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function freePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}
function callback(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode || 0));
    }).on('error', reject);
  });
}

describe('desktop browser OAuth', () => {
  it('uses PKCE, rejects a forged callback state, and completes only the bound callback', async () => {
    const port = await freePort();
    const connection: HostingConnection = {
      id: 'one',
      provider: 'gitlab',
      label: 'GitLab',
      baseUrl: 'https://git.example.test/nested',
      apiBaseUrl: 'https://git.example.test/nested/api/v4',
      username: null,
      userId: null,
      authenticated: false,
      hasCredentials: false,
      oauth: { clientId: 'public-client', redirectUri: `http://127.0.0.1:${port}/oauth/callback` },
    };
    let authorization!: URL;
    let forgedStatus = 0;
    let unicodeStatus = 0;
    const malformedStatuses: number[] = [];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: 'oauth-access-secret', refresh_token: 'rotating-refresh-secret', expires_in: 3600 }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    state.open.mockImplementation(async (url) => {
      authorization = new URL(url);
      for (const malformedPath of ['//%', '//[::1']) {
        malformedStatuses.push(await callback(`${new URL(connection.oauth!.redirectUri!).origin}${malformedPath}`));
      }
      forgedStatus = await callback(`${connection.oauth!.redirectUri}?state=invalid&code=forged`);
      unicodeStatus = await callback(
        `${connection.oauth!.redirectUri}?state=${encodeURIComponent('ä'.repeat(authorization.searchParams.get('state')!.length))}&code=forged`,
      );
      await callback(`${connection.oauth!.redirectUri}?state=${authorization.searchParams.get('state')}&code=valid-code`);
    });
    const result = await browserOAuthLogin(connection, undefined, new AbortController().signal);
    expect(forgedStatus).toBe(400);
    expect(unicodeStatus).toBe(400);
    expect(malformedStatuses).toEqual([400, 400]);
    expect(result).toMatchObject({ accessToken: 'oauth-access-secret', refreshToken: 'rotating-refresh-secret', authType: 'oauth' });
    const [tokenUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const params = new URLSearchParams(String(init.body));
    expect(tokenUrl).toBe('https://git.example.test/nested/oauth/token');
    expect(params.get('code')).toBe('valid-code');
    expect(params.has('client_secret')).toBe(false);
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('code_challenge')).toBe(createHash('sha256').update(params.get('code_verifier')!).digest('base64url'));
    expect(init.redirect).toBe('error');
  });

  it('cancels the pending login and closes its callback listener', async () => {
    const port = await freePort();
    const connection: HostingConnection = {
      id: 'one',
      provider: 'forgejo',
      label: 'Forgejo',
      baseUrl: 'https://forge.test',
      apiBaseUrl: 'https://forge.test/api/v1',
      username: null,
      userId: null,
      authenticated: false,
      hasCredentials: false,
      oauth: { clientId: 'client', redirectUri: `http://127.0.0.1:${port}/callback` },
    };
    const controller = new AbortController();
    state.open.mockImplementation(async () => controller.abort());
    await expect(browserOAuthLogin(connection, undefined, controller.signal)).rejects.toThrow('cancelled');
    await expect(callback(connection.oauth!.redirectUri)).rejects.toThrow();
  });

  it('retains the previous refresh token when the provider does not rotate it', async () => {
    const connection: HostingConnection = {
      id: 'one',
      provider: 'gitlab',
      label: 'GitLab',
      baseUrl: 'https://git.test',
      apiBaseUrl: 'https://git.test/api/v4',
      username: 'user',
      userId: '1',
      authenticated: true,
      hasCredentials: true,
      oauth: { clientId: 'client', redirectUri: 'http://127.0.0.1:49187/callback' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ access_token: 'new-access', expires_in: 3600 }), { status: 200 })),
    );
    expect(await refreshOAuthCredential(connection, { accessToken: 'old-access', authType: 'oauth', refreshToken: 'keep-this-refresh' })).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'keep-this-refresh',
      authType: 'oauth',
    });
  });
});
