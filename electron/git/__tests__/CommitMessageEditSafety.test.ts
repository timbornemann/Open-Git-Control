import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { editFixture } from './commitMessageEditFixture';

describe('commit message edit safety gates with real Git', () => {
  let fixture: ReturnType<typeof editFixture>;
  afterEach(() => fixture?.dispose());

  it.each(['branch', 'tag', 'remote-tracking', 'stash', 'worktree'] as const)(
    'blocks affected %s references',
    async (kind) => {
      fixture = editFixture();
      const { git, repo, root, hashes, service } = fixture;
      if (kind === 'branch') git(['branch', 'other', hashes[2]]);
      if (kind === 'tag') git(['tag', '-a', 'release', '-m', 'release', hashes[1]]);
      if (kind === 'remote-tracking') git(['update-ref', 'refs/remotes/old/published', hashes[2]]);
      if (kind === 'stash') {
        fs.writeFileSync(path.join(repo, 'file.txt'), 'stashed work');
        git(['stash', 'push']);
      }
      if (kind === 'worktree') git(['worktree', 'add', '--detach', path.join(root, 'other'), hashes[2]]);
      const inspection = await service.inspect(repo, hashes[1]);
      expect(inspection.blockReason).toBe(kind === 'remote-tracking' ? 'published' : kind === 'worktree' ? 'worktree' : 'referenced');
      expect(git(['rev-parse', 'HEAD'])).toBe(hashes[2]);
    },
    20_000,
  );

  it.each(['merge', 'detached', 'operation', 'untracked', 'shallow', 'bare'] as const)(
    'blocks %s repositories',
    async (kind) => {
      fixture = editFixture();
      const { git, repo, root, hashes, commit, service } = fixture;
      let inspectRepo = repo;
      let hash = hashes[1];
      if (kind === 'merge') {
        git(['switch', '-c', 'side', hashes[0]]);
        commit('side');
        git(['switch', 'main']);
        git(['merge', '--no-ff', 'side', '-m', 'merge']);
      }
      if (kind === 'detached') git(['checkout', '--detach']);
      if (kind === 'operation') fs.writeFileSync(path.join(repo, '.git', 'CHERRY_PICK_HEAD'), hashes[0]);
      if (kind === 'untracked') fs.writeFileSync(path.join(repo, 'unsaved.txt'), 'unsaved');
      if (kind === 'shallow' || kind === 'bare') {
        inspectRepo = path.join(root, 'clone');
        git(['clone', ...(kind === 'shallow' ? ['--depth=1'] : ['--bare']), pathToFileURL(repo).href, inspectRepo]);
        hash = hashes[2];
      }
      expect((await service.inspect(inspectRepo, hash)).blockReason).toBe(kind === 'untracked' ? 'dirty' : kind);
    },
    20_000,
  );

  it.each(['branch', 'tag', 'push-url'] as const)(
    'detects published history at a fresh remote %s, ignoring limited fetch refspecs',
    async (kind) => {
      fixture = editFixture();
      const { repo, root, git, hashes, service, request, context } = fixture;
      const remote = path.join(root, 'remote.git');
      git(['init', '--bare', remote]);
      git(['push', remote, `${hashes[2]}:${kind === 'tag' ? 'refs/tags/published' : 'refs/heads/hidden'}`]);
      git(['remote', 'add', 'archive', kind === 'push-url' ? path.join(root, 'empty.git') : remote]);
      if (kind === 'push-url') {
        git(['init', '--bare', path.join(root, 'empty.git')]);
        git(['remote', 'set-url', '--push', 'archive', remote]);
      }
      git(['config', 'remote.archive.fetch', '+refs/heads/main:refs/remotes/archive/main']);
      expect((await service.inspect(repo, hashes[1])).blockReason).toBeNull();
      await expect(service.reword(request(), context)).rejects.toThrow('(published)');
      expect(git(['rev-parse', 'HEAD'])).toBe(hashes[2]);
      expect(git(['for-each-ref', '--format=%(refname)', 'refs/ogc/'])).toBe('');
      expect(git(['worktree', 'list', '--porcelain']).match(/^worktree /gm)).toHaveLength(1);
    },
    20_000,
  );

  it('fails closed for unreachable and incomplete shallow remotes', async () => {
    fixture = editFixture();
    const { repo, root, git, hashes, service, request, context } = fixture;
    git(['remote', 'add', 'offline', path.join(root, 'missing.git')]);
    await expect(service.reword(request(), context)).rejects.toThrow();
    git(['remote', 'remove', 'offline']);
    const shallow = path.join(root, 'shallow.git');
    git(['clone', '--bare', '--depth=1', pathToFileURL(repo).href, shallow]);
    // The remote has an additional shallow root unavailable in the original.
    const alternate = path.join(root, 'alternate');
    git(['clone', shallow, alternate]);
    git(
      ['-c', 'user.name=Remote', '-c', 'user.email=remote@example.test', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'remote new commit'],
      alternate,
    );
    git(['push', shallow, 'HEAD:refs/heads/new'], alternate);
    git(['remote', 'add', 'incomplete', shallow]);
    await expect(service.reword(request(), context)).rejects.toThrow();
    expect(git(['rev-parse', 'HEAD'])).toBe(hashes[2]);
    expect(await service.backups(repo)).toEqual([]);
  }, 30_000);
});
