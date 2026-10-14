import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as commitProcesses from '../../git/CommitEditProcess';
import { cleanRepositories, repository } from './repositoryFixture';
import { policy } from './autoCommitFixtures';

describe('auto-commit change-set benchmarks (real Git, deterministic AI)', { timeout: 60000 }, () => {
  let cleanup: AbortController;
  let active: Promise<void> | undefined;
  beforeEach(() => {
    cleanup = new AbortController();
    active = undefined;
  });
  afterEach(async () => {
    cleanup.abort();
    if (active) await Promise.allSettled([active]);
    vi.restoreAllMocks();
    await cleanRepositories();
  }, 30_000);
  for (const count of [10, 50, 500])
    it(
      `processes ${count} files without per-file model calls or micro-commits`,
      {
        // The largest case creates 500 real Git objects; shared CI disks and coverage need their own I/O budget.
        timeout: count === 500 ? 180_000 : 60_000,
      },
      async ({ signal }) => {
        active = (async () => {
          const repo = await repository();
          const writeStarted = Date.now();
          for (let index = 0; index < count; index += 1) repo.write(`layers/${index}/feature.ts`, `export const feature${index} = true;\n`);
          const writeMs = Date.now() - writeStarted;
          const provider = vi.fn(repo.provider);
          const buffers = vi.spyOn(repo.git.runner, 'runBuffer');
          const scheduled = vi.spyOn(repo.git.runner, 'schedule');
          const exclusive = vi.spyOn(commitProcesses, 'runCommitEditProcess');
          const result = await repo.service(provider).runAutoCommitWithOptions(
            repo.repoPath,
            policy,
            () => 'key',
            undefined,
            undefined,
            () => '',
            {
              signal: AbortSignal.any([signal, cleanup.signal]),
            },
          );
          expect(result.outcome).toBe('complete');
          expect(result.commits).toHaveLength(1);
          expect(result.processedFiles).toBe(count);
          expect(result.remainingFiles).toBe(0);
          if (count <= 50) expect(provider).toHaveBeenCalledTimes(1);
          else expect(provider.mock.calls.length).toBeLessThan(10);
          expect(buffers.mock.calls.length).toBeLessThan(15);
          const gitCommands = scheduled.mock.calls.length + exclusive.mock.calls.length;
          expect(gitCommands).toBeLessThan(100);
          console.info('AI auto-commit benchmark', { count, writeMs, gitCommands, ...result.metrics });
        })();
        await active;
      },
    );
});
