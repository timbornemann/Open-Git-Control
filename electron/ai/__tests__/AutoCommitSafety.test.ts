import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanRepositories, repository } from './repositoryFixture';
import { policy } from './autoCommitFixtures';

describe('auto-commit safety and special Git entries', { timeout: 30000 }, () => {
  afterEach(cleanRepositories);

  it('retains a completed staged commit and reports the rejected worktree group', async () => {
    const repo = await repository();
    repo.write('base.txt', 'staged\n');
    await repo.run(['add', '.']);
    const staged = await repo.run(['write-tree']);
    repo.write('base.txt', 'remaining\n');
    repo.write('.git/hooks/pre-commit', '#!/bin/sh\nif test -e .git/ai-first-done; then exit 1; fi\ntouch .git/ai-first-done\n');
    const provider = vi.fn(repo.provider);
    const result = await repo.service(provider).runAutoCommit(repo.repoPath, policy, () => 'key');
    expect(result.outcome).toBe('partial');
    expect(result.commits).toHaveLength(1);
    expect(result.groups?.map((group) => group.status)).toEqual(['committed', 'pending']);
    expect(result.processedFiles).toBe(0);
    expect(result.remainingFiles).toBe(1);
    expect(await repo.run(['rev-parse', 'HEAD^{tree}'])).toBe(staged);
    expect(await repo.run(['write-tree'])).toBe(staged);
    expect(fs.readFileSync(path.join(repo.repoPath, 'base.txt'), 'utf8')).toBe('remaining\n');
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('stops a running Git operation before requesting model context', async () => {
    const repo = await repository();
    repo.write('base.txt', 'changed\n');
    repo.write('.git/MERGE_HEAD', await repo.run(['rev-parse', 'HEAD']));
    const provider = vi.fn(repo.provider);
    await expect(repo.service(provider).runAutoCommit(repo.repoPath, policy, () => 'key')).rejects.toThrow('MERGE_HEAD');
    expect(provider).not.toHaveBeenCalled();
    expect(await repo.run(['rev-list', '--count', 'HEAD'])).toBe('1');
  });

  it('keeps a later newly-created file outside the immutable plan', async () => {
    const repo = await repository();
    repo.write('base.txt', 'captured\n');
    const result = await repo
      .service(async (request) => {
        repo.write('later.txt', 'not captured\n');
        return repo.provider(request);
      })
      .runAutoCommit(repo.repoPath, policy, () => 'key');
    expect(result.outcome).toBe('complete');
    expect(result.remainingFiles).toBe(1);
    expect(await repo.run(['ls-tree', '--name-only', 'HEAD'])).toBe('base.txt');
    expect(fs.readFileSync(path.join(repo.repoPath, 'later.txt'), 'utf8')).toBe('not captured\n');
  });

  it('preserves symlink mode and captures its unstaged target without following it', async () => {
    const repo = await repository();
    await repo.run(['config', 'core.symlinks', 'false']);
    repo.write('link', 'base.txt');
    const blob = await repo.run(['hash-object', '-w', 'link']);
    await repo.run(['update-index', '--add', '--cacheinfo', `120000,${blob},link`]);
    const index = await repo.run(['write-tree']);
    repo.write('link', 'elsewhere.txt');
    const result = await repo.execute();
    expect(result.commits).toHaveLength(2);
    expect(await repo.run(['rev-parse', 'HEAD~1^{tree}'])).toBe(index);
    expect(await repo.run(['ls-tree', 'HEAD', 'link'])).toContain('120000 blob');
    expect(await repo.run(['show', 'HEAD:link'])).toBe('elsewhere.txt');
  });

  it('keeps staged gitlinks in the exact first tree even with ignore-submodules configured', async () => {
    const repo = await repository();
    const nested = await repository();
    await repo.run(['-c', 'protocol.file.allow=always', 'submodule', 'add', nested.repoPath, 'modules/lib']);
    await repo.run(['config', 'diff.ignoreSubmodules', 'all']);
    const index = await repo.run(['write-tree']);
    const result = await repo.execute();
    expect(result.commits).toHaveLength(1);
    expect(await repo.run(['rev-parse', 'HEAD^{tree}'])).toBe(index);
    expect(await repo.run(['ls-tree', 'HEAD', 'modules/lib'])).toContain('160000 commit');
  });
});
