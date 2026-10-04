import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostingHttpTransport } from '../HostingHttpTransport';

afterEach(() => vi.restoreAllMocks());
const transport = (fetcher: typeof fetch) => new HostingHttpTransport({ baseUrl: 'https://forge.example/api/v1', getToken: () => 'token', fetch: fetcher });
describe('connection-local API rate limits', () => {
  it('holds only the limited account and resumes after Retry-After', async () => {
    let now = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const leftFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '10' } }))
      .mockResolvedValue(new Response('{}'));
    const rightFetch = vi.fn().mockResolvedValue(new Response('{}'));
    const left = transport(leftFetch);
    await expect(left.json('user')).rejects.toMatchObject({ status: 429, retryAfter: 10 });
    await expect(left.json('user')).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(transport(rightFetch).json('user')).resolves.toHaveProperty('data');
    expect(leftFetch).toHaveBeenCalledTimes(1);
    now += 10_001;
    await expect(left.json('user')).resolves.toHaveProperty('data');
    expect(leftFetch).toHaveBeenCalledTimes(2);
  });
  it('distinguishes provider throttling from missing permissions and honors reset timestamps', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 403, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '120' } }));
    const client = transport(fetcher);
    await expect(client.json('repos')).rejects.toMatchObject({ status: 429, retryAfter: 20 });
    await expect(client.json('repos')).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const forbidden = transport(vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(forbidden.json('repos')).rejects.toMatchObject({ status: 403, code: 'permission_denied' });
  });
  it('applies HTTP-date Retry-After without delaying another connection', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    const client = transport(vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': new Date(130_000).toUTCString() } })));
    await expect(client.json('user')).rejects.toMatchObject({ retryAfter: 30 });
  });
});
