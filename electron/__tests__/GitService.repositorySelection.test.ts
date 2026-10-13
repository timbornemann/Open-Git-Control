import { describe, expect, it, vi } from 'vitest';
import { GitService } from '../GitService';

const deferred = () => {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
};

describe('asynchronous repository selection', () => {
  it('keeps the newest selection when older repository probes finish late', async () => {
    const service = new GitService();
    const first = deferred();
    const second = deferred();
    vi.spyOn(service, 'resolveRepositoryPathAsync').mockImplementation((repo) => (repo === 'first' ? first.promise : second.promise));
    vi.spyOn(service.runner, 'detectIsBareRepository').mockResolvedValue(false);
    const older = service.setRepoPathAsync('first');
    const rejected = expect(older).rejects.toThrow('Repository selection changed.');
    const newer = service.setRepoPathAsync('second');
    second.resolve('C:/second');
    await newer;
    expect(service.getRepoPath()).toBe('C:/second');
    first.resolve('C:/first');
    await rejected;
    expect(service.getRepoPath()).toBe('C:/second');
  });

  it('does not reactivate a repository when it was cleared during a probe', async () => {
    const service = new GitService();
    const pending = deferred();
    vi.spyOn(service, 'resolveRepositoryPathAsync').mockReturnValue(pending.promise);
    vi.spyOn(service.runner, 'detectIsBareRepository').mockResolvedValue(true);
    const selecting = service.setRepoPathAsync('bare');
    const rejected = expect(selecting).rejects.toThrow('Repository selection changed.');
    service.clearRepoPath();
    pending.resolve('C:/bare');
    await rejected;
    expect(service.getRepoPath()).toBeNull();
  });

  it('caches bare status after selection and suppresses worktree commands', async () => {
    const service = new GitService();
    vi.spyOn(service, 'resolveRepositoryPathAsync').mockResolvedValue('C:/bare');
    const probe = vi.spyOn(service.runner, 'detectIsBareRepository').mockResolvedValue(true);
    const run = vi.spyOn(service.runner, 'run');
    await service.setRepoPathAsync('C:/bare');
    await expect(service.runCommand(['status', '--porcelain'])).resolves.toBe('');
    expect(probe).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(service.isBareRepository()).toBe(true);
  });
});
