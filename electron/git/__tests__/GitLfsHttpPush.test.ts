import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteTransferService, type RemoteTransferContext } from '../RemoteTransferService';
import { RemotePreferencesStore } from '../RemotePreferencesStore';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import type { RemoteTransferProgressDto } from '../../../src/types/remoteTransferProgress';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const resources: Array<{ root: string; bare: string; lifecycle: GitIntegrationLifecycle; server: Server; acknowledge: () => void }> = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    resource.acknowledge();
    fs.writeFileSync(path.join(resource.bare, 'allow-push'), '');
    await resource.lifecycle.close();
    resource.server.closeAllConnections();
    await new Promise<void>((resolve) => {
      resource.server.close(() => resolve());
    });
    const resolved = path.resolve(resource.root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-lfs-http-')) throw new Error('Unsafe cleanup');
    await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

async function fixture(reject = false) {
  const lifecycle = new GitIntegrationLifecycle();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-lfs-http-'));
  const repo = path.join(root, 'working'),
    bare = path.join(root, 'remote.git');
  fs.mkdirSync(repo);
  fs.mkdirSync(bare);
  let acknowledge!: () => void;
  const ack = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const uploaded = new Map<string, Buffer>();
  const puts: string[] = [];
  let base = '';
  const server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/lfs/objects/batch') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { objects: Array<{ oid: string; size: number }> };
      response.writeHead(200, { 'Content-Type': 'application/vnd.git-lfs+json' });
      response.end(
        JSON.stringify({
          transfer: 'basic',
          objects: body.objects.map((object) => ({
            ...object,
            ...(uploaded.has(object.oid) ? {} : { actions: { upload: { href: `${base}/upload/${object.oid}` } } }),
          })),
        }),
      );
    } else if (request.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 25);
        });
      }
      const oid = request.url!.split('/').at(-1)!;
      puts.push(oid);
      if (reject) {
        response.writeHead(403);
        response.end('Upload refused by test server');
        return;
      }
      await ack;
      uploaded.set(oid, Buffer.concat(chunks));
      response.writeHead(200);
      response.end();
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  resources.push({ root, bare, lifecycle, server, acknowledge });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const git = lifecycle.git.bind(lifecycle);
  await git(repo, 'init', '-b', 'master');
  await git(bare, 'init', '--bare', '-b', 'master');
  for (const [key, value] of Object.entries({
    'user.name': 'LFS Test',
    'user.email': 'lfs@example.invalid',
    'commit.gpgsign': 'false',
    'core.autocrlf': 'false',
    'gc.auto': '0',
    'lfs.url': `${base}/lfs`,
    'lfs.transfer.maxretries': '1',
    'lfs.allowincompletepush': 'true',
  }))
    await git(repo, 'config', key, value);
  await git(repo, 'remote', 'add', 'origin', pathToFileURL(bare).href);
  const content = Buffer.alloc(4 * 1024 * 1024, 'actual LFS data');
  const oid = createHash('sha256').update(content).digest('hex');
  const object = path.join(repo, '.git', 'lfs', 'objects', oid.slice(0, 2), oid.slice(2, 4), oid);
  fs.mkdirSync(path.dirname(object), { recursive: true });
  fs.writeFileSync(object, content);
  fs.writeFileSync(path.join(repo, '.gitattributes'), 'asset.bin filter=lfs diff=lfs merge=lfs -text\n');
  fs.writeFileSync(path.join(repo, 'asset.bin'), `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${content.length}\n`);
  await git(repo, 'add', '.gitattributes', 'asset.bin');
  await git(repo, 'commit', '-m', 'feat: add large asset');
  // Retain the real LFS hook; the Git server separately delays publication.
  fs.writeFileSync(path.join(repo, '.git', 'hooks', 'pre-push'), '#!/bin/sh\ngit lfs pre-push "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bare, 'hooks', 'pre-receive'), '#!/bin/sh\ntouch push-started\nwhile [ ! -f allow-push ]; do sleep 0.1; done\n', { mode: 0o755 });
  const progress: RemoteTransferProgressDto[] = [];
  const messages: string[] = [];
  const context: RemoteTransferContext = {
    ownerId: 1,
    generation: 0,
    signal: lifecycle.signal,
    ensureActive: () => context.signal?.throwIfAborted(),
    authorizePush: async () => {},
    onProgress: (message, transfer) => {
      messages.push(message);
      if (transfer) progress.push(transfer);
    },
  };
  const service = new RemoteTransferService(lifecycle.runner, new RemotePreferencesStore(() => path.join(root, 'preferences.json')));
  const plan = await service.planPush(repo, { repoPath: repo, remoteNames: ['origin'] }, context);
  const refs = () => git(bare, 'for-each-ref', '--format=%(objectname)', 'refs/heads/master');
  return { lifecycle, root, repo, bare, object, content, oid, puts, uploaded, progress, messages, context, service, plan, refs, acknowledge };
}

describe('real LFS HTTP uploads followed by Git ref publication', () => {
  it('reports live bytes before acknowledgement and keeps publishing after LFS 100%, without needing a second command-line push', async () => {
    const f = await fixture();
    let finished = false;
    const run = f.lifecycle.track(f.service.executePush(f.repo, f.plan.id, f.context)).then((result) => {
      finished = true;
      return result;
    });
    await vi.waitFor(
      () =>
        expect(
          f.progress.some((p) => p.phase === 'lfs-upload' && (p.processedBytes ?? 0) > 0),
          f.messages.join('\n'),
        ).toBe(true),
      { timeout: 15000 },
    );
    expect(finished).toBe(false);
    expect(await f.refs()).toBe('');
    f.acknowledge();
    await vi.waitFor(() => expect(fs.existsSync(path.join(f.bare, 'push-started'))).toBe(true), { timeout: 15000 });
    expect(f.progress.some((p) => p.phase === 'lfs-finalizing')).toBe(true);
    expect(f.progress.at(-1)?.phase).toBe('publishing');
    expect(finished).toBe(false);
    expect(await f.refs()).toBe('');
    fs.writeFileSync(path.join(f.bare, 'allow-push'), '');
    expect((await run).state).toBe('success');
    expect(await f.refs()).toBe(f.plan.sourceOid);
    // Compare all bytes natively: a deep assertion walks millions of Buffer
    // entries and can exhaust the timeout under parallel Windows CI load.
    expect(f.uploaded.get(f.oid)?.equals(f.content)).toBe(true);
    expect(f.puts).toEqual([f.oid]);
    const next = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['origin'] }, f.context);
    expect((await f.service.executePush(f.repo, next.id, f.context)).targets[0].status).toBe('up-to-date');
    expect(f.puts).toHaveLength(1);
  }, 60000);

  it('keeps Git refs unpublished when the LFS server rejects the upload', async () => {
    const f = await fixture(true);
    const result = await f.lifecycle.track(f.service.executePush(f.repo, f.plan.id, f.context));
    expect(result.state).toBe('failed');
    expect(result.targets[0].message).toMatch(/403|refused|forbidden|authorization error/i);
    expect(f.uploaded.size).toBe(0);
    expect(await f.refs()).toBe('');
  }, 60000);

  it('does not publish missing objects even if the user configured incomplete LFS pushes', async () => {
    const f = await fixture();
    fs.rmSync(f.object);
    const result = await f.lifecycle.track(f.service.executePush(f.repo, f.plan.id, f.context));
    expect(result.state).toBe('failed');
    expect(result.targets[0].message).toMatch(/missing|corrupt|Unable to stat local media path/i);
    expect(await f.refs()).toBe('');
    expect(f.puts).toHaveLength(0);
  }, 60000);
});
