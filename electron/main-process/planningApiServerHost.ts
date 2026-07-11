import * as http from 'http';
import * as crypto from 'crypto';
import { URL } from 'url';
import type {
  ApiEnvelope,
  HttpMethod,
  JsonObject,
  McpRpcHandler,
  PlanningApiServerHandle,
  PlanningApiServerOptions,
  PlanningRouteHandler,
} from './planningApiTypes';
import { AUTH_BEARER_PREFIX, AUTH_HEADER_NAME, ApiError, DEFAULT_HOST, DEFAULT_PORT, MAX_BODY_BYTES, PORT_SEARCH_LIMIT } from './planningApiTypes';

type PlanningApiHostDeps = {
  routeApi: PlanningRouteHandler;
  handleMcpRpc: McpRpcHandler;
};

type McpBodyReadResult =
  | {
      kind: 'payload';
      payload: unknown;
    }
  | {
      kind: 'parse-error';
    };

const cleanString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const createAuthToken = (configuredToken?: string): string => {
  const configured = cleanString(configuredToken ?? process.env.OPEN_GIT_CONTROL_API_TOKEN);
  if (configured.length >= 16) return configured;
  return crypto.randomBytes(32).toString('base64url');
};

const headerValue = (value: string | string[] | undefined): string => (Array.isArray(value) ? String(value[0] || '') : String(value || ''));

const isAllowedCorsOrigin = (origin: string): boolean => {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const protocolAllowed = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const hostname = parsed.hostname.toLowerCase();
    return protocolAllowed && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]');
  } catch {
    return false;
  }
};

const timingSafeTokenEquals = (candidate: string, expected: string): boolean => {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  if (candidateBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
};

const getRequestAuthToken = (request: http.IncomingMessage): string => {
  const headerToken = headerValue(request.headers[AUTH_HEADER_NAME]);
  if (headerToken) return headerToken.trim();

  const authorization = headerValue(request.headers.authorization).trim();
  if (authorization.toLowerCase().startsWith(AUTH_BEARER_PREFIX)) {
    return authorization.slice(AUTH_BEARER_PREFIX.length).trim();
  }
  return '';
};

const isPublicApiRequest = (url: URL, method: HttpMethod): boolean => {
  if (method !== 'GET') return false;
  return url.pathname === '/' || url.pathname === '/api' || url.pathname === '/api/' || url.pathname === '/api/health' || url.pathname === '/api/openapi.json';
};

const requireAuthorizedRequest = (request: http.IncomingMessage, url: URL, method: HttpMethod, authToken: string): void => {
  if (isPublicApiRequest(url, method)) return;
  const token = getRequestAuthToken(request);
  if (!token || !timingSafeTokenEquals(token, authToken)) {
    throw new ApiError(401, 'UNAUTHORIZED', `Missing or invalid API token. Provide it as ${AUTH_HEADER_NAME} or Authorization: Bearer <token>.`);
  }
};

const readJsonBody = async (request: http.IncomingMessage): Promise<JsonObject> =>
  new Promise((resolve, reject) => {
    const method = request.method || 'GET';
    if (method === 'GET' || method === 'DELETE' || method === 'OPTIONS') {
      resolve({});
      return;
    }

    let total = 0;
    let rejectedForSize = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      if (rejectedForSize) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        rejectedForSize = true;
        reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejectedForSize) return;
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new ApiError(400, 'INVALID_JSON', 'Request body must be a JSON object.'));
          return;
        }
        resolve(parsed as JsonObject);
      } catch {
        reject(new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON.'));
      }
    });
    request.on('error', reject);
  });

const readMcpBody = async (request: http.IncomingMessage): Promise<McpBodyReadResult> =>
  new Promise((resolve, reject) => {
    let total = 0;
    let rejectedForSize = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      if (rejectedForSize) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        rejectedForSize = true;
        reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejectedForSize) return;
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        reject(new ApiError(400, 'INVALID_JSON', 'Request body is required.'));
        return;
      }
      try {
        resolve({ kind: 'payload', payload: JSON.parse(text) });
      } catch {
        resolve({
          kind: 'parse-error',
        });
      }
    });
    request.on('error', reject);
  });

const jsonRpcParseError = () =>
  ({
    jsonrpc: '2.0',
    id: null,
    error: { code: -32700, message: 'Parse error' },
  }) as const;

