import type { HostingConnection } from '../../src/types/hostingDtos';

const MAX_ERROR_BYTES = 8192;
type OAuthFailure = { error?: unknown; error_description?: unknown };
const knownCodes = new Set([
  'invalid_client',
  'unauthorized_client',
  'invalid_grant',
  'invalid_request',
  'unsupported_grant_type',
  'invalid_scope',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
]);

async function readFailure(response: Response): Promise<OAuthFailure> {
  const reader = response.body?.getReader();
  if (!reader) return {};
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ERROR_BYTES) return {};
      chunks.push(value);
    }
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Only recognized protocol errors become diagnostics; response text may contain credentials. */
export async function oauthExchangeError(connection: HostingConnection, response: Response): Promise<Error> {
  const payload = await readFailure(response);
  const code = typeof payload.error === 'string' && knownCodes.has(payload.error) ? payload.error : undefined;
  const description = typeof payload.error_description === 'string' ? payload.error_description.trim().toLowerCase() : '';
  let reason = 'Check the OAuth application registration and its exact callback URL.';
  if (['unexpected redirect uri', 'redirect_uri mismatch', 'redirect uri mismatch'].includes(description)) {
    reason = 'The callback URL does not match. Use the exact same address in the registered OAuth application and Open-Git-Control.';
  } else if (description === 'failed pkce code challenge') {
    reason = 'The server rejected the PKCE verification. Start a new browser sign-in and check the OAuth application configuration.';
  } else if (code === 'invalid_client' || ['invalid empty client secret', 'invalid client secret'].includes(description)) {
    reason = 'The server rejected the OAuth Client ID or Client Secret.';
    if (connection.provider === 'forgejo')
      reason += ' A confidential Forgejo application requires its Client Secret in the browser sign-in settings. Public clients use PKCE without a secret.';
    else reason += ' Check the credentials of the registered OAuth application.';
  } else if (code === 'invalid_grant' || code === 'unauthorized_client') {
    reason = 'The authorization code was rejected or expired. Start a new browser sign-in and check the Client ID, Client Secret and callback URL.';
  } else if (code === 'access_denied') {
    reason = 'The server denied access to this OAuth application.';
  } else if (code === 'server_error' || code === 'temporarily_unavailable' || response.status >= 500) {
    reason = 'The OAuth server is currently unavailable. Try signing in again later.';
  }
  return new Error(`OAuth sign-in failed (${response.status}${code ? `, ${code}` : ''}). ${reason}`);
}
