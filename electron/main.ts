const { app, BrowserWindow, ipcMain, dialog } = require('electron');
import * as path from 'path';
import { gitService } from './GitService';
import { githubService } from './GitHubService';

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

function setupIPC() {
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (canceled) {
      return null;
    } else {
      const selectedPath = filePaths[0];
      gitService.setRepoPath(selectedPath);
      // Check if it's a valid repo
      const isRepo = await gitService.checkIsRepo();
      return { path: selectedPath, isRepo };
    }
  });
  
  ipcMain.handle('git:command', async (_event: any, commandName: string, ...args: any[]) => {
    try {
      if (commandName === 'status') {
        const status = await gitService.getStatus();
        return { success: true, data: status };
      } else if (commandName === 'log') {
        const log = await gitService.getLog(args[0] || 50);
        return { success: true, data: log };
      } else if (commandName === 'branches') {
        const branches = await gitService.getBranches();
        return { success: true, data: branches };
      } else {
        const custom = await gitService.runCommand([commandName, ...args]);
        return { success: true, data: custom };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('github:auth', async (_event: any, token: string) => {
    const success = await githubService.authenticate(token);
    return success;
  });

  ipcMain.handle('github:getRepos', async () => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const repos = await githubService.getMyRepositories();
      return { success: true, data: repos };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
