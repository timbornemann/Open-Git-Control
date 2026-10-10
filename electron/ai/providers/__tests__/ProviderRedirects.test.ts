import { createServer, type Server } from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchWithTimeout } from '../providerUtils';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server address.');
  return `http://127.0.0.1:${address.port}`;
}

describe('AI endpoint redirects', () => {
  it('never forwards credential headers or prompt bodies to a redirected endpoint', async () => {
    let forwarded = false;
    const destination = await listen(
      createServer((_request, response) => {
        forwarded = true;
        response.end('unexpected');
      }),
    );
    const source = await listen(
      createServer((_request, response) => {
        response.writeHead(307, { Location: destination });
        response.end();
      }),
    );
    await expect(
      fetchWithTimeout(
        source,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': 'private-key' },
          body: 'private repository context',
        },
        1000,
      ),
    ).rejects.toThrow();
    expect(forwarded).toBe(false);
  });
});
