import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import { cleanupTransferFixtures, fixture, git } from './remoteTransferFixture';
import { RemoteTransferService } from '../RemoteTransferService';
import { remoteSyncReferenceVersion } from '../RemoteSyncReferences';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const lifecycles: GitIntegrationLifecycle[] = [];
function setup() {
  const lifecycle = new GitIntegrationLifecycle();
  lifecycles.push(lifecycle);
  const f = fixture(lifecycle);
  const target = f.bare('source');
  git(f.repo, 'remote', 'add', 'source', target);
  return { ...f, target };
}
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((lifecycle) => lifecycle.close()));
  vi.restoreAllMocks();
  await cleanupTransferFixtures();
}, 60_000);
const integration = (name: string, test: () => Promise<void>) => it(name, test, 60_000);

describe('combined branch and remote tag synchronization with real Git', () => {
  integration('uses one transfer, remote lookup and credential scope while preserving conflicting and local-only tags', async () => {
    const f = setup();
    git(f.repo, 'tag', 'release');
    git(f.repo, 'tag', 'local-only');
    const advanced = f.commit('published changes');
    git(f.repo, 'tag', '-a', 'annotated', '-m', 'release metadata');
    const annotated = git(f.repo, 'rev-parse', 'refs/tags/annotated');
    git(f.repo, 'push', f.target, `${advanced}:refs/heads/main`, `${advanced}:refs/tags/release`, 'refs/tags/annotated:refs/tags/new-release');
    git(f.repo, 'tag', '-d', 'annotated');
    git(f.repo, 'reset', '--hard', f.initial);
    git(f.repo, 'config', 'fetch.pruneTags', 'true');
    git(f.repo, 'config', 'remote.source.pruneTags', 'true');
    git(f.repo, 'config', 'remote.source.tagOpt', '--tags');
    const configured = git(f.repo, 'config', '--get-all', 'remote.source.fetch');
    const dispose = vi.fn();
    const credentials = vi.fn(async ({ envOverrides }: { envOverrides?: NodeJS.ProcessEnv }) => ({ envOverrides: envOverrides ?? {}, dispose }));
    const service = new RemoteTransferService(f.lifecycle.runner, f.store, credentials);
    const remotes = vi.spyOn(service, 'getRemotes');
    const stream = vi.spyOn(f.lifecycle.runner, 'streamOutput');
    const before = await remoteSyncReferenceVersion(f.repo, f.lifecycle.runner);

    await service.fetch(f.repo, 'source', f.context, { includeTags: true, background: true });

    expect(stream).toHaveBeenCalledOnce();
    expect(stream.mock.calls[0][1]).toEqual(expect.arrayContaining(['fetch', '--atomic', '--no-prune-tags', '--prune', '--no-tags']));
    expect(stream.mock.calls[0][4]?.backgroundFetch).toBe(true);
    expect(remotes).toHaveBeenCalledOnce();
    expect(credentials).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(git(f.repo, 'rev-parse', 'refs/remotes/source/main')).toBe(advanced);
    expect(git(f.repo, 'rev-parse', 'refs/ogc/remote-tags/source/release')).toBe(advanced);
    expect(git(f.repo, 'rev-parse', 'refs/tags/release')).toBe(f.initial);
    expect(git(f.repo, 'rev-parse', 'refs/tags/local-only')).toBe(f.initial);
    expect(git(f.repo, 'rev-parse', 'refs/tags/new-release')).toBe(annotated);
    expect(git(f.repo, 'config', '--get-all', 'remote.source.fetch')).toBe(configured);
    const changed = await remoteSyncReferenceVersion(f.repo, f.lifecycle.runner);
    expect(changed).not.toBe(before);
    await service.fetch(f.repo, 'source', f.context, { includeTags: true, background: true });
    expect(await remoteSyncReferenceVersion(f.repo, f.lifecycle.runner)).toBe(changed);
    git(f.repo, 'pack-refs', '--all');
    expect(await remoteSyncReferenceVersion(f.repo, f.lifecycle.runner)).toBe(changed);
    expect(f.lifecycle.runner.getSchedulerDiagnostics().filter((entry) => entry.kind === 'background-fetch')).toHaveLength(2);
  });

  integration('preserves narrow branch mappings, custom destinations and exclusions', async () => {
    const f = setup();
    git(f.repo, 'push', f.target, 'HEAD:refs/heads/release/public', 'HEAD:refs/heads/release/private', 'HEAD:refs/heads/other', 'HEAD:refs/tags/version');
    git(f.repo, 'config', '--replace-all', 'remote.source.fetch', '+refs/heads/release/*:refs/custom/releases/*');
    git(f.repo, 'config', '--add', 'remote.source.fetch', '^refs/heads/release/private');
    const before = git(f.repo, 'config', '--get-all', 'remote.source.fetch');
    await f.service.fetch(f.repo, 'source', f.context, { includeTags: true });
    expect(git(f.repo, 'for-each-ref', '--format=%(refname)', 'refs/custom')).toBe('refs/custom/releases/public');
    expect(git(f.repo, 'for-each-ref', '--format=%(refname)', 'refs/remotes')).toBe('');
    expect(git(f.repo, 'rev-parse', 'refs/ogc/remote-tags/source/version')).toBe(f.initial);
    expect(git(f.repo, 'rev-parse', 'refs/tags/version')).toBe(f.initial);
    expect(git(f.repo, 'config', '--get-all', 'remote.source.fetch')).toBe(before);
  });

  integration('prunes deleted branches and tracked tags without deleting or moving any existing local tags', async () => {
    const f = setup();
    git(f.repo, 'push', f.target, 'HEAD:refs/heads/main', 'HEAD:refs/heads/deleted', 'HEAD:refs/tags/deleted', 'HEAD:refs/tags/moved');
    await f.service.fetch(f.repo, 'source', f.context, { includeTags: true });
    const before = await remoteSyncReferenceVersion(f.repo, f.lifecycle.runner);
    const moved = f.commit('new tag target');
    git(f.repo, 'push', f.target, ':refs/heads/deleted', ':refs/tags/deleted', `+${moved}:refs/tags/moved`);
    await f.service.fetch(f.repo, 'source', f.context, { includeTags: true });
    expect(git(f.repo, 'for-each-ref', '--format=%(refname)', 'refs/remotes/source/deleted', 'refs/ogc/remote-tags/source/deleted')).toBe('');
    expect(git(f.repo, 'rev-parse', 'refs/tags/deleted')).toBe(f.initial);
    expect(git(f.repo, 'rev-parse', 'refs/tags/moved')).toBe(f.initial);
    expect(git(f.repo, 'rev-parse', 'refs/ogc/remote-tags/source/moved')).toBe(moved);
    expect(await remoteSyncReferenceVersion(f.repo, f.lifecycle.runner)).not.toBe(before);
  });

  integration('retries a batch if a local tag was created in the meantime, preserving that tag and adopting the others', async () => {
    const f = setup();
    const remote = f.commit('remote version');
    git(f.repo, 'push', f.target, `${remote}:refs/heads/main`, `${remote}:refs/tags/racing`, `${remote}:refs/tags/other`);
    const input = f.lifecycle.runner.runWithInput.bind(f.lifecycle.runner);
    const batches = vi.spyOn(f.lifecycle.runner, 'runWithInput').mockImplementationOnce(async (repo, args, content, options) => {
      git(f.repo, 'tag', 'racing', f.initial);
      return input(repo, args, content, options);
    });
    await f.service.fetch(f.repo, 'source', f.context, { includeTags: true });
    expect(batches).toHaveBeenCalledTimes(2);
    expect(git(f.repo, 'rev-parse', 'refs/tags/racing')).toBe(f.initial);
    expect(git(f.repo, 'rev-parse', 'refs/tags/other')).toBe(remote);
  });

  integration('reports genuine adoption failures and does not partially create a batch of local tags', async () => {
    const f = setup();
    git(f.repo, 'push', f.target, 'HEAD:refs/heads/main', 'HEAD:refs/tags/a', 'HEAD:refs/tags/b');
    const directory = path.join(f.repo, '.git', 'refs', 'tags');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'b.lock'), 'owned by another operation');
    await expect(f.service.fetch(f.repo, 'source', f.context, { includeTags: true })).rejects.toThrow('b.lock');
    expect(git(f.repo, 'tag', '--list')).toBe('');
    expect(fs.readFileSync(path.join(directory, 'b.lock'), 'utf8')).toBe('owned by another operation');
  });

  integration('does not adopt tags after the repository context has changed', async () => {
    const f = setup();
    git(f.repo, 'push', f.target, 'HEAD:refs/heads/main', 'HEAD:refs/tags/new');
    const stream = f.lifecycle.runner.streamOutput.bind(f.lifecycle.runner);
    vi.spyOn(f.lifecycle.runner, 'streamOutput').mockImplementationOnce(async (...args) => {
      const output = await stream(...args);
      vi.mocked(f.context.ensureActive).mockImplementation(() => {
        throw new Error('Repository changed');
      });
      return output;
    });
    await expect(f.service.fetch(f.repo, 'source', f.context, { includeTags: true })).rejects.toThrow('Repository changed');
    expect(git(f.repo, 'tag', '--list')).toBe('');
  });
});
