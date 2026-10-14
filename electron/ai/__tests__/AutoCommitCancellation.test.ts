import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanRepositories, repository } from './repositoryFixture';
import { policy } from './autoCommitFixtures';
import type { AiTextRequest } from '../AiProviderClient';
import type { CommitEditGit } from '../../git/CommitEditGit';

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanRepositories();
});

describe('auto-commit parent cancellation', { timeout: 30_000 }, () => {
  it.each(['snapshot', 'grouping'])('cancels during %s and finishes cleanup without creating a commit', async (phase) => {
    const repo = await repository();
    const head = await repo.run(['rev-parse', 'HEAD']);
    repo.write('base.txt', 'must remain uncommitted\n');
    const controller = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release = () => {};
    let cancelled = () => false;
    const provider = vi.fn(async (request: AiTextRequest) => {
      if (phase === 'grouping') {
        cancelled = request.shouldCancel!;
        await new Promise<void>((resolve) => {
          release = resolve;
          entered();
        });
      }
      return repo.provider(request);
    });
    if (phase === 'snapshot')
      vi.spyOn(repo.git, 'getStatusPorcelainZAtPath').mockImplementationOnce((_path, signal) => {
        cancelled = () => signal?.aborted === true;
        return new Promise<string>((resolve) => {
          release = () => resolve(' M base.txt\0');
          entered();
        });
      });
    const pending = repo.service(provider).runAutoCommitWithOptions(
      repo.repoPath,
      policy,
      () => 'key',
      undefined,
      undefined,
      () => '',
      { signal: controller.signal },
    );
    try {
      await started;
      controller.abort();
      expect(cancelled()).toBe(true);
      release();
      expect(await pending).toMatchObject({ outcome: 'cancelled', commits: [], processedFiles: 0 });
    } finally {
      controller.abort();
      release();
      await Promise.allSettled([pending]);
    }
    expect(await repo.run(['rev-parse', 'HEAD'])).toBe(head);
    expect(await repo.run(['diff', '--cached', '--name-only'])).toBe('');
    expect(await repo.run(['status', '--porcelain'])).toContain('base.txt');
    expect(provider).toHaveBeenCalledTimes(phase === 'snapshot' ? 0 : 1);
  });

  it('cancels a queued transaction without waiting for another repository write', async () => {
    const repo = await repository();
    repo.write('base.txt', 'must remain uncommitted\n');
    vi.spyOn(repo.git, 'resolveRepositoryPathAsync').mockResolvedValue(repo.repoPath);
    vi.spyOn(repo.git, 'getStatusPorcelainZAtPath').mockResolvedValue(' M base.txt\0');
    const controller = new AbortController();
    const write = repo.git.runner.withExclusiveWrite.bind(repo.git.runner);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const occupied = write(
      repo.repoPath,
      'Other write',
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
          entered();
        }),
    );
    await started;
    let queued!: (signal?: AbortSignal) => void;
    const waiting = new Promise<AbortSignal | undefined>((resolve) => {
      queued = resolve;
    });
    vi.spyOn(repo.git.runner, 'withExclusiveWrite').mockImplementation(
      <T>(cwd: string, command: string, work: (git: CommitEditGit) => Promise<T>, signal?: AbortSignal) => {
        if (command === 'AI commit transaction') queued(signal);
        return write(cwd, command, work, signal);
      },
    );
    const provider = vi.fn(repo.provider);
    const pending = repo.service(provider).runAutoCommitWithOptions(
      repo.repoPath,
      policy,
      () => 'key',
      undefined,
      undefined,
      () => '',
      { signal: controller.signal },
    );
    try {
      const signal = await waiting;
      expect(signal).toBeInstanceOf(AbortSignal);
      controller.abort();
      expect(signal!.aborted).toBe(true);
      expect(await pending).toMatchObject({ outcome: 'cancelled', commits: [] });
      expect(provider).not.toHaveBeenCalled();
    } finally {
      controller.abort();
      release();
      await Promise.allSettled([occupied, pending]);
    }
    expect(await repo.run(['rev-list', '--count', 'HEAD'])).toBe('1');
  });
});
