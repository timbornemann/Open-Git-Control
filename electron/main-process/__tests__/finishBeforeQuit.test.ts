import { EventEmitter } from 'node:events';
import type { App } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { finishBeforeQuit } from '../finishBeforeQuit';

describe('durable shutdown', () => {
  it('resumes on a new event-loop turn after Electron has unwound the cancelled native quit', async () => {
    vi.useFakeTimers({ toFake: ['setImmediate'] });
    try {
      const application = Object.assign(new EventEmitter(), { quit: vi.fn() });
      const cleanup = vi.fn(async () => {});
      finishBeforeQuit(application as unknown as App, cleanup);
      application.emit('will-quit', { preventDefault: vi.fn() });
      // Drain Promise callbacks without advancing fake immediates. waitFor
      // advances fake timers itself and would already resume the native quit.
      for (let turn = 0; turn < 8; turn++) await Promise.resolve();
      expect(vi.getTimerCount()).toBe(1);
      expect(cleanup).toHaveBeenCalledOnce();
      expect(application.quit).not.toHaveBeenCalled();
      vi.runOnlyPendingTimers();
      expect(application.quit).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

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
