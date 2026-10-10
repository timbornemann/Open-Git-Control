import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { createServer, type Server } from 'http';
import { shell } from 'electron';
import type { HostingConnection } from '../../src/types/hostingDtos';
import type { HostingCredential } from './HostingCredentialStore';
import { hostingUrl } from './hostingUrls';

const OAUTH_TIMEOUT_MS = 5 * 60_000;
type OAuthTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
const base64url = (buffer: Buffer) => buffer.toString('base64url');

export function oauthEndpoints(connection: HostingConnection): { authorize: string; token: string; scope: string; pkce: boolean } {
  if (connection.provider === 'forgejo')
    return {
      authorize: hostingUrl(connection.baseUrl, 'login/oauth/authorize'),
      token: hostingUrl(connection.baseUrl, 'login/oauth/access_token'),
      scope: '',
      pkce: true,
    };
  if (connection.provider === 'gitlab')
    return {
      authorize: hostingUrl(connection.baseUrl, 'oauth/authorize'),
      token: hostingUrl(connection.baseUrl, 'oauth/token'),
      scope: 'api read_user read_repository write_repository',
      pkce: true,
    };
  if (connection.provider === 'bitbucket-data-center')
    return {
      authorize: hostingUrl(connection.baseUrl, 'rest/oauth2/latest/authorize'),
      token: hostingUrl(connection.baseUrl, 'rest/oauth2/latest/token'),
      scope: 'REPO_ADMIN',
      pkce: true,
    };
  if (connection.provider === 'bitbucket-cloud')
    return { authorize: 'https://bitbucket.org/site/oauth2/authorize', token: 'https://bitbucket.org/site/oauth2/access_token', scope: '', pkce: false };
  throw new Error('GitHub browser login uses the GitHub CLI or device login.');
}

function validateRedirect(connection: HostingConnection): URL {
  const uri = connection.oauth?.redirectUri;
  if (!uri) throw new Error('Register an OAuth application and configure its exact localhost callback URL.');
  if (connection.provider === 'bitbucket-data-center' && !connection.oauth?.allowHttpLoopback)
    throw new Error('The Bitbucket administrator must permit the registered HTTP loopback callback before desktop OAuth can be used.');
  const url = new URL(uri);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || url.username || url.password || url.search || url.hash) {
    throw new Error('Desktop OAuth requires an explicit http://127.0.0.1:<port>/<callback> redirect URI registered with the provider.');
  }
  return url;
}

async function postToken(connection: HostingConnection, params: URLSearchParams, clientSecret?: string, signal?: AbortSignal): Promise<HostingCredential> {
  const endpoints = oauthEndpoints(connection);
  const clientId = connection.oauth?.clientId?.trim();
  if (!clientId) throw new Error('OAuth client ID is required.');
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' };
  if (connection.provider === 'bitbucket-cloud') {
    if (!clientSecret) throw new Error('Bitbucket Cloud requires your OAuth consumer key and secret.');
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    params.set('client_id', clientId);
    if (clientSecret) params.set('client_secret', clientSecret);
  }
  const response = await fetch(endpoints.token, {
    method: 'POST',
    headers,
    body: params.toString(),
    redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`OAuth token exchange failed (${response.status}). Verify the application registration and callback URL.`);
  const payload = (await response.json()) as OAuthTokenResponse;
  if (payload.error || typeof payload.access_token !== 'string' || !payload.access_token) throw new Error('The OAuth provider did not return an access token.');
  return {
    accessToken: payload.access_token,
    authType: 'oauth',
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_in ? Date.now() + Number(payload.expires_in) * 1000 : undefined,
    clientSecret,
    redirectUri: connection.oauth?.redirectUri,
  };
}

export async function refreshOAuthCredential(connection: HostingConnection, credential: HostingCredential, signal?: AbortSignal): Promise<HostingCredential> {
  if (!credential.refreshToken) throw new Error('The hosting session has expired. Please sign in again.');
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credential.refreshToken });
  if (credential.redirectUri) params.set('redirect_uri', credential.redirectUri);
  const updated = await postToken(connection, params, credential.clientSecret, signal);
  return { ...credential, ...updated, refreshToken: updated.refreshToken || credential.refreshToken };
}

export async function browserOAuthLogin(connection: HostingConnection, clientSecret: string | undefined, signal: AbortSignal): Promise<HostingCredential> {
  const redirect = validateRedirect(connection);
  const endpoints = oauthEndpoints(connection);
  const clientId = connection.oauth?.clientId?.trim();
  if (!clientId) throw new Error('Register an OAuth application and configure its client ID.');
  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(48));
  let server: Server | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  try {
    const code = await new Promise<string>((resolve, reject) => {
      const finish = (error?: Error, result?: string) => {
        if (timer) clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        server?.close();
        if (error) reject(error);
        else resolve(result!);
      };
      onAbort = () => finish(new Error('Hosting login cancelled.'));
      server = createServer((request, response) => {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'");
        let target: URL;
        try {
          target = new URL(request.url || '/', redirect.origin);
        } catch {
          response.writeHead(400);
          response.end('Invalid callback URL.');
          return;
        }
        if (request.method !== 'GET' || target.pathname !== redirect.pathname) {
          response.writeHead(404);
          response.end('Not found.');
          return;
        }
        const received = target.searchParams.get('state') || '';
        const stateBytes = Buffer.from(state);
        const receivedBytes = Buffer.from(received);
        if (receivedBytes.length !== stateBytes.length || !timingSafeEqual(receivedBytes, stateBytes)) {
          response.writeHead(400);
          response.end('Invalid login state.');
          return;
        }
        if (target.searchParams.has('error')) {
          response.writeHead(400);
          response.end('Login was declined. Return to Open-Git-Control.');
          finish(new Error('OAuth authorization was declined.'));
          return;
        }
        const authorizationCode = target.searchParams.get('code');
        if (!authorizationCode) {
          response.writeHead(400);
          response.end('Authorization code missing.');
          return;
        }
        response.end('Signed in. You can return to Open-Git-Control.');
        finish(undefined, authorizationCode);
      });
      server.once('error', () => finish(new Error('The configured OAuth callback port is unavailable.')));
      server.listen(Number(redirect.port), redirect.hostname, () => {
        const authorization = new URL(endpoints.authorize);
        authorization.search = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirect.href,
          state,
          ...(endpoints.scope ? { scope: endpoints.scope } : {}),
          ...(endpoints.pkce ? { code_challenge: base64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' } : {}),
        }).toString();
        void shell.openExternal(authorization.href).catch(() => finish(new Error('The login browser could not be opened.')));
      });
      timer = setTimeout(() => finish(new Error('Browser login timed out.')), OAUTH_TIMEOUT_MS);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    signal.throwIfAborted();
    const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect.href });
    if (endpoints.pkce) params.set('code_verifier', verifier);
    return await postToken(connection, params, clientSecret, signal);
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    server?.close();
  }
}
