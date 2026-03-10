import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
console.log('--- MAIN PROCESS START ---');
console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
import * as path from 'path';
import * as fs from 'fs';
import { gitService } from './GitService';
import { githubService } from './GitHubService';

const isDev = process.env.NODE_ENV === 'development';
type GitCommandName =
  | 'status'
  | 'statusPorcelain'
  | 'log'
  | 'branches'
  | 'commitDetails'
  | 'conflictTakeOurs'
  | 'conflictTakeTheirs'
  | 'conflictMarkResolved'
  | 'mergeContinue'
  | 'mergeAbort'
  | 'rebaseContinue'
  | 'rebaseAbort'
  | 'branch'
  | 'remote'
  | 'tag'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'checkout'
  | 'commit'
  | 'reset'
  | 'clean'
  | 'stash'
  | 'diff'
  | 'show'
  | 'add'
  | 'cherry-pick'
  | 'revert'
  | 'merge';

type JobEventStatus = 'start' | 'progress' | 'done' | 'failed' | 'cancelled';

type JobEventPayload = {
  id: string;
  operation: string;
  status: JobEventStatus;
  message?: string;
  progress?: number;
  timestamp: number;
};

const ALLOWED_GIT_COMMANDS: Set<GitCommandName> = new Set([
  'status',
  'statusPorcelain',
  'log',
  'branches',
  'commitDetails',
  'conflictTakeOurs',
  'conflictTakeTheirs',
  'conflictMarkResolved',
  'mergeContinue',
  'mergeAbort',
  'rebaseContinue',
  'rebaseAbort',
  'branch',
  'remote',
  'tag',
  'fetch',
  'pull',
  'push',
  'checkout',
  'commit',
  'reset',
  'clean',
  'stash',
  'diff',
  'show',
  'add',
  'cherry-pick',
  'revert',
  'merge',
]);

function createJobId(operation: string): string {
  return operation + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function emitJobEvent(webContents: Electron.WebContents, event: JobEventPayload): void {
  webContents.send('job:event', event);
}

function sanitizeArg(arg: unknown): string {
  if (typeof arg !== 'string') {
    throw new Error('Invalid git argument type.');
  }

  if (!arg.trim()) {
    throw new Error('Empty git arguments are not allowed.');
  }

  if (arg.length > 512) {
    throw new Error('Git argument too long.');
  }

  if (/[\0\r\n]/.test(arg)) {
    throw new Error('Control characters are not allowed in git arguments.');
  }

  return arg;
}

function normalizeArgs(args: unknown[]): string[] {
  return args.map(sanitizeArg);
}

function assertAllowedGitCommand(commandName: unknown): asserts commandName is GitCommandName {
  if (typeof commandName !== 'string' || !ALLOWED_GIT_COMMANDS.has(commandName as GitCommandName)) {
    throw new Error('Git command not allowed.');
  }
}

function validateCommandArgs(commandName: GitCommandName, args: string[]): void {
  const maxArgsByCommand: Partial<Record<GitCommandName, number>> = {
    status: 2,
    statusPorcelain: 0,
    log: 1,
    branches: 0,
    commitDetails: 1,
    conflictTakeOurs: 1,
    conflictTakeTheirs: 1,
    conflictMarkResolved: 1,
    mergeContinue: 0,
    mergeAbort: 0,
    rebaseContinue: 0,
    rebaseAbort: 0,
    fetch: 8,
    pull: 6,
    push: 8,
    branch: 4,
    remote: 4,
    tag: 6,
    checkout: 5,
    commit: 4,
    reset: 4,
    clean: 4,
    stash: 6,
    diff: 6,
    show: 6,
    add: 4,
    'cherry-pick': 3,
    revert: 5,
    merge: 4,
  };

  const max = maxArgsByCommand[commandName];
  if (typeof max === 'number' && args.length > max) {
    throw new Error('Too many args for git ' + commandName + '.');
  }

  if (commandName === 'log' && args.length === 1) {
    const parsedLimit = Number(args[0]);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 5000) {
      throw new Error('Invalid log limit.');
    }
  }
}

