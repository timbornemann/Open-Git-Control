export type HostingTokenGetter = () => string | Promise<string>;
export type HostingFetch = typeof fetch;

export class HostingHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'HostingHttpError';
  }
}

export interface HostingHttpOptions {
  baseUrl: string;
  getToken: HostingTokenGetter;
  fetch?: HostingFetch;
  authorizationScheme?: 'Bearer' | 'token' | 'raw';
  trustedUploadBaseUrl?: string;
  timeoutMs?: number;
}

export interface HostingHttpRequest {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Connection-local transport. Pagination cannot select another host or API. */
export class HostingHttpTransport {
  readonly baseUrl: URL;
  private readonly fetchImpl: HostingFetch;
  private blockedUntil = 0;

  constructor(private readonly options: HostingHttpOptions) {
    this.baseUrl = this.validateUrl(options.baseUrl);
    this.baseUrl.pathname = this.baseUrl.pathname.replace(/\/$/, '') + '/';
    this.fetchImpl = options.fetch ?? fetch;
  }

  private validateUrl(value: string): URL {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new HostingHttpError(0, 'invalid_url', 'Invalid hosting URL.');
    }
    return url;
  }

  private isApiUrl(url: URL): boolean {
    return url.origin === this.baseUrl.origin && url.pathname.startsWith(this.baseUrl.pathname);
  }

