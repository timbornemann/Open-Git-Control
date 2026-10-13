import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanRepositories, repository } from './repositoryFixture';
import { policy } from './autoCommitFixtures';
import type { GitJobKind } from '../../GitScheduler';

describe('AI auto-commit during repository refreshes', { timeout: 30000 }, () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await cleanRepositories();
  });

  it('finishes the snapshot while the UI requests commit details', async () => {
    const repo = await repository();
    repo.write('base.txt', 'captured change\n');
    const provider = vi.fn(repo.provider);
    const schedule = repo.git.runner.schedule.bind(repo.git.runner);
    let refreshes = 0;
    vi.spyOn(repo.git.runner, 'schedule').mockImplementation(
      <T>(cwd: string, kind: GitJobKind, command: string, run: (signal: AbortSignal) => Promise<T>, options = {}) =>
        schedule(
          cwd,
          kind,
          command,
          async (signal) => {
            if (command === 'diff') {
              // Run the same interactive read a refreshed commit graph requests
              // while the AI snapshot's raw/numstat read is still in flight.
              refreshes += 1;
              await repo.run(['show', '-s', '--format=%s', 'HEAD']);
            }
            return run(signal);
          },
          options,
        ),
    );

    const result = await repo.service(provider).runAutoCommit(repo.repoPath, policy, () => 'test-key');

    expect(refreshes).toBeGreaterThanOrEqual(2);
    expect(result.outcome).toBe('complete');
    expect(result.commits).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await repo.run(['show', 'HEAD:base.txt'])).toBe('captured change');
    expect(await repo.run(['status', '--porcelain'])).toBe('');
    expect(
      repo.git
        .getSchedulerDiagnostics()
        .filter((entry) => entry.command === 'diff')
        .some((entry) => entry.aborted),
    ).toBe(false);
  });

  it('reports an unexpected Git interruption with its AI run phase', async () => {
    const repo = await repository();
    const originalHead = await repo.run(['rev-parse', 'HEAD']);
    repo.write('base.txt', 'change remains available\n');
    const provider = vi.fn(repo.provider);
    vi.spyOn(repo.git, 'getStatusPorcelainZAtPath').mockRejectedValueOnce(Object.assign(new Error('Git operation was aborted.'), { name: 'AbortError' }));

    await expect(repo.service(provider).runAutoCommit(repo.repoPath, policy, () => 'test-key')).rejects.toThrow(
      'AI Auto-Commit failed during snapshot: A required Git read was interrupted by another repository request.',
    );

    expect(provider).not.toHaveBeenCalled();
    expect(await repo.run(['rev-parse', 'HEAD'])).toBe(originalHead);
    expect(await repo.run(['diff', '--cached', '--name-only'])).toBe('');
    expect(await repo.run(['status', '--porcelain'])).toContain('base.txt');
  });

  it('reports the run deadline as an error rather than a user cancellation', async () => {
    const repo = await repository();
    const provider = vi.fn(repo.provider);
    let resolveStatus!: (status: string) => void;
    vi.spyOn(repo.git, 'getStatusPorcelainZAtPath').mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    vi.useFakeTimers();
    const pending = repo.service(provider).runAutoCommit(repo.repoPath, policy, () => 'test-key');
    const failure = expect(pending).rejects.toThrow('10-minute time limit');

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    resolveStatus(' M base.txt\0');
    await failure;

    expect(provider).not.toHaveBeenCalled();
  });
});
