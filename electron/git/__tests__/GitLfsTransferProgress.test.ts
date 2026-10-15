import { describe, expect, it, vi } from 'vitest';
import { gitPushProgress, lfsProgressReporter } from '../GitLfsTransferProgress';
import { uploadLfsObjects } from '../GitLfsTransfers';
import type { GitRunner } from '../GitRunner';

const objects = Array.from({ length: 108 }, (_, i) => ({ oid: i.toString(16).padStart(64, '0'), size: 1_000_000 }));
describe('LFS transfer progress', () => {
  it('reports byte progress even before the first large object finishes and suppresses a zero transfer rate', () => {
    const progress = vi.fn();
    const report = lfsProgressReporter('origin', objects.slice(0, 8), progress);
    expect(report('\x1b[2KUploading LFS objects: 0% (0/8), 1.5 MB | 0 B/s')).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(expect.any(String), {
      phase: 'lfs-upload',
      remote: 'origin',
      processedObjects: 0,
      totalObjects: 8,
      processedBytes: 1_500_000,
      totalBytes: 8_000_000,
    });
    report('Uploading LFS objects: 25% (2/8), 4 MiB | 2 MiB/s');
    expect(progress).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ processedBytes: 4 * 1024 ** 2, speed: '2 MiB/s' }));
  });
  it('treats the native 100% line as finalizing rather than successful push completion', () => {
    const progress = vi.fn();
    lfsProgressReporter('origin', objects.slice(0, 8), progress)('Uploading LFS objects: 100% (8/8), 0 B | 0 B/s, done.');
    expect(progress).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ phase: 'lfs-finalizing', processedObjects: 8 }));
    expect(progress.mock.calls[0][1]).not.toHaveProperty('speed');
  });
  it('retains completed batches in the total while starting later batches and never reports success on a failed upload', async () => {
    const progress = vi.fn();
    const streamOutput = vi.fn<GitRunner['streamOutput']>().mockImplementation(async (_cwd, _args, onLine, _signal, options) => {
      expect(options?.envOverrides?.GIT_LFS_FORCE_PROGRESS).toBe('1');
      if (streamOutput.mock.calls.length === 1) onLine('Uploading LFS objects: 100% (100/100), 100 MB | 0 B/s, done.');
      else {
        onLine('Uploading LFS objects: 50% (4/8), 4 MB | 1 MB/s');
        throw new Error('LFS server rejected upload');
      }
      return '';
    });
    await expect(
      uploadLfsObjects('/repo', 'origin', 'https://example.test/lfs', objects, { streamOutput, run: vi.fn() }, {}, undefined, progress),
    ).rejects.toThrow('server rejected');
    expect(progress).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ processedObjects: 104, totalObjects: 108, processedBytes: 104_000_000 }),
    );
    expect(streamOutput).toHaveBeenCalledTimes(2);
  });
  it('clears stale LFS completion before publishing refs and keeps hook checks within the Git push', () => {
    const progress = vi.fn();
    const report = gitPushProgress('origin', progress);
    expect(progress).toHaveBeenLastCalledWith(expect.any(String), { phase: 'publishing', remote: 'origin' });
    report('Uploading LFS objects: 0% (0/2), 1 MB | 3 MB/s');
    expect(progress).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ phase: 'lfs-upload', totalObjects: 2 }));
    report('Uploading LFS objects: 100% (2/2), 2 MB | 0 B/s, done.');
    expect(progress).toHaveBeenLastCalledWith(expect.any(String), { phase: 'publishing', remote: 'origin' });
    report('remote: Checking received commits');
    expect(progress).toHaveBeenLastCalledWith('remote: Checking received commits', { phase: 'publishing', remote: 'origin' });
  });
});
