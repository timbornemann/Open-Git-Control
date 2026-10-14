import { net } from 'electron';
import { hostingManualFetch } from './HostingChromiumRequest';

export class HostingNetworkError extends Error {
  readonly status = 0;
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HostingNetworkError';
  }
}

/** Only recognized codes leave the process; raw fetch errors can contain credentials or OAuth codes. */
function networkCodes(reason: unknown): Set<string> {
  const pending: unknown[] = [reason];
  const seen = new Set<unknown>();
  const codes = new Set<string>();
  while (pending.length && seen.size < 16) {
    const value = pending.shift();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const error = value as { code?: unknown; message?: unknown; name?: unknown; cause?: unknown; errors?: unknown[] };
    for (const text of [error.code, error.message, error.name])
      if (typeof text === 'string')
        for (const code of text
          .slice(0, 8192)
          .toUpperCase()
          .match(/\b[A-Z][A-Z_\d]{2,}\b/g) || [])
          codes.add(code);
    pending.push(error.cause);
    if (Array.isArray(error.errors)) pending.push(...error.errors.slice(0, 16));
  }
  return codes;
}

export function hostingNetworkError(reason: unknown, url: URL, signal?: AbortSignal | null): HostingNetworkError {
  const codes = networkCodes(reason);
  const has = (...expected: string[]) => expected.some((code) => codes.has(code));
  const server = url.origin;
  if (signal?.aborted || has('ABORTERROR', 'ERR_ABORTED', 'TIMEOUTERROR')) {
    const timedOut = signal?.reason?.name === 'TimeoutError' || has('TIMEOUTERROR');
    return new HostingNetworkError(
      timedOut ? 'request_timeout' : 'request_cancelled',
      timedOut ? `The request to ${server} timed out.` : 'Hosting request cancelled.',
    );
  }
  if (
    has(
      'ERR_CERT_AUTHORITY_INVALID',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_UNTRUSTED',
    )
  )
    return new HostingNetworkError(
      'certificate_untrusted',
      `The TLS certificate for ${server} is not trusted. For a local Caddy server, install its root CA certificate in this device's trusted certificate store, restart Open-Git-Control, and try again.`,
    );
  if (has('ERR_CERT_DATE_INVALID', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID'))
    return new HostingNetworkError(
      'certificate_date_invalid',
      `The TLS certificate for ${server} has expired or is not yet valid. Check the device clock and renew the server certificate.`,
    );
  if (has('ERR_CERT_COMMON_NAME_INVALID', 'ERR_TLS_CERT_ALTNAME_INVALID'))
    return new HostingNetworkError(
      'certificate_hostname_mismatch',
      `The TLS certificate does not match ${server}. Use the hostname covered by the certificate or correct the reverse proxy certificate.`,
    );
  if (has('ERR_CERT_REVOKED'))
    return new HostingNetworkError('certificate_revoked', `The TLS certificate for ${server} was revoked. Replace the server certificate.`);
  if (has('ERR_NAME_NOT_RESOLVED', 'ENOTFOUND', 'EAI_AGAIN'))
    return new HostingNetworkError('dns_failed', `The server name for ${server} could not be resolved. Check the server URL, local DNS, and VPN connection.`);
  if (has('ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_NO_SUPPORTED_PROXIES'))
    return new HostingNetworkError(
      'proxy_failed',
      `The proxy connection to ${server} failed. Check the system proxy and whether local servers must bypass it.`,
    );
  if (has('ERR_CONNECTION_REFUSED', 'ECONNREFUSED'))
    return new HostingNetworkError(
      'connection_refused',
      `The connection to ${server} was refused. Check that Forgejo or the reverse proxy is running and that the port is correct.`,
    );
  if (has('ERR_CONNECTION_TIMED_OUT', 'ERR_TIMED_OUT', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'))
    return new HostingNetworkError('request_timeout', `The connection to ${server} timed out. Check the server, firewall, and VPN connection.`);
  if (has('ERR_ADDRESS_UNREACHABLE', 'ERR_INTERNET_DISCONNECTED', 'ENETUNREACH', 'EHOSTUNREACH'))
    return new HostingNetworkError('server_unreachable', `The server ${server} is unreachable. Check the local network, VPN, and firewall.`);
  if ([...codes].some((code) => code.startsWith('ERR_CERT_') || code.startsWith('ERR_SSL_') || code.startsWith('ERR_TLS_')))
    return new HostingNetworkError(
      'tls_failed',
      `The secure connection to ${server} failed. Check the server certificate chain and TLS configuration of the reverse proxy.`,
    );
  return new HostingNetworkError(
    'network_failed',
    `Could not connect to ${server}. Check the server URL, certificate trust, network, and system proxy settings.`,
  );
}

/** Chromium uses the device's certificate trust and proxy configuration. TLS verification remains enabled. */
export const hostingFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new HostingNetworkError('invalid_url', 'Invalid hosting URL.');
  try {
    if (init?.redirect === 'manual') return await hostingManualFetch(new Request(input, { ...init, credentials: 'omit', cache: 'no-store' }));
    return await net.fetch(input instanceof URL ? input.href : input, {
      ...init,
      credentials: 'omit',
      cache: 'no-store',
      bypassCustomProtocolHandlers: true,
    });
  } catch (reason) {
    throw hostingNetworkError(reason, url, init?.signal);
  }
};
