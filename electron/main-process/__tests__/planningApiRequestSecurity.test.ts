import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as http from 'http';
import { startPlanningApiHost } from '../planningApiServerHost';
import type { PlanningApiServerHandle } from '../planningApiTypes';

describe('Planning API request boundary', () => {
  let server: PlanningApiServerHandle | null = null;
  const routeApi = vi.fn(async () => ({ status: 'ok' }));
  const handleMcpRpc = vi.fn(async () => ({ jsonrpc: '2.0', id: 1, result: {} }));

  const request = (
    target = '/api/health',
    options: { method?: string; headers?: http.OutgoingHttpHeaders; body?: string } = {},
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> => {
    if (!server) throw new Error('Server not started.');
    // Raw header pairs preserve duplicate and missing Host headers under test.
    const headers = Object.entries({ Host: new URL(server.url).host, ...options.headers }).flatMap(([name, value]) =>
      value === undefined ? [] : (Array.isArray(value) ? value : [value]).flatMap((entry) => [name, String(entry)]),
    );
    return new Promise((resolve, reject) => {
      const outgoing = http.request(
        server!.url,
        {
          method: options.method || 'GET',
          path: target,
          agent: false,
          setHost: false,
          headers,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
        },
      );
      outgoing.on('error', reject);
      outgoing.end(options.body);
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startPlanningApiHost({ preferredPort: 0, maxPortSearch: 0, authToken: 'request-boundary-test-token' }, { routeApi, handleMcpRpc });
  });

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  const authHeaders = (): http.OutgoingHttpHeaders => ({ [server!.authHeaderName]: server!.authToken });

  const expectBlocked = (result: Awaited<ReturnType<typeof request>>, code: string): void => {
    expect(result.status).toBe(403);
    expect(JSON.parse(result.body)).toMatchObject({ success: false, error: { code } });
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
    expect(result.headers['access-control-allow-headers']).toBeUndefined();
    expect(result.headers['cache-control']).toBe('no-store');
    expect(routeApi).not.toHaveBeenCalled();
    expect(handleMcpRpc).not.toHaveBeenCalled();
  };

  it('preserves authenticated native REST and MCP clients without an Origin header', async () => {
    const rest = await request('/api/projects', { headers: authHeaders() });
    expect(rest.status).toBe(200);
    expect(rest.headers['access-control-allow-origin']).toBeUndefined();
    expect(routeApi).toHaveBeenCalledOnce();

    const mcp = await request('/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${server!.authToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(mcp.status).toBe(200);
    expect(handleMcpRpc).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 1, method: 'ping' });
  });

  it.each(['127.0.0.1', 'localhost', '[::1]'])('accepts the loopback authority %s only on the actual listening port', async (hostname) => {
    const authority = `${hostname}:${server!.port}`;
    const result = await request('/api/projects', { headers: { ...authHeaders(), Host: authority, Origin: `http://${authority}` } });
    expect(result.status).toBe(200);
    expect(result.headers['access-control-allow-origin']).toBe(`http://${authority}`);
    expect(routeApi).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: `http://${authority}` }));
  });

  it('allows same-origin preflight without bypassing authentication on the subsequent request', async () => {
    const preflight = await request('/mcp', {
      method: 'OPTIONS',
      headers: { Origin: server!.url, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': server!.authHeaderName },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.body).toBe('');
    expect(preflight.headers['access-control-allow-origin']).toBe(server!.url);
    expect(preflight.headers['access-control-allow-methods']).toContain('POST');
    expect(preflight.headers['access-control-allow-headers']).toContain(server!.authHeaderName);
    expect(preflight.headers.vary).toBe('Origin');

    const unauthorized = await request('/mcp', { method: 'POST', headers: { Origin: server!.url }, body: '{}' });
    expect(unauthorized.status).toBe(401);
    expect(routeApi).not.toHaveBeenCalled();
    expect(handleMcpRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/'],
    ['GET', '/api/'],
    ['GET', '/api/health'],
    ['GET', '/api/openapi.json'],
    ['POST', '/api/projects'],
    ['POST', '/mcp'],
    ['OPTIONS', '/mcp'],
  ])('rejects an untrusted Origin before handling %s %s, even with a valid token', async (method, target) => {
    const result = await request(target, {
      method,
      headers: { ...authHeaders(), Origin: 'https://attacker.example' },
      body: method === 'POST' ? '{}' : undefined,
    });
    expectBlocked(result, 'FORBIDDEN_ORIGIN');
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])('rejects a different service on %s', async (hostname) => {
    const otherPort = server!.port === 65535 ? 65534 : server!.port + 1;
    const result = await request('/mcp', { method: 'OPTIONS', headers: { Origin: `http://${hostname}:${otherPort}` } });
    expectBlocked(result, 'FORBIDDEN_ORIGIN');
  });

  it.each(['null', '', 'file://', 'http://localhost', 'https://localhost', 'https://127.0.0.1', 'http://localhost.attacker.example'])(
    'rejects the Origin %j',
    async (origin) => {
      const result = await request('/api/projects', { headers: { ...authHeaders(), Origin: origin } });
      expectBlocked(result, 'FORBIDDEN_ORIGIN');
    },
  );

  it('rejects HTTPS, a different loopback hostname, and malformed forms of its own Origin', async () => {
    for (const origin of [
      `https://${new URL(server!.url).host}`,
      `http://localhost:${server!.port}`,
      `${server!.url}/`,
      `${server!.url}/api`,
      `${server!.url}?query`,
      `${server!.url}#fragment`,
      `http://user@${new URL(server!.url).host}`,
    ]) {
      const result = await request('/api/projects', { headers: { ...authHeaders(), Origin: origin } });
      expectBlocked(result, 'FORBIDDEN_ORIGIN');
    }
  });

  it.each([
    ['GET', '/'],
    ['GET', '/api/health'],
    ['GET', '/api/openapi.json'],
    ['POST', '/api/projects'],
    ['POST', '/mcp'],
    ['OPTIONS', '/mcp'],
  ])('rejects a rebinding Host before handling %s %s', async (method, target) => {
    const result = await request(target, {
      method,
      headers: { ...authHeaders(), Host: `attacker.example:${server!.port}` },
      body: method === 'POST' ? '{}' : undefined,
    });
    expectBlocked(result, 'INVALID_HOST');
  });

  it('rejects incorrect ports, host lookalikes, and ambiguous authority forms', async () => {
    const authority = new URL(server!.url).host;
    for (const host of [
      '127.0.0.1',
      `127.0.0.1:${server!.port === 65535 ? 65534 : server!.port + 1}`,
      `localhost.attacker.example:${server!.port}`,
      `127.0.0.1.attacker.example:${server!.port}`,
      `user@${authority}`,
      `${authority}/api`,
      `${authority}#fragment`,
      `${authority}, attacker.example`,
      '',
    ]) {
      const result = await request('/api/health', { headers: { Host: host } });
      expectBlocked(result, 'INVALID_HOST');
    }
  });

  it('rejects duplicate Host and Origin headers instead of trusting the first value', async () => {
    const host = await request('/api/health', { headers: { Host: [new URL(server!.url).host, 'attacker.example'] } });
    expectBlocked(host, 'INVALID_HOST');

    const origin = await request('/api/health', { headers: { Origin: [server!.url, 'https://attacker.example'] } });
    expectBlocked(origin, 'FORBIDDEN_ORIGIN');
  });

  it('rejects a missing Host header', async () => {
    const result = await request('/api/health', { headers: { Host: undefined } });
    // Newer Node HTTP parsers may reject a missing HTTP/1.1 Host before dispatch.
    expect([400, 403]).toContain(result.status);
    expect(routeApi).not.toHaveBeenCalled();
    expect(handleMcpRpc).not.toHaveBeenCalled();
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not trust forwarding headers or use them in generated URLs', async () => {
    const headers = { Forwarded: 'host=attacker.example;proto=https', 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'https' };
    const result = await request('/api/health', { headers });
    expect(result.status).toBe(200);
    expect(routeApi).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: server!.url }));
    routeApi.mockClear();

    const rebinding = await request('/api/health', { headers: { Host: 'attacker.example', 'X-Forwarded-Host': new URL(server!.url).host } });
    expectBlocked(rebinding, 'INVALID_HOST');
  });

  it('rejects request targets that override a valid Host header', async () => {
    for (const target of [
      'http://attacker.example/api/health',
      '//attacker.example/api/health',
      '/\\attacker.example/api/health',
      `http://user@${new URL(server!.url).host}/api/health`,
    ]) {
      const result = await request(target);
      expect(result.status).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST_TARGET' } });
      expect(result.headers['access-control-allow-origin']).toBeUndefined();
    }
    expect(routeApi).not.toHaveBeenCalled();
  });

  it('preserves valid absolute-form URLs for native HTTP clients', async () => {
    const result = await request(`${server!.url}/api/health`);
    expect(result.status).toBe(200);
    expect(routeApi).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: server!.url, segments: ['api', 'health'] }));
  });

  it('uses the actual fallback port when the preferred port is occupied', async () => {
    const occupied = server!;
    server = await startPlanningApiHost(
      { preferredPort: occupied.port, maxPortSearch: 5, authToken: 'request-boundary-test-token' },
      { routeApi, handleMcpRpc },
    );
    try {
      expect(server.port).toBeGreaterThan(occupied.port);
      const allowed = await request('/api/health', { headers: { Origin: server.url } });
      expect(allowed.status).toBe(200);
      routeApi.mockClear();
      const stale = await request('/api/health', { headers: { Host: new URL(occupied.url).host } });
      expectBlocked(stale, 'INVALID_HOST');
    } finally {
      await occupied.close();
    }
  });

  it('supports an explicitly configured IPv6 loopback listener', async () => {
    await server!.close();
    server = null;
    server = await startPlanningApiHost({ host: '::1', preferredPort: 0, authToken: 'request-boundary-test-token' }, { routeApi, handleMcpRpc });
    expect(server.url).toBe(`http://[::1]:${server.port}`);
    const result = await request('/api/projects', { headers: { ...authHeaders(), Origin: server.url } });
    expect(result.status).toBe(200);
    expect(routeApi).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: server.url }));
  });
});
