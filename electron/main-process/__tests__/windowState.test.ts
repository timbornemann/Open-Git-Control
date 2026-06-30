import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

const { appGetPathMock, getAllDisplaysMock } = vi.hoisted(() => ({
  appGetPathMock: vi.fn(),
  getAllDisplaysMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: appGetPathMock,
  },
  screen: {
    getAllDisplays: getAllDisplaysMock,
  },
}));

import {
  DEFAULT_MAIN_WINDOW_BOUNDS,
  installMainWindowStatePersistence,
  readMainWindowState,
  sanitizeMainWindowBounds,
  writeMainWindowState,
} from '../windowState';

class FakeBrowserWindow extends EventEmitter {
  destroyed = false;
  maximized = false;
  bounds = { x: 30, y: 40, width: 1280, height: 900 };
  normalBounds = { x: 50, y: 60, width: 1440, height: 960 };

  isDestroyed() {
    return this.destroyed;
  }

  isMaximized() {
    return this.maximized;
  }

  getBounds() {
    return this.bounds;
  }

  getNormalBounds() {
    return this.normalBounds;
  }
}

const makeTempStatePath = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-window-state-'));
  return path.join(dir, 'window-state-v1.json');
};

describe('main window state persistence', () => {
  beforeEach(() => {
    getAllDisplaysMock.mockReturnValue([
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
    ]);
    appGetPathMock.mockReturnValue(os.tmpdir());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('sanitizes saved bounds and keeps visible window positions', () => {
    expect(sanitizeMainWindowBounds(
      { x: 10, y: 20, width: 500, height: 400 },
      [{ x: 0, y: 0, width: 1920, height: 1080 }],
    )).toEqual({ x: 10, y: 20, width: 900, height: 640 });
  });

  it('drops offscreen positions while preserving the saved size', () => {
    expect(sanitizeMainWindowBounds(
      { x: 9000, y: 9000, width: 1400, height: 900 },
      [{ x: 0, y: 0, width: 1920, height: 1080 }],
    )).toEqual({ width: 1400, height: 900 });
  });

  it('falls back to default bounds when the state file is missing or malformed', () => {
    const statePath = makeTempStatePath();

    expect(readMainWindowState(statePath)).toEqual({
      bounds: DEFAULT_MAIN_WINDOW_BOUNDS,
      isMaximized: false,
    });

    fs.writeFileSync(statePath, '{"bounds":false}', 'utf8');
    expect(readMainWindowState(statePath)).toEqual({
      bounds: DEFAULT_MAIN_WINDOW_BOUNDS,
      isMaximized: false,
    });
  });

  it('writes and reads window bounds with maximized state', () => {
    const statePath = makeTempStatePath();

    writeMainWindowState({
      bounds: { x: 100, y: 120, width: 1500, height: 1000 },
      isMaximized: true,
    }, statePath);

    expect(readMainWindowState(statePath)).toEqual({
      bounds: { x: 100, y: 120, width: 1500, height: 1000 },
      isMaximized: true,
    });
  });

  it('debounces resize and move saves', () => {
    vi.useFakeTimers();
    const statePath = makeTempStatePath();
    const win = new FakeBrowserWindow();

    installMainWindowStatePersistence(win as unknown as BrowserWindow, statePath);
    win.bounds = { x: 70, y: 80, width: 1320, height: 880 };
    win.emit('resize');
    expect(fs.existsSync(statePath)).toBe(false);

    vi.advanceTimersByTime(250);

    expect(readMainWindowState(statePath)).toEqual({
      bounds: { x: 70, y: 80, width: 1320, height: 880 },
      isMaximized: false,
    });
  });

  it('persists normal bounds when the window is maximized', () => {
    const statePath = makeTempStatePath();
    const win = new FakeBrowserWindow();
    win.maximized = true;

    installMainWindowStatePersistence(win as unknown as BrowserWindow, statePath);
    win.emit('close');

    expect(readMainWindowState(statePath)).toEqual({
      bounds: { x: 50, y: 60, width: 1440, height: 960 },
      isMaximized: true,
    });
  });
});
