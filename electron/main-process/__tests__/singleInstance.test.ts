import type { App, BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { acquireSingleInstanceLock } from '../singleInstance';

describe('acquireSingleInstanceLock', () => {
  it('quits a secondary process before it can register application work', () => {
    const quit = vi.fn();
    const on = vi.fn();
    const application = {
      requestSingleInstanceLock: vi.fn(() => false),
      quit,
      on,
    } as unknown as App;
    const windows = { getAllWindows: vi.fn(() => []) } as unknown as { getAllWindows: () => BrowserWindow[] };

    expect(acquireSingleInstanceLock(application, windows)).toBe(false);
    expect(quit).toHaveBeenCalledOnce();
    expect(on).not.toHaveBeenCalled();
  });

  it('restores, shows, and focuses the existing primary window on a second launch', () => {
    let secondInstanceHandler: (() => void) | undefined;
    const application = {
      requestSingleInstanceLock: vi.fn(() => true),
      quit: vi.fn(),
      on: vi.fn((_event: string, handler: () => void) => {
        secondInstanceHandler = handler;
      }),
    } as unknown as App;
    const window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      isVisible: vi.fn(() => false),
      show: vi.fn(),
      focus: vi.fn(),
    } as unknown as BrowserWindow;
    const windows = { getAllWindows: vi.fn(() => [window]) } as unknown as { getAllWindows: () => BrowserWindow[] };

    expect(acquireSingleInstanceLock(application, windows)).toBe(true);
    secondInstanceHandler?.();

    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });
});
