import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { GitSpawnOperations } from '../GitSpawnOperations';

afterEach(() => vi.restoreAllMocks());

describe('scheduled diff preview cancellation', () => {
  it('forwards cancellation to a running diff subprocess', async () => {
    let active!: AbortSignal;
    const spawn = vi.spyOn(GitSpawnOperations.prototype, 'getDiffPreview').mockImplementation((_repo, _args, _bytes, _lines, signal) => {
      active = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' })), { once: true });
      });
    });
    const controller = new AbortController();
    const runner = new GitRunner();
    const outcome = runner.getDiffPreview(os.tmpdir(), ['diff', '--', 'file.ts'], {}, controller.signal).catch((error: Error) => error);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    controller.abort();
    expect(active.aborted).toBe(true);
    expect(await outcome).toMatchObject({ name: 'AbortError' });
  });

  it('removes an obsolete queued diff without starting a process or waiting for a write', async () => {
    const runner = new GitRunner();
    let release!: () => void;
    const write = runner.schedule(
      os.tmpdir(),
      'write',
      'test-write',
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const spawn = vi.spyOn(GitSpawnOperations.prototype, 'getDiffPreview');
    const controller = new AbortController();
    const outcome = runner.getDiffPreview(os.tmpdir(), ['diff', '--', 'file.ts'], {}, controller.signal).catch((error: Error) => error);
    try {
      controller.abort();
      expect(await outcome).toMatchObject({ name: 'AbortError' });
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      release();
      await write;
    }
  });

  it('does not start a diff for a pre-cancelled request', async () => {
    const spawn = vi.spyOn(GitSpawnOperations.prototype, 'getDiffPreview');
    const controller = new AbortController();
    controller.abort();
    await expect(new GitRunner().getDiffPreview(os.tmpdir(), ['diff', '--', 'file.ts'], {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(spawn).not.toHaveBeenCalled();
  });
});