export const createPlanningApiRequestHandler =
  (deps: PlanningApiHostDeps & { getAuthToken: () => string }) =>
  async (request: http.IncomingMessage, response: http.ServerResponse): Promise<void> => {
    setCommonHeaders(response, request);

    try {
      const method = (request.method || 'GET').toUpperCase() as HttpMethod;
      if (!['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      }
      if (method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url || '/', `http://${request.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);
      requireAuthorizedRequest(request, url, method, deps.getAuthToken());
      if (url.pathname === '/') {
        redirect(response, '/api/');
        return;
      }
      if (url.pathname === '/api') {
        redirect(response, '/api/');
        return;
      }
      if (url.pathname === '/mcp') {
        if (method !== 'POST') {
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'MCP endpoint expects HTTP POST with JSON-RPC payloads.');
        }
        const body = await readMcpBody(request);
        if (body.kind === 'parse-error') {
          sendJson(response, 200, jsonRpcParseError());
          return;
        }
        const rpcResponse = await deps.handleMcpRpc(body.payload);
        if (rpcResponse === null) {
          response.writeHead(204);
          response.end();
          return;
        }
        sendJson(response, 200, rpcResponse);
        return;
      }

      const segments = url.pathname.split('/').filter(Boolean);
      const baseUrl = `${url.protocol}//${url.host}`;
      const body = await readJsonBody(request);
      const result = await deps.routeApi({ method, url, segments, body, baseUrl });

      if (typeof result === 'string' && result.startsWith('<!doctype html>')) {
        sendHtml(response, 200, result);
        return;
      }
      sendJson(response, 200, { success: true, data: result } satisfies ApiEnvelope<unknown>);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
      sendJson(response, apiError.statusCode, {
        success: false,
        error: {
          code: apiError.code,
          message: apiError.message,
        },
      } satisfies ApiEnvelope<unknown>);
    }
  };

export async function startPlanningApiHost(options: PlanningApiServerOptions, deps: PlanningApiHostDeps): Promise<PlanningApiServerHandle> {
  const host = options.host || DEFAULT_HOST;
  const preferredPort = normalizePreferredPort(options.preferredPort ?? getConfiguredPort());
  const maxPortSearch = options.maxPortSearch ?? PORT_SEARCH_LIMIT;
  const staticAuthToken = createAuthToken(options.authToken);
  const getAuthToken = options.authTokenProvider || (() => staticAuthToken);
  const handler = createPlanningApiRequestHandler({
    ...deps,
    getAuthToken,
  });

  for (let offset = 0; offset <= maxPortSearch; offset += 1) {
    const port = preferredPort === 0 ? 0 : preferredPort + offset;
    try {
      const server = await listenOnPort(http.createServer(handler), host, port);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      return {
        host,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        get authToken() {
          return getAuthToken();
        },
        authHeaderName: AUTH_HEADER_NAME,
        close: () =>
          new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      };
    } catch (error) {
      if (!isAddressInUse(error) || preferredPort === 0 || offset === maxPortSearch) {
        throw error;
      }
    }
  }

  throw new Error('Unable to start planning API server.');
}

function listenOnPort(server: http.Server, host: string, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

const isAddressInUse = (error: unknown): boolean => Boolean(error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'EADDRINUSE');

const normalizePreferredPort = (port: number): number => {
  if (!Number.isFinite(port)) return DEFAULT_PORT;
  const normalized = Math.floor(port);
  if (normalized === 0) return 0;
  if (normalized < 1 || normalized > 65535) return DEFAULT_PORT;
  return normalized;
};

const getConfiguredPort = (): number => {
  const configured = Number(process.env.OPEN_GIT_CONTROL_API_PORT || '');
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PORT;
};

const setCommonHeaders = (response: http.ServerResponse, request?: http.IncomingMessage): void => {
  const origin = headerValue(request?.headers.origin);
  if (isAllowedCorsOrigin(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', `content-type, accept, mcp-protocol-version, authorization, ${AUTH_HEADER_NAME}`);
  response.setHeader('Access-Control-Max-Age', '86400');
  response.setHeader('Cache-Control', 'no-store');
};

const sendJson = (response: http.ServerResponse, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
};

const sendHtml = (response: http.ServerResponse, statusCode: number, html: string): void => {
  response.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
};

const redirect = (response: http.ServerResponse, location: string): void => {
  response.writeHead(302, { Location: location });
  response.end();
};
