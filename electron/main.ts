import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
console.log('--- MAIN PROCESS START ---');
console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
import * as path from 'path';
import * as fs from 'fs';
import { gitService } from './GitService';
import { githubService } from './GitHubService';
import { aiService } from './AiService';
import { AppSettings, DEFAULT_SETTINGS, normalizeSettings } from './settings';

const isDev = process.env.NODE_ENV === 'development';
const APP_DISPLAY_NAME = 'Open-Git-Control';
const WINDOWS_APP_ID = 'com.opengitcontrol.app';

function resolveExistingFile(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function getWindowIconPath(): string | undefined {
  const iconFileName = process.platform === 'win32' ? 'logo.ico' : 'logo.png';
  const appPath = app.getAppPath();
  const rootPath = path.resolve(__dirname, '../../');

  return resolveExistingFile([
    path.join(appPath, iconFileName),
    path.join(rootPath, iconFileName),
    path.join(process.cwd(), iconFileName),
    path.join(process.resourcesPath, iconFileName),
  ]);
}
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
    log: 3,
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

  if (commandName === 'log' && args.length >= 1) {
    const parsedLimit = Number(args[0]);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 5000) {
      throw new Error('Invalid log limit.');
    }
  }

  if (commandName === 'log' && args.length >= 2) {
    const scope = args[1];
    if (scope !== 'all' && scope !== 'head') {
      throw new Error('Invalid log scope.');
    }
  }

  if (commandName === 'log' && args.length >= 3) {
    const parsedOffset = Number(args[2]);
    if (!Number.isFinite(parsedOffset) || parsedOffset < 0 || parsedOffset > 50000) {
      throw new Error('Invalid log offset.');
    }
  }
}

interface StoredRepoEntry {
  path: string;
  lastOpened: number;
  pinned: boolean;
}

interface StoredData {
  repos: StoredRepoEntry[];
  activeRepo: string | null;
}

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

function normalizeStoredData(input: Partial<StoredData> | null | undefined): StoredData {
  const reposInput = Array.isArray(input?.repos) ? input.repos : [];
  const seen = new Set<string>();

  const repos: StoredRepoEntry[] = reposInput
    .map((repo: any) => {
      const pathValue = typeof repo?.path === 'string' ? repo.path.trim() : '';
      if (!pathValue || seen.has(pathValue)) return null;
      seen.add(pathValue);
      const lastOpened = Number.isFinite(repo?.lastOpened) ? Number(repo.lastOpened) : Date.now();
      const pinned = typeof repo?.pinned === 'boolean' ? repo.pinned : false;
      return { path: pathValue, lastOpened, pinned };
    })
    .filter((repo: StoredRepoEntry | null): repo is StoredRepoEntry => repo !== null);

  const activeRepo = typeof input?.activeRepo === 'string' && input.activeRepo.trim().length > 0
    ? input.activeRepo
    : null;

  return { repos, activeRepo };
}

function readStoreData(): StoredData {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    return normalizeStoredData(parsed);
  } catch {
    return { repos: [], activeRepo: null };
  }
}

function writeStoreData(data: StoredData): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(normalizeStoredData(data), null, 2));
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

type RawSettingsWithLegacyKey = Partial<AppSettings> & { geminiApiKey?: unknown };

function readRawSettings(): RawSettingsWithLegacyKey | null {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    return JSON.parse(raw) as RawSettingsWithLegacyKey;
  } catch {
    return null;
  }
}

function readSettings(): AppSettings {
  const raw = readRawSettings();
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }
  return normalizeSettings(raw);
}

function writeSettings(settings: AppSettings): void {
  const normalized = normalizeSettings(settings);
  fs.writeFileSync(getSettingsPath(), JSON.stringify(normalized, null, 2));
}

const GITHUB_TOKEN_STORE_FILE = 'github-token.bin';
const GEMINI_API_KEY_STORE_FILE = 'gemini-api-key.bin';
const MAX_GEMINI_KEY_LENGTH = 500;

function normalizeGeminiApiKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, MAX_GEMINI_KEY_LENGTH);
}

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

function getGeminiApiKeyStorePath(): string {
  return path.join(app.getPath('userData'), GEMINI_API_KEY_STORE_FILE);
}

function saveGeminiApiKeySecurely(apiKey: string): boolean {
  const normalized = normalizeGeminiApiKey(apiKey);
  if (!normalized) {
    clearSavedGeminiApiKeySecurely();
    return true;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('OS-backed encryption is not available. Gemini API key will not be persisted.');
    return false;
  }

  const encrypted = safeStorage.encryptString(normalized);
  fs.writeFileSync(getGeminiApiKeyStorePath(), encrypted, { mode: 0o600 });
  return true;
}

