import { describe, expect, it } from 'vitest';
import { RepoJobRegistry } from '../repoJobRegistry';

describe('RepoJobRegistry', () => {
  it('does not invalidate a job when the same repository is selected again', () => {
    const registry = new RepoJobRegistry();
    registry.cancelForRepoChange('C:/repo-a');
    const generation = registry.getGeneration();
    const job = registry.begin('C:/repo-a');

    registry.cancelForRepoChange('C:/repo-a');

    expect(registry.getGeneration()).toBe(generation);
    expect(job.signal.aborted).toBe(false);
    expect(job.ensureActive).not.toThrow();
  });

  it('advances generation on real repository changes even without running jobs', () => {
    const registry = new RepoJobRegistry();
    registry.cancelForRepoChange('C:/repo-a');
    const firstGeneration = registry.getGeneration();

    registry.cancelForRepoChange('C:/repo-b');

    expect(registry.getGeneration()).toBe(firstGeneration + 1);
  });

  it('aborts jobs belonging to the previous repository', () => {
    const registry = new RepoJobRegistry();
    registry.cancelForRepoChange('C:/repo-a');
    const job = registry.begin('C:/repo-a');

    registry.cancelForRepoChange('C:/repo-b');

    expect(job.signal.aborted).toBe(true);
    expect(job.ensureActive).toThrow('Repository job was cancelled');
  });
});
