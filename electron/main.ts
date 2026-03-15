import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } from 'electron';
console.log('--- MAIN PROCESS START ---');
console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { gitService } from './GitService';
import { githubService } from './GitHubService';
import { aiService, type ReleaseCommitInput } from './AiService';
import { AppSettings, DEFAULT_SETTINGS, normalizeSettings } from './settings';
import { SecretScanService } from './SecretScanService';
import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';

const isDev = process.env.NODE_ENV === 'development';
const APP_DISPLAY_NAME = 'Open-Git-Control';
const WINDOWS_APP_ID = 'com.opengitcontrol.app';
const GITHUB_CLI_INSTALL_URL = 'https://cli.github.com/';
const GITHUB_CLI_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const GITHUB_CLI_TOKEN_TIMEOUT_MS = 30 * 1000;
const UPDATER_CHECK_TIMEOUT_MS = 45 * 1000;
const UPDATER_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const UPDATER_STATE_WAIT_TIMEOUT_MS = 5 * 1000;
const UPDATER_STATE_POLL_INTERVAL_MS = 150;
const execFileAsync = promisify(execFile);

type UpdaterState =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'no-update'
  | 'downloading'
  | 'downloaded'
  | 'error';

type UpdaterStatusPayload = {
  isSupported: boolean;
  state: UpdaterState;
  currentVersion: string;
  availableVersion: string | null;
  downloaded: boolean;
  downloadPercent: number | null;
  bytesPerSecond: number | null;
  transferred: number | null;
  total: number | null;
  lastCheckedAt: number | null;
  releaseNotes: string | null;
  error: string | null;
};

const AUTO_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
let autoUpdateInterval: NodeJS.Timeout | null = null;
let updaterStatus: UpdaterStatusPayload = {
  isSupported: !isDev,
  state: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  downloaded: false,
  downloadPercent: null,
  bytesPerSecond: null,
  transferred: null,
  total: null,
  lastCheckedAt: null,
  releaseNotes: null,
  error: null,
};

function emitUpdaterEvent(): void {
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    browserWindow.webContents.send('updater:event', updaterStatus);
  }
}

function setUpdaterStatus(patch: Partial<UpdaterStatusPayload>): void {
  updaterStatus = {
    ...updaterStatus,
    ...patch,
  };
  emitUpdaterEvent();
}

function formatUpdaterError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Unbekannter Update-Fehler.';
}

function normalizeReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string | null {
  if (!releaseNotes) return null;
  if (typeof releaseNotes === 'string') {
    const trimmed = releaseNotes.trim();
    return trimmed || null;
  }

  const normalized = releaseNotes
    .map((item) => {
      if (item && typeof item.note === 'string') return item.note.trim();
      return '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return normalized || null;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    operation
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function waitForUpdaterState(targetStates: UpdaterState[], timeoutMs: number): Promise<UpdaterStatusPayload> {
  if (targetStates.includes(updaterStatus.state)) {
    return Promise.resolve(updaterStatus);
  }

  return new Promise((resolve, reject) => {
    let interval: NodeJS.Timeout | null = null;

    const timeout = setTimeout(() => {
      if (interval) {
        clearInterval(interval);
      }
      reject(new Error(`Updater status timeout while waiting for: ${targetStates.join(', ')}`));
    }, timeoutMs);

    interval = setInterval(() => {
      if (targetStates.includes(updaterStatus.state)) {
        clearTimeout(timeout);
        if (interval) {
          clearInterval(interval);
        }
        resolve(updaterStatus);
      }
    }, UPDATER_STATE_POLL_INTERVAL_MS);

    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }
    if (interval && typeof interval.unref === 'function') {
      interval.unref();
    }
  });
}

async function checkForAppUpdates(): Promise<{ success: boolean; error?: string }> {
  if (!updaterStatus.isSupported) {
    return { success: false, error: 'Auto-Updates sind nur in der installierten App verfuegbar.' };
  }

  setUpdaterStatus({
    state: 'checking',
    currentVersion: app.getVersion(),
    lastCheckedAt: Date.now(),
    error: null,
    downloadPercent: null,
    bytesPerSecond: null,
    transferred: null,
    total: null,
    downloaded: false,
  });

  try {
    await withTimeout(
      autoUpdater.checkForUpdates(),
      UPDATER_CHECK_TIMEOUT_MS,
      'Die Update-Pruefung hat das Zeitlimit ueberschritten.',
    );
    return { success: true };
  } catch (error: unknown) {
    const message = formatUpdaterError(error);
    setUpdaterStatus({
      state: 'error',
      error: message,
      lastCheckedAt: Date.now(),
    });
    return { success: false, error: message };
  }
}

async function downloadAvailableUpdate(): Promise<{ success: boolean; error?: string }> {
  if (!updaterStatus.isSupported) {
    return { success: false, error: 'Auto-Updates sind nur in der installierten App verfuegbar.' };
  }

  if (updaterStatus.state !== 'update-available') {
    return { success: false, error: 'Es ist kein herunterladbares Update verfuegbar.' };
  }

  setUpdaterStatus({
    state: 'downloading',
    downloadPercent: 0,
    bytesPerSecond: null,
    transferred: null,
    total: null,
    error: null,
  });

  try {
    await withTimeout(
      autoUpdater.downloadUpdate(),
      UPDATER_DOWNLOAD_TIMEOUT_MS,
      'Der Update-Download hat das Zeitlimit ueberschritten.',
    );
    return { success: true };
  } catch (error: unknown) {
    const message = formatUpdaterError(error);
    setUpdaterStatus({
      state: 'error',
      error: message,
    });
    return { success: false, error: message };
  }
}

function installDownloadedUpdate(): { success: boolean; error?: string } {
  if (!updaterStatus.isSupported) {
    return { success: false, error: 'Auto-Updates sind nur in der installierten App verfuegbar.' };
  }

  if (updaterStatus.state !== 'downloaded') {
    return { success: false, error: 'Es wurde noch kein Update heruntergeladen.' };
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });

  return { success: true };
}

async function runOneClickUpdate(): Promise<{ success: boolean; action?: 'no-update' | 'downloaded'; error?: string }> {
  if (!updaterStatus.isSupported) {
    return { success: false, error: 'Auto-Updates sind nur in der installierten App verfuegbar.' };
  }

  if (updaterStatus.state === 'downloaded') {
    return { success: true, action: 'downloaded' };
  }

  let stateAfterCheck: UpdaterStatusPayload;

  if (updaterStatus.state === 'update-available') {
    stateAfterCheck = updaterStatus;
  } else {
    const checkResult = await checkForAppUpdates();
    if (!checkResult.success) {
      return checkResult;
    }

    try {
      stateAfterCheck = await waitForUpdaterState(
        ['no-update', 'update-available', 'downloaded', 'error'],
        UPDATER_STATE_WAIT_TIMEOUT_MS,
      );
    } catch (error: unknown) {
      const message = formatUpdaterError(error);
      setUpdaterStatus({
        state: 'error',
        error: message,
        lastCheckedAt: Date.now(),
      });
      return { success: false, error: message };
    }
  }

  if (stateAfterCheck.state === 'no-update') {
    return { success: true, action: 'no-update' };
  }

  if (stateAfterCheck.state === 'downloaded') {
    return { success: true, action: 'downloaded' };
  }

  if (stateAfterCheck.state === 'error') {
    return { success: false, error: stateAfterCheck.error || 'Update-Pruefung fehlgeschlagen.' };
  }

  const downloadResult = await downloadAvailableUpdate();
  if (!downloadResult.success) {
    return downloadResult;
  }

  let stateAfterDownload: UpdaterStatusPayload;
  try {
    stateAfterDownload = await waitForUpdaterState(['downloaded', 'error'], UPDATER_DOWNLOAD_TIMEOUT_MS);
  } catch (error: unknown) {
    const message = formatUpdaterError(error);
    setUpdaterStatus({
      state: 'error',
      error: message,
    });
    return { success: false, error: message };
  }

  if (stateAfterDownload.state === 'downloaded') {
    return { success: true, action: 'downloaded' };
  }

  return { success: false, error: stateAfterDownload.error || 'Update konnte nicht heruntergeladen werden.' };
}

function configureAutoUpdates(): void {
  if (isDev) {
    setUpdaterStatus({
      isSupported: false,
      currentVersion: app.getVersion(),
      state: 'idle',
      error: null,
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdaterStatus({
      state: 'checking',
      currentVersion: app.getVersion(),
      lastCheckedAt: Date.now(),
      error: null,
      downloadPercent: null,
      bytesPerSecond: null,
      transferred: null,
      total: null,
      downloaded: false,
    });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setUpdaterStatus({
      state: 'update-available',
      availableVersion: info.version || null,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      error: null,
      downloaded: false,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdaterStatus({
      state: 'no-update',
      availableVersion: null,
      releaseNotes: null,
      downloaded: false,
      downloadPercent: null,
      bytesPerSecond: null,
      transferred: null,
      total: null,
      error: null,
      lastCheckedAt: Date.now(),
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setUpdaterStatus({
      state: 'downloading',
      downloadPercent: Number.isFinite(progress.percent) ? progress.percent : 0,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
      error: null,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setUpdaterStatus({
      state: 'downloaded',
      availableVersion: info.version || updaterStatus.availableVersion,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes) || updaterStatus.releaseNotes,
      downloaded: true,
      downloadPercent: 100,
      error: null,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    setUpdaterStatus({
      state: 'error',
      error: formatUpdaterError(error),
      lastCheckedAt: Date.now(),
    });
  });

  void checkForAppUpdates();

  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
  }

  autoUpdateInterval = setInterval(() => {
    void checkForAppUpdates();
  }, AUTO_UPDATE_CHECK_INTERVAL_MS);

  autoUpdateInterval.unref();
}

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

type ExecErrorLike = Error & {
  stderr?: string;
  stdout?: string;
  code?: string | number;
};

function formatExecError(error: unknown): string {
  if (typeof error === 'string') {
    return error.trim();
  }

  if (!(error instanceof Error)) {
    return 'Unknown command error.';
  }

  const execError = error as ExecErrorLike;
  const stderr = typeof execError.stderr === 'string' ? execError.stderr.trim() : '';
  const stdout = typeof execError.stdout === 'string' ? execError.stdout.trim() : '';
  return stderr || stdout || error.message;
}

async function runGhCommand(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync('gh', args, {
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

async function readGithubCliToken(): Promise<string | null> {
  try {
    const { stdout } = await runGhCommand(['auth', 'token', '--hostname', 'github.com'], GITHUB_CLI_TOKEN_TIMEOUT_MS);
    const token = stdout.trim();
    return token || null;
  } catch {
    return null;
  }
}

async function runGithubCliOneClickLogin(): Promise<{ accessToken: string }> {
  try {
    await runGhCommand(['--version'], GITHUB_CLI_TOKEN_TIMEOUT_MS);
  } catch {
    throw new Error(`GitHub CLI (gh) wurde nicht gefunden. Bitte installieren: ${GITHUB_CLI_INSTALL_URL}`);
  }

  const existingToken = await readGithubCliToken();
  if (existingToken) {
    return { accessToken: existingToken };
  }

  try {
    await runGhCommand(
      ['auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https', '--scopes', 'repo,read:user'],
      GITHUB_CLI_LOGIN_TIMEOUT_MS,
    );
  } catch (error: unknown) {
    const detail = formatExecError(error);
    throw new Error(`GitHub 1-Klick Login fehlgeschlagen. ${detail}`);
  }

  const token = await readGithubCliToken();
  if (!token) {
    throw new Error('GitHub Login wurde abgeschlossen, aber kein Token wurde von gh geliefert.');
  }

  return { accessToken: token };
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
  | 'merge'
  | 'submoduleStatus'
  | 'submoduleUpdateInitRecursive'
  | 'submoduleSyncRecursive'
  | 'reflog'
  | 'forensicHistory';

type JobEventStatus = 'start' | 'progress' | 'done' | 'failed' | 'cancelled';

type JobEventPayload = {
  id: string;
  operation: string;
  status: JobEventStatus;
  message?: string;
  progress?: number;
  details?: Record<string, unknown>;
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
  'submoduleStatus',
  'submoduleUpdateInitRecursive',
  'submoduleSyncRecursive',
  'reflog',
  'forensicHistory',
]);

function createJobId(operation: string): string {
  return operation + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

let currentAiAutoCommitJob: { id: string; cancelRequested: boolean } | null = null;
const secretScanService = new SecretScanService(gitService);

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
    submoduleStatus: 0,
    submoduleUpdateInitRecursive: 0,
    submoduleSyncRecursive: 0,
    reflog: 1,
    forensicHistory: 6,
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

  if (commandName === 'reflog' && args.length >= 1) {
    const parsedLimit = Number(args[0]);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      throw new Error('Invalid reflog limit.');
    }
  }

  if (commandName === 'forensicHistory') {
    const searchType = args[0];
    const targetPath = args[1];
    if (!searchType || !['string', 'regex', 'line'].includes(searchType)) {
      throw new Error('Invalid forensic search type.');
    }
    if (!targetPath) {
      throw new Error('Forensic path is required.');
    }

    const parsedLimit = Number(args[5] || '200');
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      throw new Error('Invalid forensic limit.');
    }

    if (searchType === 'line') {
      const parsedStart = Number(args[3]);
      const parsedEnd = Number(args[4]);
      if (!Number.isFinite(parsedStart) || parsedStart < 1) {
        throw new Error('Invalid forensic start line.');
      }
      if (!Number.isFinite(parsedEnd) || parsedEnd < parsedStart) {
        throw new Error('Invalid forensic end line.');
      }
    } else if (!args[2]) {
      throw new Error('Forensic search term is required.');
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

interface StashEntry {
  index: number;
  name: string;
  hash: string;
  branch: string;
  subject: string;
}

type ReleaseCommit = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
};

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

function parseReleaseCommits(raw: string): ReleaseCommit[] {
  if (!raw.trim()) return [];

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, subject, author, date] = line.split('\x1f');
      return {
        hash: String(hash || '').trim(),
        shortHash: String(shortHash || '').trim(),
        subject: String(subject || '').trim(),
        author: String(author || '').trim(),
        date: String(date || '').trim(),
      };
    })
    .filter((entry) => Boolean(entry.hash && entry.shortHash && entry.subject));
}

function parseStashList(stashOutput: string): StashEntry[] {
  if (!stashOutput.trim()) return [];

  return stashOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^stash@\{(\d+)\}:\s*(?:On|WIP on)\s+([^:]+):\s*(.+)$/i);
      if (!match) {
        return null;
      }

      const index = Number(match[1]);
      const branch = (match[2] || '').trim();
      const subject = (match[3] || '').trim();
      const hashMatch = subject.match(/^([0-9a-f]{7,40})\s+/i);
      const hash = hashMatch ? hashMatch[1] : '';

      return {
        index,
        name: `stash@{${index}}`,
        hash,
        branch,
        subject,
      };
    })
    .filter((entry): entry is StashEntry => Boolean(entry));
}

function sanitizeRemoteUrl(value: string): string {
  if (!value) return value;
  return value.replace(/:\/\/[^@\s]+@/g, '://***@');
}

async function buildDiagnosticsReport(): Promise<{ generatedAt: string; appVersion: string; platform: string; activeRepo: string | null; report: string }> {
  const generatedAt = new Date().toISOString();
  const settings = readSettingsWithMigration();
  const activeRepo = gitService.getRepoPath();

  const lines: string[] = [];
  lines.push('Open-Git-Control Diagnostics');
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Version: ${app.getVersion()}`);
  lines.push(`Platform: ${process.platform} ${process.arch}`);
  lines.push(`Node: ${process.version}`);
  lines.push(`Electron: ${process.versions.electron || ''}`);
  lines.push(`Active repo: ${activeRepo || '(none)'}`);
  lines.push('');
  lines.push('[Settings]');
  lines.push(`language=${settings.language}`);
  lines.push(`theme=${settings.theme}`);
  lines.push(`autoFetchIntervalMs=${settings.autoFetchIntervalMs}`);
  lines.push(`confirmDangerousOps=${settings.confirmDangerousOps}`);
  lines.push(`showSecondaryHistory=${settings.showSecondaryHistory}`);
  lines.push(`secretScanBeforePushEnabled=${settings.secretScanBeforePushEnabled}`);
  lines.push(`secretScanStrictness=${settings.secretScanStrictness}`);
  lines.push(`secretScanAllowlistEntries=${settings.secretScanAllowlist.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#')).length}`);
  lines.push(`aiProvider=${settings.aiProvider}`);
  lines.push(`githubHost=${settings.githubHost}`);
  lines.push(`oauthConfigured=${githubService.isDeviceFlowConfigured(settings.githubOauthClientId, settings.githubHost)}`);
  lines.push(`hasGeminiApiKey=${settings.hasGeminiApiKey}`);

  lines.push('');
  lines.push('[Updater]');
  lines.push(`state=${updaterStatus.state}`);
  lines.push(`availableVersion=${updaterStatus.availableVersion || ''}`);
  lines.push(`downloaded=${updaterStatus.downloaded}`);
  lines.push(`lastError=${updaterStatus.error || ''}`);

  if (activeRepo) {
    lines.push('');
    lines.push('[Git]');
    try {
      const status = await gitService.runCommand(['status', '-sb']);
      lines.push('status -sb:');
      lines.push(status || '(empty)');
    } catch (error: any) {
      lines.push(`status -sb failed: ${error?.message || String(error)}`);
    }

    try {
      const remotes = await gitService.runCommand(['remote', '-v']);
      lines.push('');
      lines.push('remote -v:');
      lines.push(
        remotes
          .split('\n')
          .map(line => sanitizeRemoteUrl(line))
          .join('\n') || '(empty)',
      );
    } catch (error: any) {
      lines.push(`remote -v failed: ${error?.message || String(error)}`);
    }
  }

  return {
    generatedAt,
    appVersion: app.getVersion(),
    platform: `${process.platform}-${process.arch}`,
    activeRepo,
    report: lines.join('\n'),
  };
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
      title: 'Zielordner fÃƒÆ’Ã‚Â¼r Clone auswÃƒÆ’Ã‚Â¤hlen'
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
      } else if (commandName === 'submoduleStatus') {
        data = await gitService.getSubmoduleStatus();
      } else if (commandName === 'submoduleUpdateInitRecursive') {
        data = await gitService.updateSubmodulesInitRecursive();
      } else if (commandName === 'submoduleSyncRecursive') {
        data = await gitService.syncSubmodulesRecursive();
      } else if (commandName === 'reflog') {
        data = await gitService.getReflog(Number(normalizedArgs[0]) || 300);
      } else if (commandName === 'forensicHistory') {
        const searchType = normalizedArgs[0];
        const targetPath = normalizedArgs[1];
        const searchTerm = normalizedArgs[2] || '';
        const startLine = Number(normalizedArgs[3]);
        const endLine = Number(normalizedArgs[4]);
        const limit = Number(normalizedArgs[5]) || 200;

        if (searchType === 'string') {
          data = await gitService.getForensicHistoryByString(searchTerm, targetPath, limit);
        } else if (searchType === 'regex') {
          data = await gitService.getForensicHistoryByRegex(searchTerm, targetPath, limit);
        } else {
          data = await gitService.getForensicHistoryByLineRange(targetPath, startLine, endLine, limit);
        }
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

  ipcMain.handle('git:scanPushSecrets', async (event: any) => {
    const jobId = createJobId('security-secret-scan');
    const operation = 'security:secret-scan';
    emitJobEvent(event.sender, {
      id: jobId,
      operation,
      status: 'start',
      message: 'Secret scan started.',
      timestamp: Date.now(),
    });

    try {
      const settings = readSettingsWithMigration();
      const result = await secretScanService.scanPushDiffs({
        strictness: settings.secretScanStrictness,
        allowlistText: settings.secretScanAllowlist,
      });

      const findingCount = result.findings.length;
      const filesWithFindings = new Set(result.findings.map((item) => item.filePath)).size;
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: 'done',
        message: findingCount > 0
          ? `Secret scan found ${findingCount} hit(s) in ${filesWithFindings} file(s).`
          : 'Secret scan finished with no hits.',
        details: {
          strictness: result.strictness,
          findingCount,
          filesWithFindings,
          checkedLines: result.stats.checkedLines,
          stagedLines: result.stats.stagedLines,
          toPushLines: result.stats.toPushLines,
          notes: result.notes,
        },
        timestamp: Date.now(),
      });

      return { success: true, data: result };
    } catch (error: any) {
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: 'failed',
        message: error?.message || 'Secret scan failed.',
        timestamp: Date.now(),
      });
      return { success: false, error: error?.message || 'Secret scan failed.' };
    }
  });

  ipcMain.handle('git:interactiveRebase', async (_event: any, baseHash: unknown, todoLines: unknown) => {
    try {
      const normalizedBase = String(baseHash || '').trim();
      if (!/^[0-9a-f]{7,40}$/i.test(normalizedBase)) {
        return { success: false, error: 'Invalid base commit hash.' };
      }

      if (!Array.isArray(todoLines) || todoLines.length === 0) {
        return { success: false, error: 'Rebase todo list is empty.' };
      }

      const normalizedTodo = todoLines
        .map(line => String(line || '').trim())
        .filter(Boolean)
        .slice(0, 500);

      if (normalizedTodo.length === 0) {
        return { success: false, error: 'Rebase todo list is empty.' };
      }

      const data = await gitService.startInteractiveRebase(normalizedBase, normalizedTodo);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:applyPatch', async (_event: any, patch: unknown, options: { cached?: unknown; reverse?: unknown } = {}) => {
    try {
      const normalizedPatch = String(patch || '');
      if (!normalizedPatch.trim()) {
        return { success: false, error: 'Patch is empty.' };
      }
      if (normalizedPatch.length > 2_000_000) {
        return { success: false, error: 'Patch is too large.' };
      }

      const data = await gitService.applyPatch(normalizedPatch, {
        cached: Boolean(options.cached),
        reverse: Boolean(options.reverse),
      });
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:stashes', async () => {
    try {
      const raw = await gitService.getStashes(200);
      return { success: true, data: parseStashList(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:repoOriginUrl', async (_event: any, repoPath: string) => {
    try {
      const normalizedPath = String(repoPath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'Repository path is required.' };
      }

      const url = await gitService.getRepoOriginUrl(normalizedPath);
      return { success: true, data: url };
    } catch (error: any) {
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


  ipcMain.handle('git:openSubmodule', async (_event: any, submodulePath: unknown) => {
    try {
      const relativePath = String(submodulePath || '').trim();
      if (!relativePath) {
        return { success: false, error: 'Submodule path is required.' };
      }

      const repoPath = gitService.getRepoPath();
      if (!repoPath) {
        return { success: false, error: 'No repository path set.' };
      }

      const resolvedPath = path.resolve(repoPath, relativePath);
      const relativeFromRepo = path.relative(repoPath, resolvedPath);
      if (relativeFromRepo.startsWith('..') || path.isAbsolute(relativeFromRepo)) {
        return { success: false, error: 'Submodule path is outside the current repository.' };
      }

      const openError = await shell.openPath(resolvedPath);
      if (openError) {
        return { success: false, error: openError };
      }

      return { success: true };
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

  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('updater:getStatus', async () => {
    return {
      ...updaterStatus,
      currentVersion: app.getVersion(),
    };
  });

  ipcMain.handle('updater:check', async () => {
    return checkForAppUpdates();
  });

  ipcMain.handle('updater:runOneClick', async () => {
    return runOneClickUpdate();
  });

  ipcMain.handle('updater:download', async () => {
    return downloadAvailableUpdate();
  });

  ipcMain.handle('updater:install', async () => {
    return installDownloadedUpdate();
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

  ipcMain.handle('git:aiAutoCommit', async (event: any) => {
    const webContents = event.sender;
    const jobId = createJobId('git-aiAutoCommit');
    currentAiAutoCommitJob = { id: jobId, cancelRequested: false };

    emitJobEvent(webContents, {
      id: jobId,
      operation: 'git:aiAutoCommit',
      status: 'start',
      message: 'KI Auto-Commit gestartet.',
      details: { phase: 'snapshot', mode: 'normal' },
      timestamp: Date.now(),
    });

    try {
      const settings = readSettingsWithMigration();
      const result = await aiService.runAutoCommit(
        settings,
        getGeminiApiKeyFromSecureStore,
        (update) => {
          emitJobEvent(webContents, {
            id: jobId,
            operation: 'git:aiAutoCommit',
            status: 'progress',
            message: update.message,
            ...(typeof update.progress === 'number' ? { progress: update.progress } : {}),
            details: update.details ? { ...update.details, phase: update.phase } : { phase: update.phase },
            timestamp: Date.now(),
          });
        },
        () => currentAiAutoCommitJob?.id === jobId && currentAiAutoCommitJob.cancelRequested,
      );

      emitJobEvent(webContents, {
        id: jobId,
        operation: 'git:aiAutoCommit',
        status: 'done',
        message: result.summary || 'KI Auto-Commit abgeschlossen.',
        details: {
          phase: 'done',
          mode: result.modeTransitions[result.modeTransitions.length - 1] || 'normal',
          processedFiles: result.processedFiles,
          remainingFiles: result.remainingFiles,
          totalCommits: result.commitPlanStats.totalCommits,
        },
        timestamp: Date.now(),
      });

      return { success: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'KI Auto-Commit fehlgeschlagen.';
      const wasCancelled = /abgebrochen/i.test(message);

      emitJobEvent(webContents, {
        id: jobId,
        operation: 'git:aiAutoCommit',
        status: wasCancelled ? 'cancelled' : 'failed',
        message,
        details: { phase: wasCancelled ? 'cancelled' : 'failed', mode: 'normal' },
        timestamp: Date.now(),
      });

      return { success: false, error: message };
    } finally {
      if (currentAiAutoCommitJob?.id === jobId) {
        currentAiAutoCommitJob = null;
      }
    }
  });

  ipcMain.handle('git:cancelAiAutoCommit', async () => {
    if (!currentAiAutoCommitJob) {
      return { success: true, canceled: false };
    }
    currentAiAutoCommitJob.cancelRequested = true;
    return { success: true, canceled: true };
  });
  ipcMain.handle('github:auth', async (_event: any, token: string, host?: string) => {
    const settings = readSettingsWithMigration();
    const normalizedHost = githubService.normalizeHost(host || settings.githubHost);
    const success = await githubService.authenticate(token, normalizedHost);
    if (success) {
      saveGithubTokenSecurely(token);
    }
    return success;
  });

  ipcMain.handle('github:getSavedAuthStatus', async () => {
    const savedToken = readSavedGithubToken();
    const settings = readSettingsWithMigration();
    return {
      hasSavedToken: Boolean(savedToken),
      authenticated: githubService.isAuthenticated(),
      username: githubService.getUsername(),
      oauthConfigured: githubService.isDeviceFlowConfigured(settings.githubOauthClientId, settings.githubHost),
    };
  });

  ipcMain.handle('github:loginWithSavedToken', async () => {
    const savedToken = readSavedGithubToken();
    if (!savedToken) {
      githubService.logout();
      return { success: false, authenticated: false, username: null };
    }

    const settings = readSettingsWithMigration();
    const success = await githubService.authenticate(savedToken, settings.githubHost);
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
      const settings = readSettingsWithMigration();
      const flow = await githubService.startDeviceFlow(settings.githubOauthClientId, settings.githubHost);
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

      const settings = readSettingsWithMigration();
      const result = await githubService.pollDeviceFlow(normalizedDeviceCode, settings.githubOauthClientId, settings.githubHost);
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

      const authenticated = await githubService.authenticate(result.accessToken, settings.githubHost);
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

  ipcMain.handle('github:webLogin', async () => {
    try {
      const settings = readSettingsWithMigration();
      if (githubService.normalizeHost(settings.githubHost) !== 'github.com') {
        return { success: false, error: '1-Klick Login wird aktuell nur fuer github.com unterstuetzt. Bitte PAT verwenden.' };
      }

      const tokenResult = await runGithubCliOneClickLogin();

      const authenticated = await githubService.authenticate(tokenResult.accessToken, settings.githubHost);
      if (!authenticated) {
        return { success: false, error: 'Authentifizierung mit GitHub CLI Token fehlgeschlagen.' };
      }

      saveGithubTokenSecurely(tokenResult.accessToken);
      return {
        success: true,
        data: {
          username: githubService.getUsername(),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'GitHub 1-Klick Login fehlgeschlagen.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('github:getRepos', async (_event: any, params: { page?: number; perPage?: number; search?: string } = {}) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const repos = await githubService.getMyRepositories(params.page, params.perPage, params.search || '');
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
      username: githubService.getUsername(),
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


  ipcMain.handle('github:createRelease', async (_event, params: {
    owner: string;
    repo: string;
    tagName: string;
    targetCommitish?: string;
    releaseName: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
  }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };

    const tagName = (params?.tagName || '').trim();
    const releaseName = (params?.releaseName || '').trim();

    if (!tagName) {
      return { success: false, error: 'Tag-Name ist erforderlich.' };
    }

    if (!releaseName) {
      return { success: false, error: 'Release-Name ist erforderlich.' };
    }

    try {
      const release = await githubService.createRelease({
        owner: params.owner,
        repo: params.repo,
        tagName,
        targetCommitish: params.targetCommitish,
        releaseName,
        body: params.body,
        draft: Boolean(params.draft),
        prerelease: Boolean(params.prerelease),
      });
      return { success: true, data: release };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Release konnte nicht erstellt werden.' };
    }
  });

  ipcMain.handle('github:getReleaseContext', async (_event, params: {
    owner: string;
    repo: string;
    targetCommitish?: string;
  }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };

    const owner = String(params?.owner || '').trim();
    const repo = String(params?.repo || '').trim();
    const targetCommitish = String(params?.targetCommitish || '').trim() || 'HEAD';

    if (!owner || !repo) {
      return { success: false, error: 'Owner und Repository sind erforderlich.' };
    }

    try {
      const [existingTags, lastReleaseTag] = await Promise.all([
        githubService.listRepositoryTags(owner, repo, 300),
        githubService.getLatestReleaseTag(owner, repo),
      ]);

      const commitFormat = '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ad';
      let fallbackUsed = false;
      let commitsRaw = '';

      try {
        if (lastReleaseTag) {
          commitsRaw = await gitService.runCommand([
            'log',
            `${lastReleaseTag}..${targetCommitish}`,
            commitFormat,
            '--date=short',
            '--max-count=400',
          ]);
        } else {
          commitsRaw = await gitService.runCommand([
            'log',
            targetCommitish,
            commitFormat,
            '--date=short',
            '--max-count=150',
          ]);
        }
      } catch {
        fallbackUsed = true;
        commitsRaw = await gitService.runCommand([
          'log',
          targetCommitish,
          commitFormat,
          '--date=short',
          '--max-count=150',
        ]);
      }

      const commitsSinceLastRelease = parseReleaseCommits(commitsRaw);
      return {
        success: true,
        data: {
          existingTags,
          lastReleaseTag: lastReleaseTag || null,
          commitsSinceLastRelease,
          commitsTarget: targetCommitish,
          fallbackUsed,
        },
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Release-Kontext konnte nicht geladen werden.' };
    }
  });

  ipcMain.handle('ai:generateReleaseNotes', async (_event, params: {
    tagName: string;
    releaseName: string;
    lastReleaseTag?: string | null;
    commits: ReleaseCommitInput[];
    language: 'de' | 'en';
  }) => {
    try {
      const tagName = String(params?.tagName || '').trim();
      const releaseName = String(params?.releaseName || '').trim();
      const language = params?.language === 'en' ? 'en' : 'de';
      const commits = Array.isArray(params?.commits) ? params.commits.slice(0, 400) : [];

      if (!tagName) {
        return { success: false, error: 'Tag-Name ist erforderlich.' };
      }
      if (!releaseName) {
        return { success: false, error: 'Release-Name ist erforderlich.' };
      }

      const settings = readSettingsWithMigration();
      const markdown = await aiService.generateReleaseNotes(settings, getGeminiApiKeyFromSecureStore, {
        tagName,
        releaseName,
        lastReleaseTag: params?.lastReleaseTag || null,
        commits,
        language,
      });

      return { success: true, data: { markdown } };
    } catch (error: any) {
      return { success: false, error: error?.message || 'KI Release Notes konnten nicht erstellt werden.' };
    }
  });


  ipcMain.handle('github:getWorkflowRuns', async (_event, params: { owner: string; repo: string; branch?: string; headSha?: string; perPage?: number }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const runs = await githubService.getWorkflowRuns(params.owner, params.repo, {
        branch: params.branch,
        headSha: params.headSha,
        perPage: params.perPage,
      });
      return { success: true, data: runs };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('github:getStatusChecks', async (_event, params: { owner: string; repo: string; ref: string }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const checks = await githubService.getStatusChecks(params.owner, params.repo, params.ref);
      return { success: true, data: checks };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('github:mergePR', async (_event, params: { owner: string; repo: string; pullNumber: number; mergeMethod: 'merge' | 'squash' | 'rebase'; commitTitle?: string; commitMessage?: string }) => {
    if (!githubService.isAuthenticated()) return { success: false, error: 'Not authenticated' };
    try {
      const pullNumber = Number(params?.pullNumber);
      if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
        return { success: false, error: 'Invalid pull request number.' };
      }

      const result = await githubService.mergePullRequest(
        params.owner,
        params.repo,
        pullNumber,
        params.mergeMethod,
        params.commitTitle,
        params.commitMessage,
      );

      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('diagnostics:report', async () => {
    try {
      const data = await buildDiagnosticsReport();
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Diagnostics konnten nicht erstellt werden.' };
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
  configureAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
    autoUpdateInterval = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});










