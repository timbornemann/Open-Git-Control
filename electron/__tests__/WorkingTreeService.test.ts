import { describe, expect, it, vi } from 'vitest';
import { WorkingTreeService } from '../WorkingTreeService';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};

describe('WorkingTreeService', () => {
  it('coalesces overlapping status polls and caches stats by fingerprint', async () => {
    const status = deferred<string>();
    const getStatusPorcelainAtPath = vi.fn(() => status.promise);
    const runCommandAtPath = vi.fn(async (_repo: string, args: string[]) =>
      args.includes('--cached') ? '3\t1\ta.ts' : '2\t4\tb.ts');
    const service = new WorkingTreeService({
      getRepoPath: () => 'C:/repo',
      getStatusPorcelainAtPath,
      runCommandAtPath,
    } as any);

    const first = service.getSnapshot();
    const second = service.getSnapshot();
    expect(getStatusPorcelainAtPath).toHaveBeenCalledTimes(1);
    status.resolve('M  a.ts\n?? b.ts');
    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
    expect(secondSnapshot.snapshotId).toBe(firstSnapshot.snapshotId);
    expect(firstSnapshot.changeCount).toBe(2);

    const [firstStats, secondStats] = await Promise.all([
      service.getStats(firstSnapshot.snapshotId),
      service.getStats(firstSnapshot.snapshotId),
    ]);
    expect(firstStats).toEqual(secondStats);
    expect(runCommandAtPath).toHaveBeenCalledTimes(2);
  });

  it('does not promote a completed snapshot from a previously selected repository', async () => {
    let repoPath = 'C:/old';
    const oldStatus = deferred<string>();
    const service = new WorkingTreeService({
      getRepoPath: () => repoPath,
      getStatusPorcelainAtPath: vi.fn((requestedRepo: string) =>
        requestedRepo === 'C:/old' ? oldStatus.promise : Promise.resolve('M  new.ts')),
      runCommandAtPath: vi.fn(async () => ''),
    } as any);

    const oldRequest = service.getSnapshot();
    repoPath = 'C:/new';
    const newSnapshot = await service.getSnapshot();
    oldStatus.resolve('M  old.ts');
    const oldSnapshot = await oldRequest;

    expect(newSnapshot.repoPath).toBe('C:/new');
    await expect(service.getStats(oldSnapshot.snapshotId)).rejects.toThrow('stale');
    await expect(service.getStats(newSnapshot.snapshotId)).resolves.toMatchObject({
      snapshotId: newSnapshot.snapshotId,
    });
  });
});