function readSavedGeminiApiKey(): string | null {
  const keyPath = getGeminiApiKeyStorePath();
  if (!fs.existsSync(keyPath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const encrypted = fs.readFileSync(keyPath);
    return normalizeGeminiApiKey(safeStorage.decryptString(encrypted)) || null;
  } catch {
    return null;
  }
}

function clearSavedGeminiApiKeySecurely(): void {
  const keyPath = getGeminiApiKeyStorePath();
  if (!fs.existsSync(keyPath)) return;

  try {
    const stat = fs.statSync(keyPath);
    const randomOverwrite = Buffer.alloc(stat.size);
    for (let i = 0; i < randomOverwrite.length; i += 1) {
      randomOverwrite[i] = Math.floor(Math.random() * 256);
    }
    fs.writeFileSync(keyPath, randomOverwrite);
  } catch {
    // ignore and try to remove file below
  }

  try {
    fs.rmSync(keyPath, { force: true });
  } catch {
    // ignore
  }
}

function readSettingsWithMigration(): AppSettings {
  const rawSettings = readRawSettings();
  const settings = normalizeSettings(rawSettings);
  const legacyGeminiApiKey = normalizeGeminiApiKey(rawSettings?.geminiApiKey);

  if (legacyGeminiApiKey) {
    const savedSecurely = saveGeminiApiKeySecurely(legacyGeminiApiKey);
    const nextSettings = normalizeSettings({
      ...(rawSettings || {}),
      hasGeminiApiKey: savedSecurely,
    });
    writeSettings(nextSettings);
    return nextSettings;
  }

  if (rawSettings && Object.prototype.hasOwnProperty.call(rawSettings, 'geminiApiKey')) {
    const nextSettings = normalizeSettings({
      ...rawSettings,
      hasGeminiApiKey: settings.hasGeminiApiKey,
    });
    writeSettings(nextSettings);
    return nextSettings;
  }

  const hasSavedKey = Boolean(readSavedGeminiApiKey());
  if (settings.hasGeminiApiKey !== hasSavedKey) {
    const nextSettings = normalizeSettings({ ...settings, hasGeminiApiKey: hasSavedKey });
    writeSettings(nextSettings);
    return nextSettings;
  }

  return settings;
}

function getGeminiApiKeyFromSecureStore(): string {

  const key = readSavedGeminiApiKey();
  if (!key) {
    throw new Error('Gemini API key fehlt. Bitte in den Einstellungen speichern.');
  }
  return key;
}

function parseFileHistory(logOutput: string): FileHistoryEntry[] {
  if (!logOutput) return [];

  return logOutput
    .split('\x00')
    .map(record => record.replace(/^\r?\n/, '').trim())
    .filter(Boolean)
    .map(record => {
      let parts = record.split('\x1f');
      if (parts.length < 5 && record.includes('\\x1f')) {
        parts = record.split('\\x1f');
      }
      if (parts.length < 5 && record.includes('|')) {
        parts = record.split('|');
      }

      const [hashRaw = '', abbrevRaw = '', authorRaw = '', dateRaw = '', ...subjectRest] = parts;
      const hash = hashRaw.trim();
      if (!/^[0-9a-f]{7,40}$/i.test(hash)) {
        return null;
      }

      const abbrevHash = (abbrevRaw || '').trim() || hash.slice(0, 8);
      const author = (authorRaw || '').trim();
      const date = (dateRaw || '').trim();
      const subject = subjectRest.join('|').trim();

      return { hash, abbrevHash, author, date, subject };
    })
    .filter((entry): entry is FileHistoryEntry => Boolean(entry));
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
  const windowIconPath = getWindowIconPath();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: APP_DISPLAY_NAME,
    ...(windowIconPath ? { icon: windowIconPath } : {}),
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
    let longRunningJobId: string | null = null;
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
        data = await gitService.getLog(
          Number(normalizedArgs[0]) || 50,
          normalizedArgs[1] !== 'head',
          Number(normalizedArgs[2]) || 0,
        );
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

  ipcMain.handle('git:addIgnoreRule', async (_event: any, pattern: string) => {
    try {
      const normalizedPattern = String(pattern || '').trim().replace(/\\/g, '/');
      if (!normalizedPattern) {
        return { success: false, error: 'Pattern is required' };
      }
      if (normalizedPattern.length > 400) {
        return { success: false, error: 'Pattern is too long' };
      }
      if (/\r|\n/.test(normalizedPattern)) {
        return { success: false, error: 'Pattern must be a single line' };
      }

      const selectedRepo = gitService.getRepoPath();
      if (!selectedRepo) {
        return { success: false, error: 'No repository selected' };
      }

      const repoRoot = await gitService.runCommand(['rev-parse', '--show-toplevel']);
      const gitignorePath = path.join(repoRoot, '.gitignore');
      const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
      const existingRules = new Set(
        existing
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean),
      );

      if (existingRules.has(normalizedPattern)) {
        return { success: true, added: false, pattern: normalizedPattern };
      }

      const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n') && !existing.endsWith('\r\n');
      const nextContent = `${needsLeadingNewline ? '\n' : ''}${normalizedPattern}\n`;
      fs.appendFileSync(gitignorePath, nextContent, 'utf-8');
      return { success: true, added: true, pattern: normalizedPattern };
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
    return readSettingsWithMigration();
  });

  ipcMain.handle('settings:set', async (_event: any, partial: Partial<AppSettings>) => {
    const current = readSettingsWithMigration();
    const partialWithoutSecrets = { ...partial } as Partial<AppSettings> & { geminiApiKey?: unknown; hasGeminiApiKey?: unknown };
    delete partialWithoutSecrets.geminiApiKey;
    delete partialWithoutSecrets.hasGeminiApiKey;

    const next = normalizeSettings({
      ...current,
      ...partialWithoutSecrets,
      hasGeminiApiKey: current.hasGeminiApiKey,
    });

    writeSettings(next);
    return next;
  });

  ipcMain.handle('settings:setGeminiApiKey', async (_event: any, apiKey: unknown) => {
    const normalized = normalizeGeminiApiKey(apiKey);
    const current = readSettingsWithMigration();
    const saved = saveGeminiApiKeySecurely(normalized);
    const next = normalizeSettings({
      ...current,
      hasGeminiApiKey: normalized ? saved : false,
    });
    writeSettings(next);
    return next;
  });

  ipcMain.handle('settings:clearGeminiApiKey', async () => {
    const current = readSettingsWithMigration();
    clearSavedGeminiApiKeySecurely();
    const next = normalizeSettings({ ...current, hasGeminiApiKey: false });
    writeSettings(next);
    return next;
  });

  ipcMain.handle('ai:testConnection', async () => {
    try {
      const settings = readSettingsWithMigration();
      const result = await aiService.testConnection(settings, getGeminiApiKeyFromSecureStore);
      return { success: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'KI-Verbindung fehlgeschlagen.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('ai:listModels', async () => {
    try {
      const settings = readSettingsWithMigration();
      const models = await aiService.listModels(settings, getGeminiApiKeyFromSecureStore);
      return { success: true, data: models };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'KI-Modelle konnten nicht geladen werden.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('git:aiAutoCommit', async () => {
    try {
      const settings = readSettingsWithMigration();
      const result = await aiService.runAutoCommit(settings, getGeminiApiKeyFromSecureStore);
      return { success: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'KI Auto-Commit fehlgeschlagen.';
      return { success: false, error: message };
    }
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
      oauthConfigured: Boolean((process.env.GITHUB_OAUTH_CLIENT_ID || '').trim()),
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

  ipcMain.handle('github:deviceStart', async () => {
    try {
      const flow = await githubService.startDeviceFlow();
      return { success: true, data: flow };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Device Flow konnte nicht gestartet werden.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('github:devicePoll', async (_event: any, deviceCode: string) => {
    try {
      const normalizedDeviceCode = (deviceCode || '').trim();
      if (!normalizedDeviceCode) {
        return { success: false, error: 'device_code fehlt' };
      }

      const result = await githubService.pollDeviceFlow(normalizedDeviceCode);
      if (result.status === 'pending') {
        return { success: true, data: { status: 'pending', interval: result.interval || null } };
      }

      if (result.status === 'error') {
        return {
          success: true,
          data: {
            status: 'error',
            error: result.error,
            errorDescription: result.errorDescription || null,
          },
        };
      }

      const authenticated = await githubService.authenticate(result.accessToken);
      if (!authenticated) {
        return { success: false, error: 'Authentifizierung mit Device-Flow Token fehlgeschlagen.' };
      }

      saveGithubTokenSecurely(result.accessToken);
      return {
        success: true,
        data: {
          status: 'success',
          username: githubService.getUsername(),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Device Flow Polling fehlgeschlagen.';
      return { success: false, error: message };
    }
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
  app.setName(APP_DISPLAY_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId(WINDOWS_APP_ID);
  }

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











