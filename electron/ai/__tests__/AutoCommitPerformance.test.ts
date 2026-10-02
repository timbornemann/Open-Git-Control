import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanRepositories, repository } from './repositoryFixture';
import { policy } from './autoCommitFixtures';

describe('auto-commit change-set benchmarks (real Git, deterministic AI)', { timeout: 60000 }, () => {
  afterEach(cleanRepositories);
  it.each([10, 50, 500])('processes %i files without per-file model calls or micro-commits', async (count) => {
    const repo = await repository();
    for (let index = 0; index < count; index += 1) repo.write(`layers/${index}/feature.ts`, `export const feature${index} = true;\n`);
    const provider = vi.fn(repo.provider);
    const buffers = vi.spyOn(repo.git.runner, 'runBuffer');
    const result = await repo.service(provider).runAutoCommit(repo.repoPath, policy, () => 'key');
    expect(result.outcome).toBe('complete');
    expect(result.commits).toHaveLength(1);
    expect(result.processedFiles).toBe(count);
    expect(result.remainingFiles).toBe(0);
    if (count <= 50) expect(provider).toHaveBeenCalledTimes(1);
    else expect(provider.mock.calls.length).toBeLessThan(10);
    expect(buffers.mock.calls.length).toBeLessThan(15);
    console.info('AI auto-commit benchmark', { count, ...result.metrics });
  });
});
