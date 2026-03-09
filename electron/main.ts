import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
console.log('--- MAIN PROCESS START ---');
console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
import * as path from 'path';
import * as fs from 'fs';
import { gitService } from './GitService';
import { githubService } from './GitHubService';

const isDev = process.env.NODE_ENV === 'development';

interface StoredData {
  repos: { path: string; lastOpened: number }[];
  activeRepo: string | null;
}

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'repos.json');
}

function readStoreData(): StoredData {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { repos: [], activeRepo: null };
  }
}

function writeStoreData(data: StoredData): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2));
}

const GITHUB_TOKEN_STORE_FILE = 'github-token.bin';

function getGithubTokenStorePath(): string {
  return path.join(app.getPath('userData'), GITHUB_TOKEN_STORE_FILE);
}

function saveGithubTokenSecurely(token: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('OS-backed encryption is not available. GitHub token will not be persisted.');
    return false;
  }

  const encrypted = safeStorage.encryptString(token);
  fs.writeFileSync(getGithubTokenStorePath(), encrypted, { mode: 0o600 });
  return true;
}

function readSavedGithubToken(): string | null {
  const tokenPath = getGithubTokenStorePath();
  if (!fs.existsSync(tokenPath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const encrypted = fs.readFileSync(tokenPath);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

function clearSavedGithubTokenSecurely(): void {
  const tokenPath = getGithubTokenStorePath();
  if (!fs.existsSync(tokenPath)) return;

  try {
    const stat = fs.statSync(tokenPath);
    const randomOverwrite = Buffer.alloc(stat.size);
    for (let i = 0; i < randomOverwrite.length; i += 1) {
      randomOverwrite[i] = Math.floor(Math.random() * 256);
    }
    fs.writeFileSync(tokenPath, randomOverwrite);
  } catch {
    // ignore and try to remove file below
  }

  try {
    fs.rmSync(tokenPath, { force: true });
  } catch {
    // ignore
  }
}

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
      const isRepo = await gitService.checkIsRepo();
      return { path: selectedPath, isRepo };
    }
  });

  ipcMain.handle('dialog:selectDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Zielordner für Clone auswählen'
    });
    if (canceled) return null;
    return filePaths[0];
  });

  ipcMain.handle('git:setRepo', async (_event: any, repoPath: string) => {
    gitService.setRepoPath(repoPath);
    return true;
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
      } else if (commandName === 'commitDetails') {
        const details = await gitService.getCommitDetails(args[0]);
        return { success: true, data: details };
      } else {
        const custom = await gitService.runCommand([commandName, ...args]);
        return { success: true, data: custom };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:clone', async (event, cloneUrl: string, targetDir: string) => {
    const webContents = event.sender;

    const result = await gitService.cloneRepo(cloneUrl, targetDir, (line: string) => {
      webContents.send('clone:progress', line);
    });

    return result;
  });

  ipcMain.handle('git:init', async (_event: any, repoPath: string) => {
    try {
      gitService.setRepoPath(repoPath);
      const out = await gitService.runCommand(['init']);
      return { success: true, data: out };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Repo persistence
  ipcMain.handle('repos:getStored', async () => {
    const data = readStoreData();
    data.repos = data.repos.filter(r => fs.existsSync(r.path));
    if (data.activeRepo && !data.repos.some(r => r.path === data.activeRepo)) {
      data.activeRepo = data.repos.length > 0 ? data.repos[0].path : null;
    }
    writeStoreData(data);
    return data;
  });

  ipcMain.handle('repos:setStored', async (_event: any, data: StoredData) => {
    writeStoreData(data);
    return true;
  });

  ipcMain.handle('github:auth', async (_event: any, token: string) => {
    const success = await githubService.authenticate(token);
    if (success) {
      saveGithubTokenSecurely(token);
    }
    return success;
  });

  ipcMain.handle('github:getSavedAuthStatus', async () => {
    const savedToken = readSavedGithubToken();
    return {
      hasSavedToken: Boolean(savedToken),
      authenticated: githubService.isAuthenticated(),
      username: githubService.getUsername(),
    };
  });

  ipcMain.handle('github:loginWithSavedToken', async () => {
    const savedToken = readSavedGithubToken();
    if (!savedToken) {
      githubService.logout();
      return { success: false, authenticated: false, username: null };
    }

    const success = await githubService.authenticate(savedToken);
    if (!success) {
      clearSavedGithubTokenSecurely();
      return { success: false, authenticated: false, username: null };
    }

    return {
      success: true,
      authenticated: true,
      username: githubService.getUsername(),
    };
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

  ipcMain.handle('github:createRepo', async (_event, params: { name: string; description: string; isPrivate: boolean }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };

    const name = (params?.name || '').trim();
    if (!name) {
      return { success: false, error: 'Repository name is required' };
    }

    try {
      const repo = await githubService.createRepository(name, params?.description || '', Boolean(params?.isPrivate));
      return { success: true, data: repo };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('github:logout', async () => {
    githubService.logout();
    clearSavedGithubTokenSecurely();
    return { success: true };
  });

  ipcMain.handle('github:checkAuthStatus', async () => {
    return {
      authenticated: githubService.isAuthenticated(),
      username: githubService.getUsername()
    };
  });

  ipcMain.handle('github:getPRs', async (_event, owner: string, repo: string, state: string) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const prs = await githubService.getPullRequests(owner, repo, state as any);
      return { success: true, data: prs };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('github:createPR', async (_event, params: { owner: string; repo: string; title: string; body: string; head: string; base: string }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const pr = await githubService.createPullRequest(params.owner, params.repo, params.title, params.body, params.head, params.base);
      return { success: true, data: pr };
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
