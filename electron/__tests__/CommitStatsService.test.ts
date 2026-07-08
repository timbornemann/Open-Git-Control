import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CommitStatsService } from '../CommitStatsService';

const tempDirs: string[] = [];
const createTempCache = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-commit-stats-'));
  tempDirs.push(dir);
  return path.join(dir, 'commit-stats-v1.jsonl');
};

const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 1000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  expect(predicate()).toBe(true);
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('CommitStatsService', () => {
  it('persists results and serves cache hits without another stats command', async () => {
    const cachePath = createTempCache();
    const hash = 'a'.repeat(40);
    const getCommitStatsAtPath = vi.fn(async () => ({ files: 2, additions: 10, deletions: 3 }));
    const gitService = {
      getRepoPath: () => 'C:/repo',
      runCommandAtPath: vi.fn(async () => 'sha1'),
      getCommitStatsAtPath,
    } as any;
    const firstService = new CommitStatsService(gitService, () => cachePath);
    const updates: any[] = [];
    firstService.onUpdate((update) => {
      if (update.state === 'ready') updates.push(update);
    });

    expect(await firstService.requestStats([hash])).toEqual({
      [hash]: { state: 'queued', stats: null },
    });
    await waitFor(() => updates.length === 1);
    expect(getCommitStatsAtPath).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(cachePath, 'utf8')).toContain(hash);

    const secondGitService = {
      ...gitService,
      getCommitStatsAtPath: vi.fn(),
    } as any;
    const secondService = new CommitStatsService(secondGitService, () => cachePath);
    expect(await secondService.requestStats([hash])).toEqual({
      [hash]: { state: 'ready', stats: { files: 2, additions: 10, deletions: 3 } },
    });
    expect(secondGitService.getCommitStatsAtPath).not.toHaveBeenCalled();
  });

  it('atomically compacts to the configured most recent entry limit', async () => {
    const cachePath = createTempCache();
    const updates: any[] = [];
    const gitService = {
      getRepoPath: () => 'C:/repo',
      runCommandAtPath: vi.fn(async () => 'sha1'),
      getCommitStatsAtPath: vi.fn(async (_repo: string, hash: string) => ({
        files: 1,
        additions: Number.parseInt(hash[0], 16),
        deletions: 0,
      })),
    } as any;
    const service = new CommitStatsService(gitService, () => cachePath, {
      maxEntries: 2,
      compactedEntries: 1,
      maxBytes: 1024 * 1024,
    });
    service.onUpdate((update) => {
      if (update.state === 'ready') updates.push(update);
    });

    for (const char of ['1', '2', '3']) {
      await service.requestStats([char.repeat(40)]);
      await waitFor(() => updates.length === Number(char));
    }

    const lines = fs.readFileSync(cachePath, 'utf8').trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('3'.repeat(40));
    expect(fs.existsSync(`${cachePath}.tmp`)).toBe(false);
    expect(fs.existsSync(`${cachePath}.bak`)).toBe(false);
  });

  it('discards a malformed cache instead of returning partial data', async () => {
    const cachePath = createTempCache();
    fs.writeFileSync(cachePath, '{"schema":1}\nnot-json\n', 'utf8');
    const gitService = {
      getRepoPath: () => 'C:/repo',
      runCommandAtPath: vi.fn(async () => 'sha1'),
      getCommitStatsAtPath: vi.fn(async () => ({ files: 0, additions: 0, deletions: 0 })),
    } as any;
    const service = new CommitStatsService(gitService, () => cachePath);

    expect(await service.getCachedStats(['b'.repeat(40)])).toEqual({});
    expect(fs.existsSync(cachePath)).toBe(false);
  });

  it('promotes selected stats ahead of interrupted background work', async () => {
    const cachePath = createTempCache();
    const backgroundHash = 'a'.repeat(40);
    const selectedHash = 'b'.repeat(40);
    const calls: string[] = [];
    const gitService = {
      getRepoPath: () => 'C:/repo',
      runCommandAtPath: vi.fn(async () => 'sha1'),
      getCommitStatsAtPath: vi.fn(async (_repo: string, hash: string, signal: AbortSignal) => {
        calls.push(hash);
        if (hash === backgroundHash && calls.filter((value) => value === backgroundHash).length === 1) {
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
              },
              { once: true },
            );
          });
        }
        return { files: 1, additions: hash === selectedHash ? 2 : 1, deletions: 0 };
      }),
    } as any;
    const service = new CommitStatsService(gitService, () => cachePath, { maxConcurrent: 1 });
    const ready: string[] = [];
    service.onUpdate((update) => {
      if (update.state === 'ready') ready.push(update.hash);
    });

    await service.requestStats([backgroundHash], 'background');
    await waitFor(() => calls.length === 1);
    await service.requestStats([selectedHash], 'selected');
    await waitFor(() => ready.length === 2);

    expect(calls.slice(0, 3)).toEqual([backgroundHash, selectedHash, backgroundHash]);
    expect(ready).toEqual([selectedHash, backgroundHash]);
  });

  it('processes up to three background statistics concurrently', async () => {
    const cachePath = createTempCache();
    const hashes = ['1', '2', '3', '4'].map((char) => char.repeat(40));
    const pending = new Map<string, () => void>();
    const active = new Set<string>();
    let peakActive = 0;
    const gitService = {
      getRepoPath: () => 'C:/repo',
      runCommandAtPath: vi.fn(async () => 'sha1'),
      getCommitStatsAtPath: vi.fn(async (_repo: string, hash: string) => {
        active.add(hash);
        peakActive = Math.max(peakActive, active.size);
        await new Promise<void>((resolve) => {
          pending.set(hash, resolve);
        });
        active.delete(hash);
        return { files: 1, additions: 1, deletions: 0 };
      }),
    } as any;
    const service = new CommitStatsService(gitService, () => cachePath);
    const ready: string[] = [];
    service.onUpdate((update) => {
      if (update.state === 'ready') ready.push(update.hash);
    });

    await service.requestStats(hashes, 'background');
    await waitFor(() => pending.size === 3);
    expect(peakActive).toBe(3);
    expect(pending.has(hashes[3])).toBe(false);

    pending.get(hashes[0])?.();
    await waitFor(() => pending.has(hashes[3]));
    for (const resolve of pending.values()) resolve();
    await waitFor(() => ready.length === hashes.length);
  });

  it('publishes each completed statistic before the remaining work finishes', async () => {
    const cachePath = createTempCache();
    const hashes = ['5', '6', '7'].map((char) => char.repeat(40));
    const pending = new Map<string, () => void>();
    const gitService = {
      getRepoPath: () => 'C:/repo',
      runCommandAtPath: vi.fn(async () => 'sha1'),
      getCommitStatsAtPath: vi.fn(async (_repo: string, hash: string) => {
        await new Promise<void>((resolve) => {
          pending.set(hash, resolve);
        });
        return { files: 1, additions: Number.parseInt(hash[0], 16), deletions: 0 };
      }),
    } as any;
    const service = new CommitStatsService(gitService, () => cachePath);
    const ready: string[] = [];
    service.onUpdate((update) => {
      if (update.state === 'ready') ready.push(update.hash);
    });

    await service.requestStats(hashes, 'background');
    await waitFor(() => pending.size === hashes.length);
    pending.get(hashes[1])?.();
    await waitFor(() => ready.length === 1);

    expect(ready).toEqual([hashes[1]]);
    expect(pending.has(hashes[0])).toBe(true);
    expect(pending.has(hashes[2])).toBe(true);

    pending.get(hashes[0])?.();
    pending.get(hashes[2])?.();
    await waitFor(() => ready.length === hashes.length);
  });
});
