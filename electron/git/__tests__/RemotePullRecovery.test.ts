import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import { cleanupTransferFixtures, fixture, git } from './remoteTransferFixture';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const lifecycles: GitIntegrationLifecycle[] = [];
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((lifecycle) => lifecycle.close()));
  vi.restoreAllMocks();
  await cleanupTransferFixtures();
}, 60_000);

function mergedFeature() {
  const lifecycle = new GitIntegrationLifecycle();
  lifecycles.push(lifecycle);
  const f = fixture(lifecycle);
  const server = f.bare('server');
  git(server, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(f.repo, 'remote', 'add', 'origin', server);
  git(f.repo, 'push', '-u', 'origin', 'main');
  git(f.repo, 'checkout', '-b', 'test-branch');
  git(f.repo, 'push', '-u', 'origin', 'test-branch');
  const feature = f.commit('feature changes');
  git(f.repo, 'push', 'origin', 'test-branch');
  const peer = path.join(f.root, 'maintainer');
  git(f.root, 'clone', server, peer);
  git(peer, 'config', 'user.name', 'Maintainer');
  git(peer, 'config', 'user.email', 'maintainer@example.invalid');
  git(peer, 'config', 'commit.gpgsign', 'false');
  git(peer, 'merge', '--no-ff', '-m', 'Merge pull request', 'origin/test-branch');
  const merged = git(peer, 'rev-parse', 'HEAD');
  git(peer, 'push', 'origin', 'main');
  git(peer, 'push', 'origin', '--delete', 'test-branch');
  const input = { repoPath: f.repo, remote: 'origin', branch: 'test-branch' };
  return { ...f, server, peer, feature, merged, input };
}

describe('pull recovery after a merged remote branch is deleted', () => {
  it('reproduces the missing ref and prepares main while preserving local commits, changes and tracking', async () => {
    const f = mergedFeature();
    const config = fs.readFileSync(path.join(f.repo, '.git', 'config'), 'utf8');
    fs.writeFileSync(path.join(f.repo, 'file.txt'), 'uncommitted local changes');
    fs.writeFileSync(path.join(f.repo, 'draft.txt'), 'untracked draft');
    expect(git(f.repo, 'rev-parse', 'refs/remotes/origin/test-branch')).toBe(f.feature);
    await expect(f.service.pull(f.repo, { ...f.input, mode: 'default' }, f.context)).rejects.toThrow("couldn't find remote ref test-branch");
    expect(await f.service.getPullRecovery(f.repo, f.input, f.context)).toEqual({ branchExists: false, defaultBranch: { name: 'main', localExists: true } });
    const result = await f.service.preparePullRecovery(f.repo, { ...f.input, defaultBranch: 'main' }, f.context);
    expect(result.defaultBranch).toEqual({ name: 'main', localExists: true });
    expect(git(f.repo, 'branch', '--list', '--remotes', 'origin/test-branch')).toBe('');
    expect(git(f.repo, 'rev-parse', 'refs/remotes/origin/main')).toBe(f.merged);
    expect(git(f.repo, 'rev-parse', 'refs/heads/main')).toBe(f.initial);
    expect(git(f.repo, 'symbolic-ref', '--short', 'HEAD')).toBe('test-branch');
    expect(git(f.repo, 'rev-parse', 'HEAD')).toBe(f.feature);
    expect(fs.readFileSync(path.join(f.repo, 'file.txt'), 'utf8')).toBe('uncommitted local changes');
    expect(fs.readFileSync(path.join(f.repo, 'draft.txt'), 'utf8')).toBe('untracked draft');
    expect(fs.readFileSync(path.join(f.repo, '.git', 'config'), 'utf8')).toBe(config);
  }, 60_000);

  it('uses the actual remote default after a rename, including a single-branch clone with no local default', async () => {
    const f = mergedFeature();
    git(f.peer, 'branch', '-m', 'main', 'trunk');
    git(f.peer, 'push', '-u', 'origin', 'trunk');
    git(f.server, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
    git(f.peer, 'push', 'origin', '--delete', 'main');
    git(f.repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    git(f.repo, 'config', 'remote.origin.fetch', '+refs/heads/test-branch:refs/remotes/origin/test-branch');
    const expected = { branchExists: false, defaultBranch: { name: 'trunk', localExists: false } };
    expect(await f.service.getPullRecovery(f.repo, f.input, f.context)).toEqual(expected);
    expect(await f.service.preparePullRecovery(f.repo, { ...f.input, defaultBranch: 'trunk' }, f.context)).toEqual(expected);
    expect(git(f.repo, 'rev-parse', 'refs/remotes/origin/trunk')).toBe(f.merged);
    expect(git(f.repo, 'branch', '--list', 'trunk')).toBe('');
    expect(git(f.repo, 'symbolic-ref', '--short', 'HEAD')).toBe('test-branch');
    expect(git(f.repo, 'rev-parse', 'HEAD')).toBe(f.feature);
    git(f.repo, 'switch', '-c', 'trunk', 'refs/remotes/origin/trunk');
    await f.service.pull(f.repo, { repoPath: f.repo, remote: 'origin', branch: 'trunk', mode: 'default' }, f.context);
    expect(git(f.repo, 'rev-parse', 'HEAD')).toBe(f.merged);
    expect(git(f.repo, 'rev-parse', 'refs/heads/test-branch')).toBe(f.feature);
  }, 60_000);

  it('rechecks a restored feature or changed default before fetching a recovery target', async () => {
    const f = mergedFeature();
    const fetch = vi.spyOn(f.lifecycle.runner, 'streamOutput');
    await expect(f.service.preparePullRecovery(f.repo, { ...f.input, defaultBranch: 'master' }, f.context)).rejects.toThrow('remote branches changed');
    git(f.repo, 'push', 'origin', 'test-branch');
    expect(await f.service.getPullRecovery(f.repo, f.input, f.context)).toMatchObject({ branchExists: true });
    await expect(f.service.preparePullRecovery(f.repo, { ...f.input, defaultBranch: 'main' }, f.context)).rejects.toThrow('remote branches changed');
    expect(fetch).not.toHaveBeenCalled();
    expect(git(f.repo, 'rev-parse', 'HEAD')).toBe(f.feature);
  }, 60_000);

  it('does not guess main or master when the server has a detached HEAD', async () => {
    const f = mergedFeature();
    git(f.server, 'update-ref', '--no-deref', 'HEAD', f.merged);
    expect(await f.service.getPullRecovery(f.repo, f.input, f.context)).toEqual({ branchExists: false, defaultBranch: null });
    await expect(f.service.preparePullRecovery(f.repo, { ...f.input, defaultBranch: 'main' }, f.context)).rejects.toThrow('remote branches changed');
    expect(git(f.repo, 'symbolic-ref', '--short', 'HEAD')).toBe('test-branch');
  }, 60_000);
});