  url(path: string, query?: HostingHttpRequest['query']): URL {
    const url = this.validateUrl(new URL(path.replace(/^\//, ''), this.baseUrl).href);
    if (!this.isApiUrl(url)) throw new HostingHttpError(0, 'invalid_cursor', 'Pagination must stay inside the configured hosting API.');
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  async request(path: string, params: HostingHttpRequest = {}): Promise<Response> {
    const url = this.url(path, params.query);
    return this.send(url, params, true);
  }

  async upload(path: string, params: HostingHttpRequest): Promise<Response> {
    if (!this.options.trustedUploadBaseUrl) return this.request(path, params);
    const base = this.validateUrl(this.options.trustedUploadBaseUrl.replace(/\/$/, '') + '/');
    const url = this.validateUrl(new URL(path.replace(/^\//, ''), base).href);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new HostingHttpError(0, 'invalid_upload_url', 'Invalid release asset upload URL.');
    }
    for (const [key, value] of Object.entries(params.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return this.send(url, params, true);
  }

  private async send(url: URL, params: HostingHttpRequest, authenticated: boolean): Promise<Response> {
    if (authenticated && this.blockedUntil > Date.now())
      throw new HostingHttpError(
        429,
        'rate_limited',
        'This hosting account is waiting for its API rate limit to reset.',
        Math.ceil((this.blockedUntil - Date.now()) / 1000),
      );
    const token = authenticated ? await this.options.getToken() : '';
    if (authenticated && !token) throw new HostingHttpError(401, 'authentication_required', 'Sign in to this hosting connection first.');
    if (/[\r\n]/.test(token)) throw new HostingHttpError(401, 'invalid_credentials', 'Invalid hosting credentials.');
    const headers = new Headers(params.headers);
    if (!authenticated) {
      headers.delete('Authorization');
      headers.delete('Cookie');
    }
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (token) headers.set('Authorization', this.options.authorizationScheme === 'raw' ? token : `${this.options.authorizationScheme ?? 'Bearer'} ${token}`);
    let body = params.rawBody;
    if (params.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(params.body);
    }
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
    const signal = params.signal ? AbortSignal.any([params.signal, timeout]) : timeout;
    const response = await this.fetchImpl(url, { method: params.method ?? 'GET', body, headers, redirect: 'manual', signal });
    const { rateLimited, retryAfter } = this.observeRateLimit(response, authenticated);
    if (response.status >= 300 && response.status < 400) return response;
    if (!response.ok) {
      // Error bodies can include remote URLs and credentials; do not surface them.
      await response.body?.cancel();
      const code = rateLimited
        ? 'rate_limited'
        : response.status === 401
          ? 'authentication_required'
          : response.status === 403
            ? 'permission_denied'
            : response.status === 404
              ? 'not_found'
              : 'provider_error';
      throw new HostingHttpError(
        rateLimited ? 429 : response.status,
        code,
        rateLimited ? `Hosting API rate limit reached. Retry after ${retryAfter} seconds.` : `Hosting API returned HTTP ${response.status}.`,
        retryAfter,
      );
    }
    return response;
  }

  private observeRateLimit(response: Response, authenticated: boolean): { rateLimited: boolean; retryAfter: number | null } {
    const retryHeader = response.headers.get('retry-after');
    const remaining = response.headers.get('x-ratelimit-remaining') ?? response.headers.get('ratelimit-remaining');
    const rateLimited = response.status === 429 || (response.status === 403 && (remaining === '0' || Boolean(retryHeader)));
    const reset = Number(response.headers.get('x-ratelimit-reset') ?? response.headers.get('ratelimit-reset')) * 1000;
    const retryAt = retryHeader && /^\d+$/.test(retryHeader) ? Date.now() + Number(retryHeader) * 1000 : Date.parse(retryHeader ?? '');
    const until = Math.max(Date.now() + (rateLimited ? 1000 : 0), retryAt || reset || Date.now() + 60_000);
    if (authenticated && (rateLimited || remaining === '0')) this.blockedUntil = until;
    return { rateLimited, retryAfter: rateLimited ? Math.ceil((until - Date.now()) / 1000) : null };
  }

  async json<T = unknown>(path: string, params: HostingHttpRequest = {}): Promise<{ data: T; headers: Headers }> {
    const response = await this.request(path, params);
    if (response.status >= 300 && response.status < 400)
      throw new HostingHttpError(response.status, 'unexpected_redirect', 'Hosting API unexpectedly redirected.');
    if (response.status === 204 || response.headers.get('content-length') === '0') return { data: undefined as T, headers: response.headers };
    const bytes = await this.readBounded(response, 16 * 1024 * 1024);
    try {
      return { data: JSON.parse(new TextDecoder().decode(bytes)) as T, headers: response.headers };
    } catch {
      throw new HostingHttpError(response.status, 'invalid_response', 'Hosting API returned invalid JSON.');
    }
  }

  async text(path: string, params: HostingHttpRequest = {}, maxBytes = 8 * 1024 * 1024): Promise<string> {
    return new TextDecoder().decode(await this.download(path, params, maxBytes));
  }

  /** Signed downloads may redirect; credentials never follow to another origin. */
  async download(path: string, params: HostingHttpRequest = {}, maxBytes = 512 * 1024 * 1024): Promise<Uint8Array> {
    return this.readBounded(await this.downloadResponse(path, params), maxBytes);
  }

  async textLog(path: string, params: HostingHttpRequest = {}, limit = 2 * 1024 * 1024): Promise<{ text: string; truncated: boolean; nextCursor: null }> {
    const response = await this.downloadResponse(path, params);
    const reader = response.body?.getReader();
    if (!reader) return { text: '', truncated: false, nextCursor: null };
    const chunks: Uint8Array[] = [];
    let length = 0;
    let truncated = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = value.subarray(0, Math.max(0, limit - length));
        chunks.push(part);
        length += part.length;
        if (part.length !== value.length) {
          truncated = true;
          await reader.cancel();
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { text: new TextDecoder().decode(bytes), truncated, nextCursor: null };
  }

  private async downloadResponse(path: string, params: HostingHttpRequest): Promise<Response> {
    let url = this.url(path, params.query);
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      // A same-host redirect can leave the configured API (for example for
      // user-controlled uploads). The token is scoped to the API path too.
      const response = await this.send(url, params, this.isApiUrl(url));
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new HostingHttpError(response.status, 'invalid_redirect', 'Download redirect has no location.');
      const next = this.validateUrl(new URL(location, url).href);
      if (url.protocol === 'https:' && next.protocol !== 'https:') throw new HostingHttpError(0, 'invalid_redirect', 'Download cannot downgrade HTTPS.');
      const storageHosts = ['amazonaws.com', 'storage.googleapis.com', 'blob.core.windows.net', 'githubusercontent.com', 'atlassian.net'];
      if (
        next.origin !== this.baseUrl.origin &&
        (next.protocol !== 'https:' || !storageHosts.some((host) => next.hostname === host || next.hostname.endsWith('.' + host)))
      ) {
        throw new HostingHttpError(
          0,
          'untrusted_download_host',
          'Download redirected to an unconfigured storage host. Open the artifact on the hosting website.',
        );
      }
      url = next;
    }
    throw new HostingHttpError(0, 'redirect_limit', 'Download redirected too many times.');
  }

  private async readBounded(response: Response, limit: number): Promise<Uint8Array> {
    const announced = Number(response.headers.get('content-length'));
    if (Number.isFinite(announced) && announced > limit) {
      await response.body?.cancel();
      throw new HostingHttpError(0, 'response_too_large', 'Hosting response exceeds the download limit.');
    }
    const reader = response.body?.getReader();
    if (!reader) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
          await reader.cancel();
          throw new HostingHttpError(0, 'response_too_large', 'Hosting response exceeds the download limit.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}
