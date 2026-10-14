import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostingFetch, hostingNetworkError } from '../HostingNetwork';

const native = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }));
vi.mock('electron', () => ({ net: { fetch: native.fetch } }));
afterEach(() => {
  native.fetch.mockReset();
  vi.unstubAllGlobals();
});

describe('hosting network and local certificate trust', () => {
  it('uses Chromium networking for token requests without session cookies, cached credentials or protocol overrides', async () => {
    const nodeFetch = vi.fn();
    vi.stubGlobal('fetch', nodeFetch);
    native.fetch.mockResolvedValue(new Response('{"id":7,"login":"alice"}'));
    const response = await hostingFetch('https://172.24.3.20/api/v1/user', { headers: { Authorization: 'Bearer private-token' }, redirect: 'error' });
    expect(await response.json()).toEqual({ id: 7, login: 'alice' });
    expect(nodeFetch).not.toHaveBeenCalled();
    const [url, options] = native.fetch.mock.calls[0];
    expect(url).toBe('https://172.24.3.20/api/v1/user');
    expect(options).toMatchObject({ credentials: 'omit', cache: 'no-store', bypassCustomProtocolHandlers: true, redirect: 'error' });
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer private-token');
  });

  it.each([
    ['ERR_CERT_AUTHORITY_INVALID', 'certificate_untrusted', 'root CA certificate'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'certificate_untrusted', 'root CA certificate'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'certificate_untrusted', 'root CA certificate'],
    ['ERR_CERT_DATE_INVALID', 'certificate_date_invalid', 'expired'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'certificate_hostname_mismatch', 'hostname'],
    ['ERR_CERT_REVOKED', 'certificate_revoked', 'revoked'],
    ['ERR_NAME_NOT_RESOLVED', 'dns_failed', 'DNS'],
    ['ERR_PROXY_CONNECTION_FAILED', 'proxy_failed', 'proxy'],
    ['ECONNREFUSED', 'connection_refused', 'port'],
    ['UND_ERR_CONNECT_TIMEOUT', 'request_timeout', 'timed out'],
    ['ENETUNREACH', 'server_unreachable', 'network'],
    ['ERR_SSL_PROTOCOL_ERROR', 'tls_failed', 'TLS configuration'],
  ])('explains %s without revealing raw request data', async (nativeCode, code, explanation) => {
    native.fetch.mockRejectedValue(new TypeError('fetch failed: private-token?code=oauth-secret', { cause: new Error(`net::${nativeCode}`) }));
    const result = hostingFetch('https://172.24.3.20/login/oauth/access_token?code=oauth-secret');
    await expect(result).rejects.toMatchObject({ code, message: expect.stringContaining(explanation) });
    await expect(result).rejects.toMatchObject({ message: expect.stringContaining('https://172.24.3.20') });
    await expect(result).rejects.not.toThrow('private-token');
    await expect(result).rejects.not.toThrow('oauth-secret');
    expect(native.fetch).toHaveBeenCalledTimes(1);
  });

  it('extracts Node error codes from bounded, cyclic aggregate causes', () => {
    const reason = new AggregateError([{ code: 'ECONNREFUSED' }], 'fetch failed');
    reason.cause = reason;
    expect(hostingNetworkError(reason, new URL('https://forge.test'))).toMatchObject({ code: 'connection_refused' });
  });

  it('distinguishes a user cancellation from a deadline', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    native.fetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(hostingFetch('https://forge.test', { signal: cancelled.signal })).rejects.toMatchObject({ code: 'request_cancelled' });
    const expired = new AbortController();
    expired.abort(new DOMException('Timed out', 'TimeoutError'));
    await expect(hostingFetch('https://forge.test', { signal: expired.signal })).rejects.toMatchObject({ code: 'request_timeout' });
  });

  it('gives a useful fallback and never sends credentials through non-HTTP protocols or URL user info', async () => {
    native.fetch.mockRejectedValue(new TypeError('fetch failed: do-not-display-this'));
    await expect(hostingFetch('https://forge.test')).rejects.toMatchObject({ code: 'network_failed', message: expect.stringContaining('system proxy') });
    for (const url of ['file:///etc/passwd', 'https://user:secret@forge.test']) await expect(hostingFetch(url)).rejects.toMatchObject({ code: 'invalid_url' });
    expect(native.fetch).toHaveBeenCalledTimes(1);
  });
});
