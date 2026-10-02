import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { editFixture } from './commitMessageEditFixture';
import { HistoryService } from '../HistoryService';

describe('safe commit message rewriting in real Git repositories', () => {
  let fixture: ReturnType<typeof editFixture> | undefined;
  afterEach(() => fixture?.dispose());

  it.each([0, 1, 2])(
    'rewrites commit %i, preserving trees, authors and the main worktree',
    async (index) => {
      fixture = editFixture();
      const { repo, git, hashes, service, request, context } = fixture;
      const inspection = await service.inspect(repo, hashes[index]);
      expect(inspection.blockReason).toBeNull();
      expect(inspection.commitCount).toBe(3 - index);
      const oldTrees = git(['log', '--reverse', '--format=%T%n%an%n%ae%n%aI']);
      const oldIndex = fs.readFileSync(path.join(repo, '.git', 'index'));
      const title = 'Fix "quotes" $(touch HACKED) `commands` ü 🚀';
      const body = '# Keep heading\n\nParagraph\n  indentation\nexec bad-command';
      const result = await service.reword(request(hashes[index], title, body), context);
      expect(result.changed).toBe(true);
      expect(result.oldHead).toBe(hashes[2]);
      expect(git(['log', '--reverse', '--format=%T%n%an%n%ae%n%aI'])).toBe(oldTrees);
      expect(git(['show', '-s', '--format=%B', result.hashMapping[hashes[index]]])).toBe(`${title}\n\n${body}`);
      expect(git(['rev-list', '--count', 'HEAD'])).toBe('3');
      expect(git(['status', '--porcelain'])).toBe('');
      expect(fs.readFileSync(path.join(repo, '.git', 'index'))).toEqual(oldIndex);
      expect(fs.readFileSync(path.join(repo, 'file.txt'), 'utf8')).toBe('middle\n');
      expect(git(['worktree', 'list', '--porcelain']).match(/^worktree /gm)).toHaveLength(1);
      expect(await service.backups(repo)).toMatchObject([{ hash: hashes[2], ref: result.backupRef, branch: 'refs/heads/main' }]);
      const history = new HistoryService(
        (args) => fixture!.runner.run(repo, args),
        (repoPath, args, signal) => fixture!.runner.run(repoPath, args, { signal }),
      );
      const visible = await history.getLog(100, true);
      expect(visible).toContain(result.newHead);
      expect(visible).not.toContain(hashes[index]);
    },
    30_000,
  );

  it('removes the description and skips unchanged inputs without creating backups', async () => {
    fixture = editFixture();
    const { service, hashes, request, context, repo, git } = fixture;
    const unchanged = await service.reword(request(hashes[1], 'middle', 'Original body\n\n# Keep this'), context);
    expect(unchanged.changed).toBe(false);
    expect(await service.backups(repo)).toEqual([]);
    const result = await service.reword(request(hashes[1], 'middle', ''), context);
    expect(git(['show', '-s', '--format=%B', result.hashMapping[hashes[1]]])).toBe('middle');
  }, 30_000);

  it('rejects stale HEAD and dirty index without changing history or staging', async () => {
    fixture = editFixture();
    const { service, hashes, request, context, repo, git, commit } = fixture;
    const stale = request();
    commit('new external commit');
    await expect(service.reword(stale, context)).rejects.toThrow('HEAD changed');
    fs.writeFileSync(path.join(repo, 'file.txt'), 'staged work');
    git(['add', 'file.txt']);
    const head = git(['rev-parse', 'HEAD']);
    expect((await service.inspect(repo, hashes[1])).blockReason).toBe('dirty');
    await expect(service.reword(request(), context)).rejects.toThrow('(dirty)');
    expect(git(['rev-parse', 'HEAD'])).toBe(head);
    expect(git(['show', ':file.txt'])).toBe('staged work');
  }, 20_000);
});
