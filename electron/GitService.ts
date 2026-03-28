import { execFile, execFileSync, spawn } from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const execFileAsync = util.promisify(execFile);
const STALE_INDEX_LOCK_MAX_AGE_MS = 45_000;
const INDEX_LOCK_RETRY_MAX_ATTEMPTS = 6;
const INDEX_LOCK_RETRY_BASE_DELAY_MS = 75;
const INDEX_LOCK_RETRY_MAX_DELAY_MS = 600;
const REPO_UNAVAILABLE_PATTERNS: RegExp[] = [
  /not a git repository/i,
  /no repository path set/i,
  /cannot change to/i,
  /unable to get current working directory/i,
];

type ExecFileAsyncResult = { stdout: string; stderr: string };
type ExecFileAsyncRunner = (file: string, args: string[], options: any) => Promise<ExecFileAsyncResult>;

const SERIALIZED_GIT_COMMANDS = new Set<string>([
  'add',
  'commit',
  'reset',
  'checkout',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'stash',
  'clean',
  'apply',
  'submodule',
]);

export type CommitStats = { files: number; additions: number; deletions: number };

export class GitService {
  private repoPath: string | null = null;
  private readonly repoExecutionQueue = new Map<string, Promise<void>>();

  constructor(private readonly execFileAsyncRunner: ExecFileAsyncRunner = execFileAsync as ExecFileAsyncRunner) {}

  setRepoPath(newPath: string) {
    const normalizedPath = path.resolve(String(newPath || '').trim() || '.');
    this.repoPath = this.resolveRepoRoot(normalizedPath);
  }

  getRepoPath(): string | null {
    return this.repoPath;
  }

  private ensureRepoPath(): string {
    if (!this.repoPath) {
      throw new Error('No repository path set.');
    }
    return this.repoPath;
  }

  /**
   * Normalisiert auf den echten Repository-Root (falls `newPath` innerhalb eines Repos liegt).
   * Das verhindert pathspec-Fehler bei Dateipfaden, wenn Nutzer Unterordner als Repo oeffnen.
   */
  private resolveRepoRoot(candidatePath: string): string {
    try {
      const rootPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: candidatePath,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      return rootPath || candidatePath;
    } catch {
      return candidatePath;
    }
  }

  private normalizeGitError(error: any, args: string[]): Error {
    const gitOut = (error?.stderr || '').trim() || (error?.stdout || '').trim();
    const fallbackMessage = String(error?.message || 'Unknown git error');
    const detailedMessage = gitOut ? `${fallbackMessage}\nGit Output: ${gitOut}` : fallbackMessage;
    const isRepoUnavailable = this.isRepoUnavailableError(detailedMessage);
    const finalMessage = isRepoUnavailable
      ? `[REPO_UNAVAILABLE] Repository is no longer available (moved, deleted, or not a Git repo).\nGit Output: ${gitOut || fallbackMessage}`
      : detailedMessage;

    if (!isRepoUnavailable) {
      console.error(`Git Error executing "git ${args.join(' ')}":`, finalMessage);
    }
    return new Error(finalMessage);
  }

