import { createServer, get, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostingConnection } from '../../../src/types/hostingDtos';
import { browserOAuthLogin, refreshOAuthCredential } from '../HostingOAuth';

const mocks = vi.hoisted(() => ({ open: vi.fn<(url: string) => Promise<void>>() }));
vi.mock('electron', () => ({ shell: { openExternal: mocks.open }, net: { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) } }));
afterEach(() => vi.clearAllMocks());

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test listener');
  return address.port;
}
const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

describe('confidential Forgejo OAuth', { timeout: 30_000 }, () => {
  it('requires the application secret after consent, verifies PKCE, and reuses the secret on refresh', async () => {
    let authorization!: URL;
    const requests: URLSearchParams[] = [];
    const server = createServer(async (request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Connection', 'close');
      let body = '';
      for await (const chunk of request) body += String(chunk);
      const params = new URLSearchParams(body);
      requests.push(params);
      if (request.url !== '/login/oauth/access_token' || params.get('client_id') !== 'confidential-application') {
        response.writeHead(400).end(JSON.stringify({ error: 'invalid_client' }));
      } else if (params.get('client_secret') !== 'application-secret') {
        response.writeHead(400).end(JSON.stringify({ error: 'invalid_client', error_description: 'invalid empty client secret' }));
      } else if (params.get('grant_type') === 'refresh_token' && params.get('refresh_token') === 'refresh-credential') {
        response.end(JSON.stringify({ access_token: 'refreshed-credential', expires_in: 3600 }));
      } else if (
        params.get('redirect_uri') !== authorization.searchParams.get('redirect_uri') ||
        createHash('sha256')
          .update(params.get('code_verifier') || '')
          .digest('base64url') !== authorization.searchParams.get('code_challenge')
      ) {
        response.writeHead(400).end(JSON.stringify({ error: 'unauthorized_client', error_description: 'failed PKCE code challenge' }));
      } else {
        response.end(JSON.stringify({ access_token: 'access-credential', refresh_token: 'refresh-credential', expires_in: 3600 }));
      }
    });
    const port = await listen(server);
    const callbackServer = createServer();
    const callbackPort = await listen(callbackServer);
    await close(callbackServer);
    const connection = {
      provider: 'forgejo',
      baseUrl: `http://127.0.0.1:${port}`,
      oauth: { clientId: 'confidential-application', redirectUri: `http://127.0.0.1:${callbackPort}/callback` },
    } as HostingConnection;
    mocks.open.mockImplementation(async (url) => {
      authorization = new URL(url);
      await new Promise<void>((resolve, reject) => {
        get(`${connection.oauth!.redirectUri}?state=${authorization.searchParams.get('state')}&code=consented-code`, { agent: false }, (response) => {
          response.resume();
          response.once('end', resolve);
        }).once('error', reject);
      });
    });
    try {
      await expect(browserOAuthLogin(connection, undefined, new AbortController().signal)).rejects.toThrow('requires its Client Secret');
      const credential = await browserOAuthLogin(connection, 'application-secret', new AbortController().signal);
      expect(credential).toMatchObject({ accessToken: 'access-credential', authType: 'oauth', clientSecret: 'application-secret' });
      expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
      expect(authorization.searchParams.has('client_secret')).toBe(false);
      expect(requests[0].has('client_secret')).toBe(false);
      expect(await refreshOAuthCredential(connection, credential)).toMatchObject({
        accessToken: 'refreshed-credential',
        refreshToken: 'refresh-credential',
        clientSecret: 'application-secret',
      });
      expect(requests).toHaveLength(3);
      expect(requests[2].get('client_secret')).toBe('application-secret');
    } finally {
      await close(server);
    }
  });
});
