import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../AiService';
import { AiAutoCommitRunner } from '../ai/AiAutoCommitRunner';
import { baseSettings } from './helpers/aiServiceTestUtils';

afterEach(() => vi.restoreAllMocks());
describe('AI repository probes', () => {
  it('waits for the asynchronous root probe before starting the commit session', async () => {
    let finish!: (root: string) => void;
    const resolver = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const sync = vi.fn(() => {
      throw new Error('Synchronous probe used');
    });
    const runner = vi.spyOn(AiAutoCommitRunner.prototype, 'run').mockResolvedValue({ status: 'complete' } as any);
    const service = new AiService({ resolveRepositoryPathAsync: resolver, resolveRepositoryPath: sync } as any);
    const pending = service.runAutoCommit('/repo/nested', baseSettings, () => 'test-key');
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(runner).not.toHaveBeenCalled();
    finish('/repo');
    await pending;
    expect(runner.mock.lastCall?.[0]).toBe('/repo');
    expect(sync).not.toHaveBeenCalled();
  });

  it('forwards repository cancellation and starts no commit after a cancelled probe', async () => {
    const controller = new AbortController();
    const resolver = vi.fn(
      (_repo: string, signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const runner = vi.spyOn(AiAutoCommitRunner.prototype, 'run');
    const service = new AiService({ resolveRepositoryPathAsync: resolver } as any);
    const pending = service.runAutoCommitWithOptions(
      '/repo',
      baseSettings,
      () => 'test-key',
      undefined,
      undefined,
      () => '',
      { signal: controller.signal },
    );
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(resolver).toHaveBeenCalledWith('/repo', controller.signal);
    expect(runner).not.toHaveBeenCalled();
  });
});