interface StoredData {
  repos: { path: string; lastOpened: number }[];
  activeRepo: string | null;
}

interface AppSettings {
  theme: 'dark' | 'light';
  language: 'de' | 'en';
  autoFetchIntervalMs: number;
  defaultBranch: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'de',
  autoFetchIntervalMs: 60_000,
  defaultBranch: 'main',
};

interface FileHistoryEntry {
  hash: string;
  abbrevHash: string;
  author: string;
  date: string;
  subject: string;
}

interface FileBlameLine {
  lineNumber: number;
  commitHash: string;
  abbrevHash: string;
  author: string;
  authorTime: string;
  summary: string;
  content: string;
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

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      autoFetchIntervalMs: Number.isFinite(parsed.autoFetchIntervalMs)
        ? Math.max(10_000, Math.min(parsed.autoFetchIntervalMs as number, 300_000))
        : DEFAULT_SETTINGS.autoFetchIntervalMs,
      defaultBranch: (parsed.defaultBranch || DEFAULT_SETTINGS.defaultBranch).trim() || DEFAULT_SETTINGS.defaultBranch,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: AppSettings): void {
  const normalized: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    autoFetchIntervalMs: Math.max(10_000, Math.min(settings.autoFetchIntervalMs, 300_000)),
    defaultBranch: settings.defaultBranch.trim() || DEFAULT_SETTINGS.defaultBranch,
  };

  fs.writeFileSync(getSettingsPath(), JSON.stringify(normalized, null, 2));
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

function parseFileHistory(logOutput: string): FileHistoryEntry[] {
  if (!logOutput) return [];

  return logOutput
    .split('\x00')
    .map(record => record.trim())
    .filter(Boolean)
    .map(record => {
      const [hash = '', abbrevHash = '', author = '', date = '', subject = ''] = record.split('\\x1f');
      return { hash, abbrevHash, author, date, subject };
    });
}