  private isRepoUnavailableError(errorText: string): boolean {
    const text = String(errorText || '');
    if (!text.trim()) return false;
    return REPO_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(text));
  }

  private isIndexLockError(error: any): boolean {
    const text = `${error?.stderr || ''}\n${error?.stdout || ''}\n${error?.message || ''}`;
    return /index\.lock/i.test(text) && /file exists/i.test(text);
  }

  private resolveIndexLockPath(repoPath: string): string {
    try {
      const gitDirRaw = execFileSync('git', ['rev-parse', '--git-dir'], {
        cwd: repoPath,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const gitDirPath = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(repoPath, gitDirRaw || '.git');
      return path.join(gitDirPath, 'index.lock');
    } catch {
      return path.join(repoPath, '.git', 'index.lock');
    }
  }

  private removeStaleIndexLockIfSafe(repoPath: string, args: string[]): boolean {
    const lockPath = this.resolveIndexLockPath(repoPath);
    if (!fs.existsSync(lockPath)) {
      return false;
    }

    try {
      const stat = fs.statSync(lockPath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (!Number.isFinite(ageMs) || ageMs < STALE_INDEX_LOCK_MAX_AGE_MS) {
        return false;
      }

      fs.rmSync(lockPath, { force: true });
      console.warn(`Removed stale git index lock (${lockPath}) and retrying: git ${args.join(' ')}`);
      return true;
    } catch {
      return false;
    }
  }

  private isPathInsideRepo(repoPath: string, filePath: string): boolean {
    const relative = path.relative(repoPath, filePath);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  private getRepoQueueKey(repoPath: string): string {
    const resolved = path.resolve(repoPath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  private async runSerializedPerRepo<T>(repoPath: string, task: () => Promise<T>): Promise<T> {
    const queueKey = this.getRepoQueueKey(repoPath);
    const previous = this.repoExecutionQueue.get(queueKey) || Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.repoExecutionQueue.set(queueKey, current);

    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (this.repoExecutionQueue.get(queueKey) === current) {
        this.repoExecutionQueue.delete(queueKey);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private shouldSerializeCommand(args: string[]): boolean {
    const firstToken = String(args?.[0] || '').trim().toLowerCase();
    if (!firstToken) return false;
    return SERIALIZED_GIT_COMMANDS.has(firstToken);
  }

  private async execGit(repoPath: string, args: string[], envOverrides?: NodeJS.ProcessEnv): Promise<string> {
    const env = envOverrides ? { ...process.env, ...envOverrides } : process.env;
    const execOptions = {
      cwd: repoPath,
      maxBuffer: 20 * 1024 * 1024,
      env,
    };

    const executeWithRetries = async (): Promise<string> => {
      let retryAttempt = 0;

      while (true) {
        try {
          const { stdout } = await this.execFileAsyncRunner('git', args, execOptions);
          return stdout.trimEnd();
        } catch (error: any) {
          if (!this.isIndexLockError(error)) {
            throw this.normalizeGitError(error, args);
          }

          if (this.removeStaleIndexLockIfSafe(repoPath, args)) {
            continue;
          }

          if (retryAttempt >= INDEX_LOCK_RETRY_MAX_ATTEMPTS) {
            throw this.normalizeGitError(error, args);
          }

          const delayMs = Math.min(
            INDEX_LOCK_RETRY_MAX_DELAY_MS,
            INDEX_LOCK_RETRY_BASE_DELAY_MS * (2 ** retryAttempt),
          );
          retryAttempt += 1;
          await this.sleep(delayMs);
        }
      }
    };

    if (!this.shouldSerializeCommand(args)) {
      return executeWithRetries();
    }

    return this.runSerializedPerRepo(repoPath, executeWithRetries);
  }

  /**
   * Fuehrt einen Git Befehl im ausgewaehlten Repository aus
   */
  async runCommand(args: string[]): Promise<string> {
    const repoPath = this.ensureRepoPath();
    return this.execGit(repoPath, args);
  }

  /**
   * Fuehrt einen Git-Befehl in einem expliziten Repository-Pfad aus.
   */
  async runCommandAtPath(repoPath: string, args: string[]): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }
    return this.execGit(normalizedPath, args);
  }

  /**
   * Ueberprueft, ob das aktuelle Verzeichnis ein Git Repo ist
   */
  async checkIsRepo(): Promise<boolean> {
    try {
      await this.runCommand(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gibt den aktuellen Status zurueck (Short Format)
   */
  async getStatus(): Promise<string> {
    return this.runCommand(['status', '--short']);
  }

  /**
   * Gibt den aktuellen Status im Porcelain-v1-Format zurueck.
   * Dieses Format ist stabil und fuer UI-Parsing geeignet.
   */
  async getStatusPorcelain(): Promise<string> {
    // -uall lists each untracked file individually instead of collapsing directories.
    return this.runCommand(['status', '--porcelain=v1', '--untracked-files=all']);
  }

  /**
   * Nimmt bei einer Konfliktdatei die lokale (ours) oder entfernte (theirs) Variante.
   */
  async checkoutConflictVersion(filePath: string, side: 'ours' | 'theirs'): Promise<string> {
    return this.runCommand(['checkout', '--' + side, '--', filePath]);
  }

  /**
   * Markiert eine Datei nach Konfliktaufloesung als geloest (staged).
   */
  async addFile(filePath: string): Promise<string> {
    return this.runCommand(['add', '--', filePath]);
  }

  /**
   * Liest eine Textdatei innerhalb des aktiven Repositories.
   */
  async readRepoFile(relativePath: string): Promise<string> {
    const repoPath = this.ensureRepoPath();
    const normalizedRelativePath = (relativePath || '').trim();
    if (!normalizedRelativePath) {
      throw new Error('File path is required.');
    }

    const resolvedPath = path.resolve(repoPath, normalizedRelativePath);
    if (!this.isPathInsideRepo(repoPath, resolvedPath)) {
      throw new Error('File path is outside the current repository.');
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Target path is not a file.');
    }
    if (stat.size > 2 * 1024 * 1024) {
      throw new Error('File is too large for inline conflict editing (>2MB).');
    }

    return fs.readFileSync(resolvedPath, 'utf8');
  }

  /**
   * Schreibt eine Textdatei innerhalb des aktiven Repositories.
   */
  async writeRepoFile(relativePath: string, content: string): Promise<void> {
    const repoPath = this.ensureRepoPath();
    const normalizedRelativePath = (relativePath || '').trim();
    if (!normalizedRelativePath) {
      throw new Error('File path is required.');
    }

    const resolvedPath = path.resolve(repoPath, normalizedRelativePath);
    if (!this.isPathInsideRepo(repoPath, resolvedPath)) {
      throw new Error('File path is outside the current repository.');
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Target path is not a file.');
    }

    const textValue = typeof content === 'string' ? content : String(content ?? '');
    fs.writeFileSync(resolvedPath, textValue, 'utf8');
  }

  /**
   * Setzt einen laufenden Merge nach Konfliktaufloesung fort.
   */
  async continueMerge(): Promise<string> {
    const repoPath = this.ensureRepoPath();
    return this.execGit(repoPath, ['merge', '--continue'], {
      GIT_EDITOR: 'true',
      GIT_MERGE_AUTOEDIT: 'no',
    });
  }

  /**
   * Bricht einen laufenden Merge ab.
   */
  async abortMerge(): Promise<string> {
    return this.runCommand(['merge', '--abort']);
  }

  /**
   * Setzt einen laufenden Rebase nach Konfliktaufloesung fort.
   */
  async continueRebase(): Promise<string> {
    const repoPath = this.ensureRepoPath();
    return this.execGit(repoPath, ['rebase', '--continue'], {
      GIT_EDITOR: 'true',
    });
  }

  /**
   * Bricht einen laufenden Rebase ab.
   */
  async abortRebase(): Promise<string> {
    return this.runCommand(['rebase', '--abort']);
  }

  /**
   * Startet einen interaktiven Rebase mit einer vorgegebenen Todo-Liste.
   */
  async startInteractiveRebase(baseHash: string, todoLines: string[]): Promise<string> {
    const repoPath = this.ensureRepoPath();
    const normalizedBase = (baseHash || '').trim();
    if (!normalizedBase) {
      throw new Error('Base commit hash is required for interactive rebase.');
    }

    const normalizedLines = Array.isArray(todoLines)
      ? todoLines
        .map((line) => String(line || '').trim())
        .filter(Boolean)
      : [];

    if (normalizedLines.length === 0) {
      throw new Error('At least one rebase todo line is required.');
    }

    const todoText = normalizedLines.join('\n') + '\n';
    const helperPath = path.join(os.tmpdir(), `ogc-rebase-editor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.js`);
    const helperScript = [
      "const fs = require('fs');",
      "const target = process.argv[2];",
      "if (!target) process.exit(1);",
      "const raw = process.env.OGC_REBASE_TODO_B64 || '';",
      "const content = Buffer.from(raw, 'base64').toString('utf8');",
      "fs.writeFileSync(target, content, 'utf8');",
    ].join('\n');

    fs.writeFileSync(helperPath, helperScript, 'utf8');

    const quotedNode = `\"${process.execPath.replace(/\"/g, '\\\"')}\"`;
    const quotedHelper = `\"${helperPath.replace(/\"/g, '\\\"')}\"`;

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rebase', '-i', normalizedBase],
        {
          cwd: repoPath,
          maxBuffer: 20 * 1024 * 1024,
          env: {
            ...process.env,
            GIT_SEQUENCE_EDITOR: `${quotedNode} ${quotedHelper}`,
            OGC_REBASE_TODO_B64: Buffer.from(todoText, 'utf8').toString('base64'),
          },
        },
      );

      return stdout.trimEnd();
    } catch (error: any) {
      throw this.normalizeGitError(error, ['rebase', '-i', normalizedBase]);
    } finally {
      try {
        fs.rmSync(helperPath, { force: true });
      } catch {
        // ignore temp cleanup errors
      }
    }
  }

  /**
   * Wendet ein Patch auf Working Tree oder Index an.
   */
  async applyPatch(patchText: string, options?: { cached?: boolean; reverse?: boolean }): Promise<string> {
    const repoPath = this.ensureRepoPath();
    const patch = String(patchText || '');
    if (!patch.trim()) {
      throw new Error('Patch content is empty.');
    }

    const args = ['apply', '--recount', '--whitespace=nowarn'];
    if (options?.cached) {
      args.push('--cached');
    }
    if (options?.reverse) {
      args.push('-R');
    }

    return await new Promise<string>((resolve, reject) => {
      const proc = spawn('git', args, { cwd: repoPath, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (error) => {
        reject(error);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trimEnd());
          return;
        }

        const message = (stderr || stdout || `git apply exited with code ${code}`).trim();
        reject(new Error(message));
      });

      proc.stdin.write(patch);
      proc.stdin.end();
    });
  }

  async getRepoOriginUrl(repoPath: string): Promise<string | null> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) return null;

    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: normalizedPath,
        maxBuffer: 20 * 1024 * 1024,
      });
      const trimmed = String(stdout || '').trim();
      return trimmed || null;
    } catch {
      // Missing origin is a normal state for local-only repos. Do not spam console errors.
      return null;
    }
  }

  async getStashes(limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    return this.runCommand(['stash', 'list', `--max-count=${safeLimit}`]);
  }

  async getSubmoduleStatus(): Promise<string> {
    return this.runCommand(['submodule', 'status', '--recursive']);
  }

  async updateSubmodulesInitRecursive(): Promise<string> {
    return this.runCommand(['submodule', 'update', '--init', '--recursive']);
  }

  async syncSubmodulesRecursive(): Promise<string> {
    return this.runCommand(['submodule', 'sync', '--recursive']);
  }

  /**
   * Holt die Branch-Liste
   */
  async getBranches(): Promise<string> {
    return this.runCommand(['branch', '-a']);
  }

  /**
   * Holt das Git Log in einem einfach parsebaren Format
   */
  private getStructuredLogFormat(): string {
    return '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%(decorate:prefix=,suffix=,separator=%x1d)%x00';
  }

  async getLog(limit: number = 50, includeAll: boolean = true, offset: number = 0): Promise<string> {
    // NUL separates commits (with -z) and US (\x1f) separates fixed fields.
    // Refs use GS (\x1d) as an explicit separator to avoid ambiguities.
    const format = this.getStructuredLogFormat();
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    const args = ['log', '--topo-order', '-z', '-' + limit, `--skip=${safeOffset}`, '--pretty=format:' + format, '--date=iso', '--numstat'];

    if (includeAll) {
      args.splice(1, 0, '--all');
    }

    return this.runCommand(args);
  }

  async getForensicHistoryByString(search: string, filePath: string, limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    const format = this.getStructuredLogFormat();
    return this.runCommand([
      'log',
      '-z',
      `-${safeLimit}`,
      '--date=iso',
      `--pretty=format:${format}`,
      '--numstat',
      '-S',
      search,
      '--',
      filePath,
    ]);
  }

  async getForensicHistoryByRegex(regex: string, filePath: string, limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    const format = this.getStructuredLogFormat();
    return this.runCommand([
      'log',
      '-z',
      `-${safeLimit}`,
      '--date=iso',
      `--pretty=format:${format}`,
      '--numstat',
      '-G',
      regex,
      '--',
      filePath,
    ]);
  }

  async getForensicHistoryByLineRange(filePath: string, startLine: number, endLine: number, limit: number = 200): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 200;
    return this.runCommand([
      'log',
      `-${safeLimit}`,
      '--date=iso',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%x00',
      `-L${startLine},${endLine}:${filePath}`,
    ]);
  }

  /**
   * Liefert Reflog-Eintraege in einem stabil parsebaren Format.
   */
  async getReflog(limit: number = 300): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 300;
    const format = '%H%x1f%h%x1f%gd%x1f%gs%x1f%cd%x00';
    return this.runCommand([
      'reflog',
      '--date=iso',
      `--max-count=${safeLimit}`,
      '--pretty=format:' + format,
    ]);
  }

  /**
   * Holt die Details eines einzelnen Commits (veraenderte Dateien)
   */
  async getCommitDetails(hash: string): Promise<string> {
    // Liefert Status (A, M, D) und Dateipfad (-M, --name-status)
    return this.runCommand(['show', '--name-status', '--format=', hash]);
  }

  /**
   * Liefert die Historie einer einzelnen Datei.
   */
  async getFileHistory(filePath: string, limit: number = 100, commitHash?: string): Promise<string> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 100;
    const format = '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x00';
    const args = [
      'log',
      '--follow',
      '-z',
      `-${safeLimit}`,
      `--pretty=format:${format}`,
      '--date=iso',
    ];

    if (commitHash) {
      args.push(commitHash);
    }

    args.push('--', filePath);
    return this.runCommand(args);
  }

  /**
   * Liefert Blame-Informationen einer Datei.
   */
  async getFileBlame(filePath: string, commitHash?: string): Promise<string> {
    const args = ['blame', '--line-porcelain'];
    if (commitHash) {
      args.push(commitHash);
    }
    args.push('--', filePath);
    return this.runCommand(args);
  }

  /**
   * Klont ein Repository mit Fortschrittsanzeige
   */
  cloneRepo(
    cloneUrl: string,
    targetDir: string,
    onProgress: (line: string) => void,
  ): Promise<{ success: boolean; repoPath: string; error?: string }> {
    return new Promise((resolve) => {
      // Extract repo name from URL for the target folder
      const repoName = cloneUrl.replace(/\.git$/, '').split('/').pop() || 'repo';
      const repoPath = path.join(targetDir, repoName);

      const proc = spawn('git', ['clone', '--progress', cloneUrl, repoPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Git clone sends progress to stderr
      proc.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split(/\r?\n|\r/);
        for (const line of lines) {
          if (line.trim()) {
            onProgress(line.trim());
          }
        }
      });

      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split(/\r?\n|\r/);
        for (const line of lines) {
          if (line.trim()) {
            onProgress(line.trim());
          }
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, repoPath });
        } else {
          resolve({ success: false, repoPath, error: `Git clone beendet mit Exit Code ${code}` });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, repoPath, error: err.message });
      });
    });
  }
}

// Singleton Instanz
export const gitService = new GitService();
