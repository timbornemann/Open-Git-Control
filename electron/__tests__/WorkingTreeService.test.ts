import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkingTreeService } from '../WorkingTreeService';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('WorkingTreeService', () => {
  it('coalesces overlapping status polls and caches stats by snapshot', async () => {
    const status = deferred<string>();
    const getStatusPorcelainAtPath = vi.fn(() => status.promise);
    const runPollingCommandAtPath = vi.fn(async (_repo: string, args: string[]) => (args.includes('--cached') ? '3\t1\ta.ts' : '2\t4\tb.ts'));
    const service = new WorkingTreeService({
      getRepoPath: () => 'C:/repo',
      getStatusPorcelainAtPath,
      runPollingCommandAtPath,
    } as any);

    const first = service.getSnapshot();
    const second = service.getSnapshot();
    expect(getStatusPorcelainAtPath).toHaveBeenCalledTimes(1);
    status.resolve('M  a.ts\n?? b.ts');
    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
    expect(secondSnapshot.snapshotId).toBe(firstSnapshot.snapshotId);
    expect(firstSnapshot.changeCount).toBe(2);

    const [firstStats, secondStats] = await Promise.all([service.getStats(firstSnapshot.snapshotId), service.getStats(firstSnapshot.snapshotId)]);
    expect(firstStats).toEqual(secondStats);
    expect(runPollingCommandAtPath).toHaveBeenCalledTimes(3);
    expect(runPollingCommandAtPath).toHaveBeenCalledWith('C:/repo', ['diff', '--numstat', '--cached'], `working-tree-stats:${firstSnapshot.snapshotId}:staged`);
  });

  it('recomputes line stats when file contents change without changing porcelain status', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-working-tree-snapshot-'));
    const filePath = path.join(repoPath, 'a.ts');
    fs.writeFileSync(filePath, 'first\n', 'utf8');
    const getStatusPorcelainAtPath = vi.fn(async () => 'M  a.ts');
    let additions = 1;
    const runPollingCommandAtPath = vi.fn(async (_repo: string, args: string[]) => (args.includes('--cached') ? `${additions}\t0\ta.ts` : ''));
    const service = new WorkingTreeService({
      getRepoPath: () => repoPath,
      getStatusPorcelainAtPath,
      runPollingCommandAtPath,
    } as any);

    try {
      const firstSnapshot = await service.getSnapshot();
      const firstStats = await service.getStats(firstSnapshot.snapshotId);
      additions = 8;
      fs.appendFileSync(filePath, 'second line with a different size\n', 'utf8');
      const secondSnapshot = await service.getSnapshot();
      const secondStats = await service.getStats(secondSnapshot.snapshotId);

      expect(secondSnapshot.snapshotId).not.toBe(firstSnapshot.snapshotId);
      expect(firstStats.staged.additions).toBe(1);
      expect(secondStats.staged.additions).toBe(8);
      expect(runPollingCommandAtPath).toHaveBeenCalledTimes(6);
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('recomputes line stats when staged numstat changes without changing file metadata', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-working-tree-index-snapshot-'));
    const filePath = path.join(repoPath, 'a.ts');
    fs.writeFileSync(filePath, 'unchanged worktree\n', 'utf8');
    const getStatusPorcelainAtPath = vi.fn(async () => 'MM a.ts');
    let stagedRaw = '1\t0\ta.ts';
    const runPollingCommandAtPath = vi.fn(async (_repo: string, args: string[]) => (args.includes('--cached') ? stagedRaw : '4\t0\ta.ts'));
    const service = new WorkingTreeService({
      getRepoPath: () => repoPath,
      getStatusPorcelainAtPath,
      runPollingCommandAtPath,
    } as any);

    try {
      const firstSnapshot = await service.getSnapshot();
      const firstStats = await service.getStats(firstSnapshot.snapshotId);
      stagedRaw = '2\t0\ta.ts';
      const secondSnapshot = await service.getSnapshot();
      const secondStats = await service.getStats(secondSnapshot.snapshotId);

      expect(secondSnapshot.snapshotId).not.toBe(firstSnapshot.snapshotId);
      expect(firstStats.staged.additions).toBe(1);
      expect(secondStats.staged.additions).toBe(2);
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('decodes git C-quoted UTF-8 paths without falling back to volatile snapshots', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-working-tree-quoted-path-'));
    const nestedDir = path.join(repoPath, 'src');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'äöü.txt'), 'content\n', 'utf8');
    const statusRaw = ' M "src/\\303\\244\\303\\266\\303\\274.txt"';
    const service = new WorkingTreeService({
      getRepoPath: () => repoPath,
      getStatusPorcelainAtPath: vi.fn(async () => statusRaw),
      runPollingCommandAtPath: vi.fn(async () => ''),
    } as any);

    try {
      const firstSnapshot = await service.getSnapshot();
      const secondSnapshot = await service.getSnapshot();

      expect(secondSnapshot.snapshotId).toBe(firstSnapshot.snapshotId);
      expect(firstSnapshot.changeCount).toBe(1);
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('does not promote a completed snapshot from a previously selected repository', async () => {
    let repoPath = 'C:/old';
    const oldStatus = deferred<string>();
    const service = new WorkingTreeService({
      getRepoPath: () => repoPath,
      getStatusPorcelainAtPath: vi.fn((requestedRepo: string) => (requestedRepo === 'C:/old' ? oldStatus.promise : Promise.resolve('M  new.ts'))),
      runPollingCommandAtPath: vi.fn(async () => ''),
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

  it('marks bare repositories without treating empty status as a clean worktree', async () => {
    const getStatusPorcelainAtPath = vi.fn(async () => {
      throw new Error('this operation must be run in a work tree');
    });
    const service = new WorkingTreeService({
      getRepoPath: () => 'C:/bare.git',
      isBareRepository: () => true,
      getStatusPorcelainAtPath,
      runPollingCommandAtPath: vi.fn(),
    } as any);

    const snapshot = await service.getSnapshot();
    expect(snapshot.isBare).toBe(true);
    expect(snapshot.statusRaw).toBe('');
    expect(snapshot.changeCount).toBe(0);
    expect(getStatusPorcelainAtPath).not.toHaveBeenCalled();
  });

  it('returns empty stats for a bare repository without running git diff', async () => {
    const runPollingCommandAtPath = vi.fn();
    const service = new WorkingTreeService({
      getRepoPath: () => 'C:/bare.git',
      isBareRepositoryAtPath: () => true,
      getStatusPorcelainAtPath: vi.fn(),
      runPollingCommandAtPath,
    } as any);

    const snapshot = await service.getSnapshot();
    expect(snapshot.isBare).toBe(true);

    const stats = await service.getStats(snapshot.snapshotId);
    expect(stats).toEqual({
      snapshotId: snapshot.snapshotId,
      staged: { files: 0, additions: 0, deletions: 0 },
      unstaged: { files: 0, additions: 0, deletions: 0 },
    });
    // git diff must never run on a bare repo (it fails on every poll otherwise).
    expect(runPollingCommandAtPath).not.toHaveBeenCalled();
  });
});
