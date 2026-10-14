import { describe, expect, it } from 'vitest';
import type { HostingConnection } from '../../../src/types/hostingDtos';
import { redactGitCredentials } from '../../../src/shared/git/redaction';
import { oauthExchangeError } from '../HostingOAuthErrors';

const connection = { provider: 'forgejo' } as HostingConnection;
describe('safe OAuth failure diagnostics', () => {
  it('explains confidential-client credentials and survives diagnostic redaction', async () => {
    const error = await oauthExchangeError(
      connection,
      new Response(
        JSON.stringify({
          error: 'invalid_client',
          error_description: 'invalid empty client secret',
        }),
        { status: 400 },
      ),
    );
    expect(error.message).toContain('400, invalid_client');
    expect(error.message).toContain('confidential Forgejo application requires its Client Secret');
    expect(error.message).toContain('Public clients use PKCE');
    expect(redactGitCredentials(error.message)).toBe(error.message);
  });

  it.each([
    [{ error: 'invalid_grant', error_description: 'unexpected redirect URI' }, 'callback URL does not match'],
    [{ error: 'unauthorized_client', error_description: 'failed PKCE code challenge' }, 'rejected the PKCE'],
    [{ error: 'invalid_grant' }, 'authorization code was rejected or expired'],
  ])('gives a useful remedy for %j', async (payload, reason) => {
    const error = await oauthExchangeError(connection, new Response(JSON.stringify(payload), { status: 400 }));
    expect(error.message).toContain(reason);
  });

  it.each([
    JSON.stringify({ error: 'invalid_client', error_description: 'Rejected private-code and client-secret-value', access_token: 'private-access-value' }),
    JSON.stringify({ error: 'private-access-value', error_description: 'client-secret-value' }),
    '<html>private-access-value and client-secret-value</html>',
    'null',
  ])('never forwards response text or unknown error codes: %s', async (body) => {
    const error = await oauthExchangeError(connection, new Response(body, { status: 400 }));
    expect(error.message).toContain('OAuth sign-in failed (400');
    for (const secret of ['private-code', 'client-secret-value', 'private-access-value', '<html>']) expect(error.message).not.toContain(secret);
  });

  it('stops reading an oversized error stream instead of buffering an unbounded response', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8193));
      },
      cancel() {
        cancelled = true;
      },
    });
    const error = await oauthExchangeError(connection, new Response(stream, { status: 502 }));
    expect(error.message).toContain('currently unavailable');
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
  });
});
