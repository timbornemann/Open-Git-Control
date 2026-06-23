import { execFile, execFileSync, spawn } from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { GitJobKind, GitScheduler } from './GitScheduler';

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
  /no such file or directory/i,
  /the system cannot find the path specified/i,
  /\buv_cwd\b/i,
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
  'fetch',
  'pull',
  'push',
]);

export type CommitStats = { files: number; additions: number; deletions: number };
export type DiffPreviewResult = {
  text: string;
  truncated: boolean;
  bytes: number;
  lines: number;
};
export type CommitMessageInput = {
  title: string;
  description?: string;
  amend?: boolean;
  signoff?: boolean;
  allowEmpty?: boolean;
};

const MAX_COMMIT_MESSAGE_FILE_LENGTH = 100_000;

export class GitService {
  private repoPath: string | null = null;
  private repoIsBare: boolean | null = null;

  constructor(
    private readonly execFileAsyncRunner: ExecFileAsyncRunner = execFileAsync as ExecFileAsyncRunner,
    private readonly scheduler: GitScheduler = new GitScheduler(),
  ) {}

  setRepoPath(newPath: string) {
    const normalizedPath = path.resolve(String(newPath || '').trim() || '.');
    const resolvedRepoPath = this.resolveRepoRoot(normalizedPath);
    this.repoPath = resolvedRepoPath;
    this.repoIsBare = this.detectIsBareRepositorySync(resolvedRepoPath);
  }