function parseFileBlame(blameOutput: string): FileBlameLine[] {
  if (!blameOutput.trim()) return [];

  const lines = blameOutput.split('\n');
  const parsed: FileBlameLine[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i]?.trim() || '';
    const headerMatch = header.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)\s+\d+$/i);

    if (!headerMatch) {
      continue;
    }

    const commitHash = headerMatch[1];
    const lineNumber = Number(headerMatch[2]);
    let author = 'Unknown';
    let authorTime = '';
    let summary = '';
    let content = '';

    for (i += 1; i < lines.length; i += 1) {
      const metaLine = lines[i];
      if (metaLine.startsWith('\t')) {
        content = metaLine.slice(1);
        break;
      }
      if (metaLine.startsWith('author ')) {
        author = metaLine.slice('author '.length).trim() || 'Unknown';
      } else if (metaLine.startsWith('author-time ')) {
        const unixSeconds = Number(metaLine.slice('author-time '.length).trim());
        if (Number.isFinite(unixSeconds)) {
          authorTime = new Date(unixSeconds * 1000).toISOString();
        }
      } else if (metaLine.startsWith('summary ')) {
        summary = metaLine.slice('summary '.length).trim();
      }
    }

    parsed.push({
      lineNumber,
      commitHash,
      abbrevHash: commitHash.slice(0, 8),
      author,
      authorTime,
      summary,
      content,
    });
  }

  return parsed;
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

  ipcMain.handle('git:command', async (event: any, commandName: unknown, ...rawArgs: unknown[]) => {
    try {
      assertAllowedGitCommand(commandName);
      const normalizedArgs = normalizeArgs(rawArgs);
      validateCommandArgs(commandName, normalizedArgs);

      const isLongRunning = commandName === 'fetch' || commandName === 'pull' || commandName === 'push';
      const jobId = isLongRunning ? createJobId(`git-${commandName}`) : null;

      if (jobId) {
        emitJobEvent(event.sender, {
          id: jobId,
          operation: `git:${commandName}`,
          status: 'start',
          timestamp: Date.now(),
        });
      }

      let data: string;
      if (commandName === 'status') {
        data = await gitService.getStatus();
      } else if (commandName === 'statusPorcelain') {
        data = await gitService.getStatusPorcelain();
      } else if (commandName === 'log') {
        data = await gitService.getLog(Number(normalizedArgs[0]) || 50);
      } else if (commandName === 'branches') {
        data = await gitService.getBranches();
      } else if (commandName === 'commitDetails') {
        data = await gitService.getCommitDetails(normalizedArgs[0]);
      } else if (commandName === 'conflictTakeOurs') {
        data = await gitService.checkoutConflictVersion(normalizedArgs[0], 'ours');
      } else if (commandName === 'conflictTakeTheirs') {
        data = await gitService.checkoutConflictVersion(normalizedArgs[0], 'theirs');
      } else if (commandName === 'conflictMarkResolved') {
        data = await gitService.addFile(normalizedArgs[0]);
      } else if (commandName === 'mergeContinue') {
        data = await gitService.continueMerge();
      } else if (commandName === 'mergeAbort') {
        data = await gitService.abortMerge();
      } else if (commandName === 'rebaseContinue') {
        data = await gitService.continueRebase();
      } else if (commandName === 'rebaseAbort') {
        data = await gitService.abortRebase();
      } else {
        data = await gitService.runCommand([commandName, ...normalizedArgs]);
      }

      if (jobId) {
        emitJobEvent(event.sender, {
          id: jobId,
          operation: `git:${commandName}`,
          status: 'done',
          timestamp: Date.now(),
        });
      }

      return { success: true, data };
    } catch (error: any) {
      if (typeof commandName === 'string' && (commandName === 'fetch' || commandName === 'pull' || commandName === 'push')) {
        emitJobEvent(event.sender, {
          id: createJobId(`git-${commandName}`),
          operation: `git:${commandName}`,
          status: 'failed',
          message: error.message,
          timestamp: Date.now(),
        });
      }
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle('git:fileHistory', async (_event: any, filePath: string, commitHash?: string, limit: number = 100) => {
    try {
      const normalizedPath = (filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const raw = await gitService.getFileHistory(normalizedPath, limit, commitHash);
      return { success: true, data: parseFileHistory(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:fileBlame', async (_event: any, filePath: string, commitHash?: string) => {
    try {
      const normalizedPath = (filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const raw = await gitService.getFileBlame(normalizedPath, commitHash);
      return { success: true, data: parseFileBlame(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:clone', async (event, cloneUrl: string, targetDir: string) => {
    const webContents = event.sender;
    const jobId = createJobId('git-clone');

    emitJobEvent(webContents, {
      id: jobId,
      operation: 'git:clone',
      status: 'start',
      timestamp: Date.now(),
    });

    const result = await gitService.cloneRepo(cloneUrl, targetDir, (line: string) => {
      webContents.send('clone:progress', line);
      emitJobEvent(webContents, {
        id: jobId,
        operation: 'git:clone',
        status: 'progress',
        message: line,
        timestamp: Date.now(),
      });
    });

    emitJobEvent(webContents, {
      id: jobId,
      operation: 'git:clone',
      status: result.success ? 'done' : 'failed',
      message: result.error,
      timestamp: Date.now(),
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
  ipcMain.handle('settings:get', async () => {
    return readSettings();
  });

  ipcMain.handle('settings:set', async (_event: any, partial: Partial<AppSettings>) => {
    const current = readSettings();
    const next: AppSettings = {
      ...current,
      ...partial,
    };
    writeSettings(next);
    return next;
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
    if (!githubService.isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    const name = (params?.name || '').trim();
    if (!name) {
      return { success: false, error: 'Repository name is required' };
    }

    try {
      const repo = await githubService.createRepository(name, params?.description || '', Boolean(params?.isPrivate));
      return { success: true, data: repo };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create repository';
      return { success: false, error: message };
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
