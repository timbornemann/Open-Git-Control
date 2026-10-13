import { EventEmitter } from 'node:events';
import type { App } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { finishBeforeQuit } from '../finishBeforeQuit';

describe('durable shutdown', () => {
  it('defers repeated quit attempts until cleanup finishes and resumes quitting once', async () => {
    const application = Object.assign(new EventEmitter(), { quit: vi.fn() });
    let finish!: () => void;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    finishBeforeQuit(application as unknown as App, cleanup);
    const event = { preventDefault: vi.fn() };
    application.emit('before-quit', event);
    await Promise.resolve();
    expect(cleanup).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    application.emit('will-quit', event);
    application.emit('will-quit', event);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(application.quit).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(application.quit).toHaveBeenCalledOnce());
    event.preventDefault.mockClear();
    application.emit('will-quit', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('still quits if a cache cleanup fails', async () => {
    const application = Object.assign(new EventEmitter(), { quit: vi.fn() });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      finishBeforeQuit(application as unknown as App, async () => {
        throw new Error('Disk unavailable');
      });
      application.emit('will-quit', { preventDefault: vi.fn() });
      await vi.waitFor(() => expect(application.quit).toHaveBeenCalledOnce());
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
});
