import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { installExternalWindowHandler } from './externalLinks';

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

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: appDisplayName,
    autoHideMenuBar: true,
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
    },
  });
  win.setMenuBarVisibility(false);
  win.removeMenu();
  installExternalWindowHandler(win);

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(mainProcessDir, '../../dist/index.html'));
  }
}