  clearRepoPath() {
    this.repoPath = null;
    this.repoIsBare = null;
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

  private detectIsBareRepositorySync(candidatePath: string): boolean {
    try {
      const output = execFileSync('git', ['rev-parse', '--is-bare-repository'], {
        cwd: candidatePath,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim().toLowerCase();
      return output === 'true';
    } catch {
      return false;
    }
  }

  private isCurrentRepositoryBare(repoPath: string): boolean {
    if (typeof this.repoIsBare === 'boolean') {
      return this.repoIsBare;
    }
    this.repoIsBare = this.detectIsBareRepositorySync(repoPath);
    return this.repoIsBare;
  }

  private shouldSuppressBareWorkTreeCommand(args: string[]): boolean {
    const primary = String(args?.[0] || '').trim().toLowerCase();
    if (!primary) return false;

    if (primary === 'status') {
      return true;
    }

    if (primary === 'diff') {
      return args.some((arg) => String(arg || '').trim().toLowerCase() === '--numstat');
    }

    if (primary === 'submodule') {
      const secondary = String(args?.[1] || '').trim().toLowerCase();
      return secondary === 'status';
    }

    return false;
  }

  private normalizeGitError(error: any, args: string[]): Error {
    const gitOut = (error?.stderr || '').trim() || (error?.stdout || '').trim();
    const fallbackMessage = String(error?.message || 'Unknown git error');
    const detailedMessage = gitOut ? `${fallbackMessage}\nGit Output: ${gitOut}` : fallbackMessage;
    const isRepoUnavailable = this.isRepoUnavailableError(detailedMessage);
    const isExpectedNonFatal = this.isExpectedNonFatalGitError(args, detailedMessage);
    const finalMessage = isRepoUnavailable
      ? `[REPO_UNAVAILABLE] Repository is no longer available (moved, deleted, or not a Git repo).\nGit Output: ${gitOut || fallbackMessage}`
      : detailedMessage;

    if (!isRepoUnavailable && !isExpectedNonFatal) {
      console.error(`Git Error executing "git ${args.join(' ')}":`, finalMessage);
    }
    return new Error(finalMessage);
  }

  private isExpectedNonFatalGitError(args: string[], errorText: string): boolean {
    const primary = String(args?.[0] || '').trim().toLowerCase();
    const expectsUpstreamRef = args.some((arg) => String(arg || '').trim() === '@{upstream}');
    if (primary === 'rev-parse' && expectsUpstreamRef) {
      return (
        /no upstream configured for branch/i.test(errorText)
        || /upstream branch .* not stored as a remote-tracking branch/i.test(errorText)
        || /fatal: no such branch/i.test(errorText)
      );
    }
    return false;
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

  private classifyCommand(args: string[], requestedKind?: GitJobKind): GitJobKind {
    if (requestedKind) return requestedKind;
    const primary = String(args[0] || '').trim().toLowerCase();
    const secondary = String(args[1] || '').trim().toLowerCase();
    if (primary === 'branch') {
      return ['-d', '-D', '-m', '-M', '-c', '-C', '--delete', '--move', '--copy', '--edit-description']
        .some((flag) => args.slice(1).includes(flag))
        ? 'write'
        : 'polling';
    }
    if (primary === 'remote') {
      return ['add', 'remove', 'rename', 'set-url', 'set-head', 'update', 'prune']
        .includes(secondary)
        ? 'write'
        : 'polling';
    }
    if (primary === 'tag') {
      const isList = args.length === 1 || ['-l', '--list', '--contains', '--points-at'].includes(secondary);
      return isList ? 'polling' : 'write';
    }
    if (primary === 'submodule' && secondary === 'status') return 'polling';
    if (this.shouldSerializeCommand(args)) return 'write';
    if (primary === 'status') return 'polling';
    if (['rev-parse', 'for-each-ref', 'symbolic-ref'].includes(primary)) return 'polling';
    if (primary === 'diff' && args.includes('--numstat')) return 'background';
    return 'interactive';
  }

  private assertRepoPathAvailable(repoPath: string): void {
    try {
      const stat = fs.statSync(repoPath);
      if (!stat.isDirectory()) {
        throw new Error('Repository path is not a directory.');
      }
    } catch {
      throw new Error('[REPO_UNAVAILABLE] Repository is no longer available (moved, deleted, or not accessible).');
    }
  }

  private isRepoPathAccessible(repoPath: string): boolean {
    try {
      const stat = fs.statSync(repoPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async execGit(
    repoPath: string,
    args: string[],
    envOverrides?: NodeJS.ProcessEnv,
    signal?: AbortSignal,
    requestedKind?: GitJobKind,
    requestedCoalesceKey?: string,
  ): Promise<string> {
    this.assertRepoPathAvailable(repoPath);

    const env = envOverrides ? { ...process.env, ...envOverrides } : process.env;
    const execOptions = {
      cwd: repoPath,
      maxBuffer: 20 * 1024 * 1024,
      env,
      signal,
    };

    const executeWithRetries = async (activeSignal: AbortSignal): Promise<string> => {
      let retryAttempt = 0;
      const activeExecOptions = { ...execOptions, signal: activeSignal };

      while (true) {
        try {
          const { stdout } = await this.execFileAsyncRunner('git', args, activeExecOptions);
          return stdout.trimEnd();
        } catch (error: any) {
          if (activeSignal.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
            const aborted = new Error('Git operation was aborted.');
            aborted.name = 'AbortError';
            throw aborted;
          }
          // Repo can disappear between pre-check and spawn (race). Normalize that to REPO_UNAVAILABLE.
          if (error?.code === 'ENOENT' && !this.isRepoPathAccessible(repoPath)) {
            throw new Error('[REPO_UNAVAILABLE] Repository is no longer available (moved, deleted, or not accessible).');
          }

          // If repo path still exists, ENOENT likely means Git itself is unavailable in PATH.
          if (error?.code === 'ENOENT' && /spawn\s+git\s+enoent/i.test(String(error?.message || ''))) {
            throw new Error('Git executable not found in PATH (spawn git ENOENT). Please install Git and restart the app.');
          }

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

    const kind = this.classifyCommand(args, requestedKind);
    return this.scheduler.schedule(
      repoPath,
      kind,
      args[0] || 'git',
      executeWithRetries,
      {
        signal,
        coalesceKey: kind === 'polling'
          ? requestedCoalesceKey ?? args.join('\0')
          : undefined,
      },
    );
  }

  /**
   * Fuehrt einen Git Befehl im ausgewaehlten Repository aus
   */
  async runCommand(args: string[]): Promise<string> {
    const repoPath = this.ensureRepoPath();
    if (this.isCurrentRepositoryBare(repoPath) && this.shouldSuppressBareWorkTreeCommand(args)) {
      return '';
    }
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

  async runPollingCommandAtPath(
    repoPath: string,
    args: string[],
    coalesceKey?: string,
  ): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }
    return this.execGit(normalizedPath, args, undefined, undefined, 'polling', coalesceKey);
  }

  async runCommandAtPathWithSignal(repoPath: string, args: string[], signal: AbortSignal): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }
    return this.execGit(normalizedPath, args, undefined, signal, 'background');
  }

  getSchedulerDiagnostics() {
    return this.scheduler.getDiagnostics();
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

  async getStatusPorcelainAtPath(repoPath: string): Promise<string> {
    return this.runCommandAtPath(repoPath, ['status', '--porcelain=v1', '--untracked-files=all']);
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

  async commitWithMessage(input: CommitMessageInput): Promise<string> {
    return this.commitWithMessageAtPath(this.ensureRepoPath(), input);
  }

  async commitWithMessageAtPath(repoPath: string, input: CommitMessageInput): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }

    const title = String(input.title || '').trim();
    const description = String(input.description || '').trim();
    if (!title) {
      throw new Error('Commit title is required.');
    }

    const message = description ? `${title}\n\n${description}` : title;
    if (message.length > MAX_COMMIT_MESSAGE_FILE_LENGTH) {
      throw new Error('Commit message is too long.');
    }

    const messageFile = path.join(
      os.tmpdir(),
      `ogc-commit-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`,
    );
    fs.writeFileSync(messageFile, message, { encoding: 'utf8', mode: 0o600 });

    const args = ['commit'];
    if (input.amend) args.push('--amend');
    if (input.signoff) args.push('--signoff');
    if (input.allowEmpty) args.push('--allow-empty');
    args.push('-F', messageFile);

    try {
      return await this.execGit(normalizedPath, args);
    } finally {
      try {
        fs.rmSync(messageFile, { force: true });
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

    return this.scheduler.schedule(repoPath, 'write', 'apply', (signal) => new Promise<string>((resolve, reject) => {
      const proc = spawn('git', args, { cwd: repoPath, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      signal.addEventListener('abort', () => proc.kill(), { once: true });

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
        if (signal.aborted) {
          const error = new Error('Git apply was aborted.');
          error.name = 'AbortError';
          reject(error);
          return;
        }
        if (code === 0) {
          resolve(stdout.trimEnd());
          return;
        }

        const message = (stderr || stdout || `git apply exited with code ${code}`).trim();
        reject(new Error(message));
      });

      proc.stdin.write(patch);
      proc.stdin.end();
    }));
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
    const args = ['log', '--topo-order', '-z', '-' + limit, `--skip=${safeOffset}`, '--pretty=format:' + format, '--date=iso'];

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

  async getFileBlameRange(
    filePath: string,
    commitHash: string | undefined,
    startLine: number,
    lineCount: number,
  ): Promise<string> {
    const safeStart = Number.isFinite(startLine) ? Math.max(1, Math.floor(startLine)) : 1;
    const safeCount = Number.isFinite(lineCount) ? Math.max(1, Math.min(Math.floor(lineCount), 500)) : 500;
    const endLine = safeStart + safeCount - 1;
    const args = ['blame', '--line-porcelain', `-L${safeStart},${endLine}`];
    if (commitHash) {
      args.push(commitHash);
    }
    args.push('--', filePath);
    return this.runCommand(args);
  }

  async getCommitStatsAtPath(repoPath: string, hash: string, signal: AbortSignal): Promise<CommitStats> {
    const normalizedHash = String(hash || '').trim();
    if (!/^[0-9a-f]{7,64}$/i.test(normalizedHash)) {
      throw new Error('Invalid commit hash.');
    }

    const raw = await this.runCommandAtPathWithSignal(
      repoPath,
      ['show', '--root', '--first-parent', '--format=', '--numstat', '-r', '-M', normalizedHash],
      signal,
    );
    const stats: CommitStats = { files: 0, additions: 0, deletions: 0 };

    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (!match) continue;
      stats.files += 1;
      if (match[1] !== '-') stats.additions += Number(match[1]);
      if (match[2] !== '-') stats.deletions += Number(match[2]);
    }
    return stats;
  }

  async stagePaths(paths: string[]): Promise<string> {
    const repoPath = this.ensureRepoPath();
    const normalized = [...new Set(
      paths
        .map((filePath) => String(filePath || '').trim())
        .filter(Boolean),
    )];
    if (normalized.length === 0) return '';

    return this.scheduler.schedule(repoPath, 'write', 'add --pathspec-from-file=-', () => new Promise<string>((resolve, reject) => {
      const proc = spawn(
        'git',
        ['add', '--pathspec-from-file=-', '--pathspec-file-nul'],
        { cwd: repoPath, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trimEnd());
          return;
        }
        reject(new Error((stderr || stdout || `git add exited with code ${code}`).trim()));
      });
      proc.stdin.end(`${normalized.join('\0')}\0`);
    }));
  }

  async getDiffPreview(
    args: string[],
    limits: { maxBytes?: number; maxLines?: number } = {},
  ): Promise<DiffPreviewResult> {
    const repoPath = this.ensureRepoPath();
    const maxBytes = Math.max(64 * 1024, Math.min(limits.maxBytes || 2 * 1024 * 1024, 8 * 1024 * 1024));
    const maxLines = Math.max(100, Math.min(limits.maxLines || 5000, 20_000));

    return this.scheduler.schedule(repoPath, 'interactive', args[0] || 'diff', (signal) => new Promise<DiffPreviewResult>((resolve, reject) => {
      const proc = spawn('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let capturedBytes = 0;
      let lineCount = 0;
      let truncated = false;
      let stderr = '';
      signal.addEventListener('abort', () => proc.kill(), { once: true });

      proc.stdout.on('data', (chunk: Buffer) => {
        if (truncated) return;
        const remainingBytes = maxBytes - capturedBytes;
        if (remainingBytes <= 0) {
          truncated = true;
          proc.kill();
          return;
        }
        const accepted = chunk.length > remainingBytes ? chunk.subarray(0, remainingBytes) : chunk;
        chunks.push(accepted);
        capturedBytes += accepted.length;
        lineCount += accepted.toString('utf8').split('\n').length - 1;
        if (accepted.length < chunk.length || lineCount >= maxLines) {
          truncated = true;
          proc.kill();
        }
      });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on('error', reject);
      proc.on('close', (code, signal) => {
        if (signal && !truncated) {
          const error = new Error('Git diff preview was aborted.');
          error.name = 'AbortError';
          reject(error);
          return;
        }
        if (code !== 0 && !truncated && signal == null) {
          reject(new Error((stderr || `git ${args.join(' ')} exited with code ${code}`).trim()));
          return;
        }
        let text = Buffer.concat(chunks).toString('utf8');
        if (lineCount >= maxLines) {
          text = text.split('\n').slice(0, maxLines).join('\n');
        }
        resolve({
          text,
          truncated,
          bytes: Buffer.byteLength(text),
          lines: text ? text.split('\n').length : 0,
        });
      });
    }));
  }

  async streamCommandLines(
    args: string[],
    onLine: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const repoPath = this.ensureRepoPath();
    await this.scheduler.schedule(repoPath, 'interactive', args[0] || 'stream', (schedulerSignal) => new Promise<void>((resolve, reject) => {
      const proc = spawn('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
      let pending = '';
      let stderr = '';
      const abort = () => proc.kill();
      schedulerSignal.addEventListener('abort', abort, { once: true });

      proc.stdout.on('data', (chunk: Buffer) => {
        pending += chunk.toString('utf8');
        let newlineIndex = pending.indexOf('\n');
        while (newlineIndex >= 0) {
          onLine(pending.slice(0, newlineIndex).replace(/\r$/, ''));
          pending = pending.slice(newlineIndex + 1);
          newlineIndex = pending.indexOf('\n');
        }
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
      });
      proc.on('error', reject);
      proc.on('close', (code, closeSignal) => {
        schedulerSignal.removeEventListener('abort', abort);
        if (schedulerSignal.aborted || closeSignal) {
          const error = new Error('Git stream was aborted.');
          error.name = 'AbortError';
          reject(error);
          return;
        }
        if (code !== 0) {
          reject(new Error((stderr || `git ${args.join(' ')} exited with code ${code}`).trim()));
          return;
        }
        if (pending) onLine(pending.replace(/\r$/, ''));
        resolve();
      });
    }), { signal });
  }

  private sanitizeCloneTargetName(value: string): string {
    const normalized = String(value || '')
      .trim()
      .replace(/[\\/]+/g, '-')
      .replace(/[:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\.+$/, '');
    return normalized || 'repo';
  }

  private deriveCloneRepoName(cloneSource: string): string {
    const normalizedSource = String(cloneSource || '')
      .trim()
      .replace(/[\\]+/g, '/')
      .replace(/\/+$/, '');
    const withoutGitSuffix = normalizedSource.replace(/\.git$/i, '');
    const lastSegment = withoutGitSuffix.split('/').pop() || 'repo';
    return this.sanitizeCloneTargetName(lastSegment);
  }

  async getFileTimelineData(limit: number = 2000): Promise<any[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 5000)) : 2000;
    const recordSeparator = '\x1e';
    const fieldSeparator = '\x1f';
    const format = `%x1e%H%x1f%an%x1f%ad%x1f%s%x00`;
    const args = ['log', `-${safeLimit}`, '-z', '--name-status', `--pretty=format:${format}`, '--date=iso'];
    const output = await this.runCommand(args);
    const commits: any[] = [];

    for (const record of output.split(recordSeparator)) {
      const tokens = record
        .split('\x00')
        .map((token) => token.replace(/^\r?\n/, ''))
        .filter((token) => token.length > 0);
      if (tokens.length === 0) continue;

      const [hash = '', author = '', date = '', subject = ''] = tokens[0].split(fieldSeparator);
      if (!/^[0-9a-f]{7,40}$/i.test(hash)) continue;

      const currentCommit = {
        hash,
        author,
        date,
        subject,
        changes: [] as Array<{ status: 'added' | 'modified' | 'deleted' | 'renamed'; path: string; oldPath?: string }>,
      };

      for (let i = 1; i < tokens.length;) {
        const statusToken = tokens[i].trim();
        i += 1;
        if (!statusToken) continue;

        const statusChar = statusToken[0];
        let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
        if (statusChar === 'A') status = 'added';
        else if (statusChar === 'D') status = 'deleted';
        else if (statusChar === 'R') status = 'renamed';

        if (status === 'renamed') {
          const oldPath = tokens[i] || '';
          const newPath = tokens[i + 1] || '';
          i += 2;
          if (newPath) {
            currentCommit.changes.push({ status, path: newPath, oldPath });
          }
          continue;
        }

        const path = tokens[i] || '';
        i += 1;
        if (path) {
          currentCommit.changes.push({ status, path });
        }
      }

      commits.push(currentCommit);
    }

    return commits;
  }

  /**
   * Klont ein Repository mit Fortschrittsanzeige
   */
  cloneRepo(
    cloneUrl: string,
    targetDir: string,
    onProgress: (line: string) => void,
    targetName?: string,
  ): Promise<{ success: boolean; repoPath: string; error?: string }> {
    return new Promise((resolve) => {
      const repoName = targetName
        ? this.sanitizeCloneTargetName(targetName)
        : this.deriveCloneRepoName(cloneUrl);
      const repoPath = path.join(targetDir, repoName);
      if (fs.existsSync(repoPath)) {
        resolve({
          success: false,
          repoPath,
          error: `Destination path already exists: ${repoPath}`,
        });
        return;
      }

      const progressTail: string[] = [];
      const collectProgress = (data: Buffer) => {
        const lines = data.toString().split(/\r?\n|\r/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          progressTail.push(trimmed);
          if (progressTail.length > 24) {
            progressTail.splice(0, progressTail.length - 24);
          }
          onProgress(trimmed);
        }
      };

      const proc = spawn('git', ['clone', '--progress', cloneUrl, repoPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Git clone sends progress to stderr
      proc.stderr.on('data', collectProgress);
      proc.stdout.on('data', collectProgress);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, repoPath });
        } else {
          const details = progressTail.slice(-4).join('\n').trim();
          resolve({
            success: false,
            repoPath,
            error: details || `Git clone exited with code ${code} (source: ${cloneUrl}, target: ${repoPath})`,
          });
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
