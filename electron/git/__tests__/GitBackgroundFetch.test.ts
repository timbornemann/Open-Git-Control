import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as net from 'node:net';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { BackgroundFetchPreemptedError } from '../BackgroundFetchPreemptedError';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';

const fixtures: { lifecycle: GitIntegrationLifecycle; root: string; server: net.Server; sockets: Set<net.Socket> }[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.lifecycle.close();
    for (const socket of fixture.sockets) socket.destroy();
    await new Promise<void>((resolve) => {
      fixture.server.close(() => resolve());
    });
    fs.rmSync(fixture.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe('real automatic fetch preemption', () => {
  it.each([
    { command: 'add', linked: false },
    { command: 'commit', linked: false },
    { command: 'add', linked: true },
  ])(
    'lets $command finish while the remote never answers (linked worktree: $linked), and can fetch again afterwards',
    async ({ command, linked }) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-background-fetch-'));
      const lifecycle = new GitIntegrationLifecycle();
      const sockets = new Set<net.Socket>();
      const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('error', () => {});
      });
      fixtures.push({ lifecycle, root, server, sockets });
      await lifecycle.track(
        (async () => {
          server.listen(0, '127.0.0.1');
          await once(server, 'listening', { signal: lifecycle.signal });
          const repo = path.join(root, 'main');
          fs.mkdirSync(repo);
          await lifecycle.git(repo, 'init');
          await lifecycle.git(repo, 'config', 'user.name', 'Fetch Test');
          await lifecycle.git(repo, 'config', 'user.email', 'fetch@example.test');
          await lifecycle.git(repo, '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Initial');
          const workingTree = linked ? path.join(root, 'linked') : repo;
          if (linked) await lifecycle.git(repo, 'worktree', 'add', '-b', 'linked', workingTree);
          fs.writeFileSync(path.join(workingTree, 'changed.txt'), 'A local change\n');
          if (command === 'commit') await lifecycle.git(workingTree, 'add', 'changed.txt');

          const connected = once(server, 'connection', { signal: lifecycle.signal });
          const url = `git://127.0.0.1:${(server.address() as net.AddressInfo).port}/stalled.git`;
          const fetch = lifecycle.runner.streamOutput(
            repo,
            ['-c', 'protocol.git.allow=always', 'fetch', '--no-auto-maintenance', '--no-tags', url],
            () => {},
            undefined,
            { backgroundFetch: true },
          );
          const outcome = fetch.catch((error: Error) => error);
          const [socket] = await connected;
          // The server receives the request but deliberately sends no response.
          await once(socket, 'data', { signal: lifecycle.signal });
          const args = command === 'add' ? ['add', '--', 'changed.txt'] : ['-c', 'commit.gpgsign=false', 'commit', '-m', 'Local commit'];
          await lifecycle.runner.run(workingTree, args);
          expect(await outcome).toBeInstanceOf(BackgroundFetchPreemptedError);
          expect(fs.existsSync(path.join(repo, '.git', 'index.lock'))).toBe(false);
          if (command === 'add') expect(await lifecycle.git(workingTree, 'diff', '--cached', '--name-only')).toBe('changed.txt');
          else expect(await lifecycle.git(workingTree, 'log', '-1', '--format=%s')).toBe('Local commit');
          await expect(
            lifecycle.runner.streamOutput(repo, ['fetch', '--no-auto-maintenance', '.', 'HEAD'], () => {}, undefined, { backgroundFetch: true }),
          ).resolves.toBe('');
        })(),
      );
    },
    60_000,
  );
});
