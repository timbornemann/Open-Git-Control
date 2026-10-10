import { describe, expect, it, vi } from 'vitest';
import { HostingHttpTransport } from '../HostingHttpTransport';

describe('download credential scope', () => {
  it('strips credentials when a same-origin redirect leaves the configured API', async () => {
    const getToken = vi.fn(() => 'private-token');
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/uploads/user-controlled/artifact' } }))
      .mockResolvedValueOnce(new Response('artifact'));
    const client = new HostingHttpTransport({ baseUrl: 'https://forge.example/api/v4', getToken, fetch: fetcher });
    await expect(client.text('projects/1/artifact', { headers: { Cookie: 'private-session', Authorization: 'Bearer caller-token' } })).resolves.toBe(
      'artifact',
    );
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer private-token');
    const redirectedHeaders = new Headers(fetcher.mock.calls[1][1].headers);
    expect(redirectedHeaders.get('Authorization')).toBeNull();
    expect(redirectedHeaders.get('Cookie')).toBeNull();
    expect(getToken).toHaveBeenCalledOnce();
  });

  it('preserves authentication for redirects inside the configured API', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/api/v4/projects/2/artifact' } }))
      .mockResolvedValueOnce(new Response('artifact'));
    const client = new HostingHttpTransport({ baseUrl: 'https://forge.example/api/v4', getToken: () => 'private-token', fetch: fetcher });
    await client.text('projects/1/artifact');
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer private-token');
  });
});
