import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitService } from '../GitService';
import { parseStatusPath, WorkingTreeService } from '../WorkingTreeService';

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
    expect(runPollingCommandAtPath).toHaveBeenCalledTimes(6);
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
      expect(runPollingCommandAtPath).toHaveBeenCalledTimes(12);
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
    let indexRaw = '100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\ta.ts\0';
    const runPollingCommandAtPath = vi.fn(async (_repo: string, args: string[]) => {
      if (args[0] === 'ls-files') return indexRaw;
      return args.includes('--cached') ? stagedRaw : '4\t0\ta.ts';
    });
    const service = new WorkingTreeService({
      getRepoPath: () => repoPath,
      getStatusPorcelainAtPath,
      runPollingCommandAtPath,
    } as any);

    try {
      const firstSnapshot = await service.getSnapshot();
      const firstStats = await service.getStats(firstSnapshot.snapshotId);
      stagedRaw = '2\t0\ta.ts';
      indexRaw = '100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\ta.ts\0';
      const secondSnapshot = await service.getSnapshot();
      const secondStats = await service.getStats(secondSnapshot.snapshotId);

      expect(secondSnapshot.snapshotId).not.toBe(firstSnapshot.snapshotId);
      expect(firstStats.staged.additions).toBe(1);
      expect(secondStats.staged.additions).toBe(2);
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('retries when the index changes between the two snapshot samples', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-working-tree-stability-'));
    fs.writeFileSync(path.join(repoPath, 'a.ts'), 'unchanged worktree\n', 'utf8');
    const stagedEntries = [
      '100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\ta.ts\0',
      '100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\ta.ts\0',
      '100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\ta.ts\0',
      '100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\ta.ts\0',
    ];
    const runPollingCommandAtPath = vi.fn(async (_repo: string, args: string[]) => (args[0] === 'ls-files' ? stagedEntries.shift() || '' : ''));
    const service = new WorkingTreeService({
      getRepoPath: () => repoPath,
      getStatusPorcelainAtPath: vi.fn(async () => 'M  a.ts'),
      runPollingCommandAtPath,
    } as any);

    try {
      await expect(service.getSnapshot()).resolves.toMatchObject({ statusRaw: 'M  a.ts' });
      expect(runPollingCommandAtPath).toHaveBeenCalledTimes(4);
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('distinguishes equal-size staged blobs and rejects stats for the superseded snapshot', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-working-tree-real-index-'));
    const git = (...args: string[]): string => execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' });
    const writeBlob = (contents: string): string =>
      execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repoPath, encoding: 'utf8', input: contents }).trim();

    try {
      git('init', '-q');
      git('config', 'core.autocrlf', 'false');
      fs.writeFileSync(path.join(repoPath, 'a.txt'), 'base\n', 'utf8');
      git('add', '--', 'a.txt');
      git('-c', 'user.name=Snapshot Test', '-c', 'user.email=snapshot@example.invalid', 'commit', '-q', '-m', 'initial');
      fs.writeFileSync(path.join(repoPath, 'a.txt'), 'work\n', 'utf8');

      const firstBlob = writeBlob('1111\n');
      git('update-index', '--cacheinfo', '100644', firstBlob, 'a.txt');
      const firstNumstat = git('diff', '--cached', '--numstat');

      const gitService = new GitService();
      gitService.setRepoPath(repoPath);
      const service = new WorkingTreeService(gitService);
      const firstSnapshot = await service.getSnapshot(repoPath);

      const secondBlob = writeBlob('2222\n');
      git('update-index', '--cacheinfo', '100644', secondBlob, 'a.txt');
      const secondNumstat = git('diff', '--cached', '--numstat');

      expect(secondNumstat).toBe(firstNumstat);
      await expect(service.getStats(firstSnapshot.snapshotId, repoPath)).rejects.toThrow('stale');

      const secondSnapshot = await service.getSnapshot(repoPath);
      expect(secondSnapshot.statusRaw).toBe(firstSnapshot.statusRaw);
      expect(secondSnapshot.snapshotId).not.toBe(firstSnapshot.snapshotId);
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

  it('keeps literal arrow text in ordinary filenames and only splits rename records', async () => {
    expect(parseStatusPath('?? literal -> name.txt')).toBe('literal -> name.txt');
    expect(parseStatusPath('R  old.txt -> renamed -> target.txt')).toBe('renamed -> target.txt');
    expect(parseStatusPath('?? "quoted -> name.txt"')).toBe('quoted -> name.txt');
    expect(parseStatusPath('?? " leading and trailing.txt "')).toBe(' leading and trailing.txt ');
    expect(parseStatusPath('R  "old -> name.txt" -> "new -> name.txt"')).toBe('new -> name.txt');
  });

  it('uses NUL-delimited rename records for snapshot identity and literal target paths', async () => {
    const statusZ = 'R  new -> target.txt\0old -> source.txt\0';
    const getStatusPorcelainZAtPath = vi.fn(async () => statusZ);
    const getStatusPorcelainAtPath = vi.fn(async () => {
      throw new Error('legacy porcelain must not be used when -z is available');
    });
    const runPollingCommandAtPath = vi.fn(async () => '');
    const service = new WorkingTreeService({
      getRepoPath: () => 'C:/repo',
      getStatusPorcelainZAtPath,
      getStatusPorcelainAtPath,
      runPollingCommandAtPath,
    } as any);

    const snapshot = await service.getSnapshot();

    expect(snapshot.changeCount).toBe(1);
    expect(snapshot.statusRaw).toBe('R  "old -> source.txt" -> "new -> target.txt"');
    expect(getStatusPorcelainAtPath).not.toHaveBeenCalled();
    expect(runPollingCommandAtPath).toHaveBeenCalledWith(
      'C:/repo',
      ['ls-files', '--stage', '-z', '--', ':(literal)new -> target.txt'],
      expect.stringContaining('working-tree-snapshot:index:'),
    );
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

  it('does not promote an old A snapshot after an A-to-B-to-A repository switch', async () => {
    let repoPath = 'C:/A';
    const oldAStatus = deferred<string>();
    let aCall = 0;
    const service = new WorkingTreeService({
      getRepoPath: () => repoPath,
      getStatusPorcelainAtPath: vi.fn((requestedRepo: string) => {
        if (requestedRepo === 'C:/A' && aCall++ < 2) return oldAStatus.promise;
        return Promise.resolve(requestedRepo === 'C:/A' ? 'M  current-a.ts' : 'M  b.ts');
      }),
      runPollingCommandAtPath: vi.fn(async () => ''),
    } as any);

    const oldARequest = service.getSnapshot();
    repoPath = 'C:/B';
    service.setActiveRepo();
    await service.getSnapshot();
    repoPath = 'C:/A';
    service.setActiveRepo();
    const currentARequest = service.getSnapshot();
    oldAStatus.resolve('M  stale-a.ts');
    const [currentA, staleA] = await Promise.all([currentARequest, oldARequest]);

    expect(currentA.statusRaw).toContain('current-a.ts');
    expect(staleA.statusRaw).toContain('current-a.ts');
    expect(staleA.snapshotId).toBe(currentA.snapshotId);
    await expect(service.getStats(currentA.snapshotId)).resolves.toMatchObject({ snapshotId: currentA.snapshotId });
  });

  it('does not let late A stats overwrite or detach a new A stats request after A-to-B-to-A', async () => {
    let repoPath = 'C:/A';
    const oldStatsResult = deferred<string>();
    const newStatsResult = deferred<string>();
    let diffCalls = 0;
    const runPollingCommandAtPath = vi.fn((requestedRepo: string, args: string[]) => {
      if (args[0] === 'ls-files') {
        const blob = requestedRepo === 'C:/A' ? 'a'.repeat(40) : 'b'.repeat(40);
        return Promise.resolve(`100644 ${blob} 0\tfile.ts\0`);
      }
      diffCalls += 1;
      return diffCalls <= 2 ? oldStatsResult.promise : newStatsResult.promise;
    });
    const service = new WorkingTreeService({
      getRepoPath: () => repoPath,
      getStatusPorcelainAtPath: vi.fn(async (requestedRepo: string) => (requestedRepo === 'C:/A' ? 'M  file.ts' : 'M  other.ts')),
      runPollingCommandAtPath,
    } as any);

    const firstA = await service.getSnapshot();
    const oldStats = service.getStats(firstA.snapshotId);
    await vi.waitFor(() => expect(diffCalls).toBe(2));

    repoPath = 'C:/B';
    service.setActiveRepo();
    await service.getSnapshot();
    repoPath = 'C:/A';
    service.setActiveRepo();
    const currentA = await service.getSnapshot();
    expect(currentA.snapshotId).toBe(firstA.snapshotId);

    const newStats = service.getStats(currentA.snapshotId);
    await vi.waitFor(() => expect(diffCalls).toBe(4));
    oldStatsResult.resolve('1\t0\tfile.ts');
    await expect(oldStats).rejects.toThrow('stale');

    const coalescedNewStats = service.getStats(currentA.snapshotId);
    expect(diffCalls).toBe(4);
    newStatsResult.resolve('2\t0\tfile.ts');
    await expect(Promise.all([newStats, coalescedNewStats])).resolves.toEqual([
      expect.objectContaining({ snapshotId: currentA.snapshotId }),
      expect.objectContaining({ snapshotId: currentA.snapshotId }),
    ]);
    expect(diffCalls).toBe(4);
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
