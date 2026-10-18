import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { installExternalWindowHandler } from './externalLinks';
import { readSettings } from './settingsStore';
import { installTextContextMenu } from './textContextMenu';
import { installMainWindowStatePersistence, readMainWindowState } from './windowState';
import { watchStartupWindow } from './startupDiagnostics';

function resolveExistingFile(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function getWindowIconPath(mainProcessDir: string): string | undefined {
  const iconFileName = process.platform === 'win32' ? 'logo.ico' : 'logo.png';
  const appPath = app.getAppPath();
  const rootPath = path.resolve(mainProcessDir, '../../');

  return resolveExistingFile([
    path.join(appPath, iconFileName),
    path.join(rootPath, iconFileName),
    path.join(process.cwd(), iconFileName),
    path.join(process.resourcesPath, iconFileName),
  ]);
}

export function createMainWindow(isDev: boolean, appDisplayName: string, mainProcessDir: string): void {
  const windowIconPath = getWindowIconPath(mainProcessDir);
  const savedWindowState = readMainWindowState();

  const win = new BrowserWindow({
    ...savedWindowState.bounds,
    title: appDisplayName,
    autoHideMenuBar: true,
    // Keep the native surface opaque and close to the app's default background
    // before the renderer paints, including when Windows restores the window.
    backgroundColor: '#0f1214',
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    webPreferences: {
      preload: path.join(mainProcessDir, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: isDev,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: true,
    },
  });
  watchStartupWindow(win);
  installMainWindowStatePersistence(win);
  if (savedWindowState.isMaximized) {
    win.maximize();
  }

  win.setMenuBarVisibility(false);
  win.removeMenu();
  installExternalWindowHandler(win);
  installTextContextMenu(win, () => readSettings().language);

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(mainProcessDir, '../../dist/index.html'));
  }
}
