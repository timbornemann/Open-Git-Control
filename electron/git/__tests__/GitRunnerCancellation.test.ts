import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { GitScheduler } from '../../GitScheduler';
import type { GitJobKind } from '../../GitScheduler';

describe('caller cancellation of buffered Git commands', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['buffer', 'input'] as const)('does not start a pre-cancelled %s command', async (kind) => {
    const controller = new AbortController();
    controller.abort();
    const runner = new GitRunner();
    const pending =
      kind === 'buffer'
        ? runner.runBuffer(os.tmpdir(), ['version'], { maxBytes: 1024, tooLargeMessage: 'too large', signal: controller.signal })
        : runner.runWithInput(os.tmpdir(), ['hash-object', '--stdin'], 'read only', { signal: controller.signal });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each(['buffer', 'input'] as const)('stops an already-running %s command when its caller cancels', async (kind) => {
    const runner = new GitRunner();
    const schedule = runner.schedule.bind(runner);
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    vi.spyOn(runner, 'schedule').mockImplementation(
      <T>(cwd: string, jobKind: GitJobKind, command: string, run: (signal: AbortSignal) => Promise<T>, options = {}) =>
        schedule(
          cwd,
          jobKind,
          command,
          async (signal) => {
            markStarted();
            return run(signal);
          },
          options,
        ),
    );
    const controller = new AbortController();
    const pending =
      kind === 'buffer'
        ? runner.runBuffer(os.tmpdir(), ['version'], { maxBytes: 1024, tooLargeMessage: 'too large', signal: controller.signal })
        : runner.runWithInput(os.tmpdir(), ['hash-object', '--stdin'], 'read only', { signal: controller.signal });
    const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await started;
    controller.abort();
    await failure;
  });

  it('rejects a cancelled queued buffer without waiting for a protected write', async () => {
    const scheduler = new GitScheduler();
    const runner = new GitRunner(undefined, scheduler);
    let release!: () => void;
    const write = scheduler.schedule(
      os.tmpdir(),
      'write',
      'protected write',
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const controller = new AbortController();
    const buffer = runner.runBuffer(os.tmpdir(), ['version'], { maxBytes: 1024, tooLargeMessage: 'too large', signal: controller.signal });
    const result = buffer.then(
      () => 'completed',
      (error: Error) => error.name,
    );
    controller.abort();
    try {
      expect(
        await Promise.race([
          result,
          new Promise((resolve) => {
            setTimeout(() => resolve('still queued'), 50);
          }),
        ]),
      ).toBe('AbortError');
    } finally {
      release();
      await write;
      await result;
    }
  });
});
