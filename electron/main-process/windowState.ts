import { app, screen } from 'electron';
import type { BrowserWindow, Rectangle } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export type MainWindowBounds = {
  x?: number;
  y?: number;
  width: number;
  height: number;
};

export type MainWindowState = {
  bounds: MainWindowBounds;
  isMaximized: boolean;
};

const WINDOW_STATE_FILE_NAME = 'window-state-v1.json';
export const DEFAULT_MAIN_WINDOW_BOUNDS: MainWindowBounds = { width: 1200, height: 800 };
const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 640;
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 80;
const SAVE_DEBOUNCE_MS = 250;

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

export const getMainWindowStatePath = (): string => (
  path.join(app.getPath('userData'), WINDOW_STATE_FILE_NAME)
);

const coerceBounds = (value: unknown): MainWindowBounds | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MainWindowBounds>;
  if (!isFiniteNumber(raw.width) || !isFiniteNumber(raw.height)) return null;

  const bounds: MainWindowBounds = {
    width: Math.max(MIN_WINDOW_WIDTH, Math.round(raw.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.round(raw.height)),
  };

  if (isFiniteNumber(raw.x) && isFiniteNumber(raw.y)) {
    bounds.x = Math.round(raw.x);
    bounds.y = Math.round(raw.y);
  }

  return bounds;
};

const visibleIntersection = (bounds: MainWindowBounds, workArea: Rectangle): { width: number; height: number } => {
  const left = Math.max(bounds.x ?? 0, workArea.x);
  const top = Math.max(bounds.y ?? 0, workArea.y);
  const right = Math.min((bounds.x ?? 0) + bounds.width, workArea.x + workArea.width);
  const bottom = Math.min((bounds.y ?? 0) + bounds.height, workArea.y + workArea.height);

  return {
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
};

const isVisibleOnAnyDisplay = (bounds: MainWindowBounds, displays: Rectangle[]): boolean => {
  if (!isFiniteNumber(bounds.x) || !isFiniteNumber(bounds.y)) return false;
  return displays.some((workArea) => {
    const visible = visibleIntersection(bounds, workArea);
    return visible.width >= Math.min(MIN_VISIBLE_WIDTH, bounds.width)
      && visible.height >= Math.min(MIN_VISIBLE_HEIGHT, bounds.height);
  });
};

export const sanitizeMainWindowBounds = (
  candidate: unknown,
  displayWorkAreas: Rectangle[] = screen.getAllDisplays().map((display) => display.workArea),
): MainWindowBounds | null => {
  const bounds = coerceBounds(candidate);
  if (!bounds) return null;

  if (!isFiniteNumber(bounds.x) || !isFiniteNumber(bounds.y)) {
    return { width: bounds.width, height: bounds.height };
  }

  if (displayWorkAreas.length === 0 || isVisibleOnAnyDisplay(bounds, displayWorkAreas)) {
    return bounds;
  }

  return { width: bounds.width, height: bounds.height };
};

export const readMainWindowState = (statePath = getMainWindowStatePath()): MainWindowState => {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<MainWindowState>;
    return {
      bounds: sanitizeMainWindowBounds(raw.bounds) || DEFAULT_MAIN_WINDOW_BOUNDS,
      isMaximized: raw.isMaximized === true,
    };
  } catch {
    return {
      bounds: DEFAULT_MAIN_WINDOW_BOUNDS,
      isMaximized: false,
    };
  }
};

export const writeMainWindowState = (
  state: MainWindowState,
  statePath = getMainWindowStatePath(),
): void => {
  const normalizedState: MainWindowState = {
    bounds: sanitizeMainWindowBounds(state.bounds) || DEFAULT_MAIN_WINDOW_BOUNDS,
    isMaximized: state.isMaximized === true,
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(normalizedState, null, 2), 'utf8');
};

const getPersistableBounds = (win: BrowserWindow): MainWindowBounds => {
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  return sanitizeMainWindowBounds(bounds) || DEFAULT_MAIN_WINDOW_BOUNDS;
};

export const installMainWindowStatePersistence = (
  win: BrowserWindow,
  statePath = getMainWindowStatePath(),
): void => {
  let saveTimer: NodeJS.Timeout | null = null;

  const saveNow = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (win.isDestroyed()) return;
    writeMainWindowState({
      bounds: getPersistableBounds(win),
      isMaximized: win.isMaximized(),
    }, statePath);
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  };

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('maximize', saveNow);
  win.on('unmaximize', saveNow);
  win.on('close', saveNow);
};
