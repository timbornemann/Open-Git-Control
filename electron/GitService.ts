import { execFileSync, spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { GitScheduler } from './GitScheduler';
import { CommitService, type CommitMessageInput } from './git/CommitService';
import { GitRunner, defaultExecFileAsyncRunner, type ExecFileAsyncRunner } from './git/GitRunner';
import { HistoryService, type CommitStats, type FileTimelineCommit } from './git/HistoryService';
import { RepositoryFiles, type RepositoryFileDataUrl, type RepositoryFileSource } from './git/RepositoryFiles';

export type { CommitStats, FileTimelineCommit };
export type DiffPreviewResult = {
  text: string;
  truncated: boolean;
  bytes: number;
  lines: number;
};
export type { RepositoryFileDataUrl, RepositoryFileSource };
const statusPorcelainArgs = (): string[] => [
  '-c',
  'core.quotepath=false',
  'status',
  '--porcelain=v1',
  '--untracked-files=all',
];

export class GitService {
  private repoPath: string | null = null;
  private repoIsBare: boolean | null = null;
  private readonly gitRunner: GitRunner;
  private readonly commitService: CommitService;
  private readonly historyService: HistoryService;
  private readonly repositoryFiles: RepositoryFiles;

  constructor(
    execFileAsyncRunner: ExecFileAsyncRunner = defaultExecFileAsyncRunner,
    scheduler: GitScheduler = new GitScheduler(),
  ) {
    this.gitRunner = new GitRunner(execFileAsyncRunner, scheduler);
    this.commitService = new CommitService(
      (repoPath, args, envOverrides) => this.gitRunner.run(repoPath, args, { envOverrides }),
    );
    this.historyService = new HistoryService(
      (args) => this.runCommand(args),
      (repoPath, args, signal) => this.runCommandAtPathWithSignal(repoPath, args, signal),
    );
    this.repositoryFiles = new RepositoryFiles(
      () => this.ensureRepoPath(),
      (revisionSpec, maxBytes) => this.readGitFileBuffer(revisionSpec, maxBytes),
    );
  }

  private createPrivateTempDir(prefix: string): string {
    const safePrefix = String(prefix || 'ogc-temp-').replace(/[^a-z0-9_-]/gi, '-') || 'ogc-temp-';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), safePrefix.endsWith('-') ? safePrefix : `${safePrefix}-`));
    try {
      fs.chmodSync(tempDir, 0o700);
    } catch {
      // Some platforms ignore chmod for temp directories.
    }
    return tempDir;
  }

  private writePrivateTempFile(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Some platforms ignore chmod for temp files.
    }
  }

  private cleanupPrivateTempDir(tempDir: string | null): void {
    if (!tempDir) return;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup: the directory is private and will be retried by the OS temp cleaner.
    }
  }

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
    const commandArgs = args[0] === '-c' ? args.slice(2) : args;
    const primary = String(commandArgs?.[0] || '').trim().toLowerCase();
    if (!primary) return false;

    if (primary === 'status') {
      return true;
    }

    if (primary === 'diff') {
      return commandArgs.some((arg) => String(arg || '').trim().toLowerCase() === '--numstat');
    }

    if (primary === 'submodule') {
      const secondary = String(commandArgs?.[1] || '').trim().toLowerCase();
      return secondary === 'status';
    }

    return false;
  }

  private readGitFileBuffer(revisionSpec: string, maxBytes: number): Promise<Buffer> {
    const repoPath = this.ensureRepoPath();
    return this.gitRunner.schedule(repoPath, 'interactive', 'show', (signal) => new Promise<Buffer>((resolve, reject) => {
      const proc = spawn('git', ['show', revisionSpec], { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let capturedBytes = 0;
      let stderr = '';
      let tooLarge = false;

      const abort = () => proc.kill();
      signal.addEventListener('abort', abort, { once: true });

      proc.stdout.on('data', (chunk: Buffer) => {
        capturedBytes += chunk.length;
        if (capturedBytes > maxBytes) {
          tooLarge = true;
          proc.kill();
          return;
        }
        chunks.push(chunk);
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
      });
      proc.on('error', reject);
      proc.on('close', (code, closeSignal) => {
        signal.removeEventListener('abort', abort);
        if (tooLarge) {
          reject(new Error('File is too large for Markdown preview.'));
          return;
        }
        if (signal.aborted || closeSignal) {
          const error = new Error('Git file read was aborted.');
          error.name = 'AbortError';
          reject(error);
          return;
        }
        if (code !== 0) {
          reject(new Error((stderr || `git show ${revisionSpec} exited with code ${code}`).trim()));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    }));
  }

  /**
   * Fuehrt einen Git Befehl im ausgewaehlten Repository aus
   */
  async runCommand(args: string[]): Promise<string> {
    const repoPath = this.ensureRepoPath();
    if (this.isCurrentRepositoryBare(repoPath) && this.shouldSuppressBareWorkTreeCommand(args)) {
      return '';
    }
    return this.gitRunner.run(repoPath, args);
  }

  /**
   * Fuehrt einen Git-Befehl in einem expliziten Repository-Pfad aus.
   */
  async runCommandAtPath(repoPath: string, args: string[]): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }
    return this.gitRunner.run(normalizedPath, args);
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
    return this.gitRunner.run(normalizedPath, args, {
      requestedKind: 'polling',
      coalesceKey,
    });
  }

  async runCommandAtPathWithSignal(repoPath: string, args: string[], signal: AbortSignal): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }
    return this.gitRunner.run(normalizedPath, args, {
      signal,
      requestedKind: 'background',
    });
  }

  getSchedulerDiagnostics() {
    return this.gitRunner.getSchedulerDiagnostics();
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
    return this.runCommand(statusPorcelainArgs());
  }

  async getStatusPorcelainAtPath(repoPath: string): Promise<string> {
    return this.runCommandAtPath(repoPath, statusPorcelainArgs());
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
    return this.repositoryFiles.readRepoFile(relativePath);
  }

  async readRepositoryFileTextAtSource(
    source: RepositoryFileSource,
    relativePath: string,
    commitHash?: string,
  ): Promise<string> {
    return this.repositoryFiles.readRepositoryFileTextAtSource(source, relativePath, commitHash);
  }

  async readRepositoryImageDataUrlAtSource(
    source: RepositoryFileSource,
    relativePath: string,
    commitHash?: string,
  ): Promise<RepositoryFileDataUrl> {
    return this.repositoryFiles.readRepositoryImageDataUrlAtSource(source, relativePath, commitHash);
  }

  /**
   * Schreibt eine Textdatei innerhalb des aktiven Repositories.
   */
  async writeRepoFile(relativePath: string, content: string): Promise<void> {
    await this.repositoryFiles.writeRepoFile(relativePath, content);
  }

  /**
   * Setzt einen laufenden Merge nach Konfliktaufloesung fort.
   */
  async continueMerge(): Promise<string> {
    const repoPath = this.ensureRepoPath();
    return this.gitRunner.run(repoPath, ['merge', '--continue'], {
      envOverrides: {
        GIT_EDITOR: 'true',
        GIT_MERGE_AUTOEDIT: 'no',
      },
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
    return this.gitRunner.run(repoPath, ['rebase', '--continue'], {
      envOverrides: {
        GIT_EDITOR: 'true',
      },
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
    const tempDir = this.createPrivateTempDir('ogc-rebase-editor-');
    const helperPath = path.join(tempDir, 'editor.js');
    const helperScript = [
      "const fs = require('fs');",
      "const target = process.argv[2];",
      "if (!target) process.exit(1);",
      "const raw = process.env.OGC_REBASE_TODO_B64 || '';",
      "const content = Buffer.from(raw, 'base64').toString('utf8');",
      "fs.writeFileSync(target, content, 'utf8');",
    ].join('\n');

    this.writePrivateTempFile(helperPath, helperScript);

    const quotedNode = `\"${process.execPath.replace(/\"/g, '\\\"')}\"`;
    const quotedHelper = `\"${helperPath.replace(/\"/g, '\\\"')}\"`;

    try {
      return await this.gitRunner.run(repoPath, ['rebase', '-i', normalizedBase], {
        envOverrides: {
          GIT_SEQUENCE_EDITOR: `${quotedNode} ${quotedHelper}`,
          OGC_REBASE_TODO_B64: Buffer.from(todoText, 'utf8').toString('base64'),
        },
        requestedKind: 'write',
      });
    } finally {
      this.cleanupPrivateTempDir(tempDir);
    }
  }

  async commitWithMessage(input: CommitMessageInput): Promise<string> {
    return this.commitWithMessageAtPath(this.ensureRepoPath(), input);
  }

  async commitWithMessageForPaths(input: CommitMessageInput, paths: string[]): Promise<string> {
    return this.commitWithMessageAtPath(this.ensureRepoPath(), input, paths);
  }

  async commitWithMessageAtPath(repoPath: string, input: CommitMessageInput, paths?: string[]): Promise<string> {
    return this.commitService.commitWithMessageAtPath(repoPath, input, paths);
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

    return this.gitRunner.schedule(repoPath, 'write', 'apply', (signal) => new Promise<string>((resolve, reject) => {
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
      const output = await this.gitRunner.run(normalizedPath, ['remote', 'get-url', 'origin']);
      const trimmed = String(output || '').trim();
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

  async createBranchFromStash(stashName: string, branchName: string): Promise<string> {
    const normalizedStashName = String(stashName || '').trim();
    const normalizedBranchName = String(branchName || '').trim();
    if (!normalizedStashName) {
      throw new Error('Stash name is required.');
    }
    if (!normalizedBranchName) {
      throw new Error('Branch name is required.');
    }

    await this.runCommand(['check-ref-format', '--branch', normalizedBranchName]);
    return this.runCommand(['stash', 'branch', normalizedBranchName, normalizedStashName]);
  }

  async getSubmoduleStatus(): Promise<string> {
    try {
      return await this.runCommand(['submodule', 'status', '--recursive']);
    } catch (error: any) {
      if (/no submodule mapping found in \.gitmodules for path/i.test(String(error?.message || ''))) {
        return '';
      }
      throw error;
    }
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

  async getLog(limit: number = 50, includeAll: boolean = true, offset: number = 0): Promise<string> {
    return this.historyService.getLog(limit, includeAll, offset);
  }

  async getForensicHistoryByString(search: string, filePath: string, limit: number = 200): Promise<string> {
    return this.historyService.getForensicHistoryByString(search, filePath, limit);
  }

  async getForensicHistoryByRegex(regex: string, filePath: string, limit: number = 200): Promise<string> {
    return this.historyService.getForensicHistoryByRegex(regex, filePath, limit);
  }

  async getForensicHistoryByLineRange(filePath: string, startLine: number, endLine: number, limit: number = 200): Promise<string> {
    return this.historyService.getForensicHistoryByLineRange(filePath, startLine, endLine, limit);
  }

  /**
   * Liefert Reflog-Eintraege in einem stabil parsebaren Format.
   */
  async getReflog(limit: number = 300): Promise<string> {
    return this.historyService.getReflog(limit);
  }

  /**
   * Holt die Details eines einzelnen Commits (veraenderte Dateien)
   */
  async getCommitDetails(hash: string): Promise<string> {
    return this.historyService.getCommitDetails(hash);
  }

  /**
   * Liefert die Historie einer einzelnen Datei.
   */
  async getFileHistory(filePath: string, limit: number = 100, commitHash?: string): Promise<string> {
    return this.historyService.getFileHistory(filePath, limit, commitHash);
  }

  /**
   * Liefert Blame-Informationen einer Datei.
   */
  async getFileBlame(filePath: string, commitHash?: string): Promise<string> {
    return this.historyService.getFileBlame(filePath, commitHash);
  }

  async getFileBlameRange(
    filePath: string,
    commitHash: string | undefined,
    startLine: number,
    lineCount: number,
  ): Promise<string> {
    return this.historyService.getFileBlameRange(filePath, commitHash, startLine, lineCount);
  }

  async getCommitStatsAtPath(repoPath: string, hash: string, signal: AbortSignal): Promise<CommitStats> {
    return this.historyService.getCommitStatsAtPath(repoPath, hash, signal);
  }

  async stagePaths(paths: string[]): Promise<string> {
    return this.stagePathsAtPath(this.ensureRepoPath(), paths);
  }

  async stagePathsAtPath(repoPath: string, paths: string[]): Promise<string> {
    return this.commitService.stagePathsAtPath(repoPath, paths);
  }

  async unstagePathsAtPath(repoPath: string, paths: string[]): Promise<string> {
    return this.commitService.unstagePathsAtPath(repoPath, paths);
  }

  async getDiffPreview(
    args: string[],
    limits: { maxBytes?: number; maxLines?: number } = {},
  ): Promise<DiffPreviewResult> {
    const repoPath = this.ensureRepoPath();
    const maxBytes = Math.max(64 * 1024, Math.min(limits.maxBytes || 2 * 1024 * 1024, 8 * 1024 * 1024));
    const maxLines = Math.max(100, Math.min(limits.maxLines || 5000, 20_000));

    return this.gitRunner.schedule(repoPath, 'interactive', args[0] || 'diff', (signal) => new Promise<DiffPreviewResult>((resolve, reject) => {
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
    await this.gitRunner.schedule(repoPath, 'interactive', args[0] || 'stream', (schedulerSignal) => new Promise<void>((resolve, reject) => {
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

  async streamCommandOutput(
    args: string[],
    onLine: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const repoPath = this.ensureRepoPath();
    this.gitRunner.assertRepoPathAvailable(repoPath);

    const emitLines = (chunk: Buffer, pendingRef: { value: string }, capture: (text: string) => void) => {
      const text = chunk.toString('utf8');
      capture(text);

      const parts = `${pendingRef.value}${text}`.split(/\r\n|\n|\r/);
      pendingRef.value = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (line) onLine(line);
      }
    };

    const kind = this.gitRunner.classifyCommand(args);
    return this.gitRunner.schedule(repoPath, kind, args[0] || 'stream', (schedulerSignal) => new Promise<string>((resolve, reject) => {
      const proc = spawn('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
      const stdoutPending = { value: '' };
      const stderrPending = { value: '' };
      let stdout = '';
      let stderr = '';
      const abort = () => proc.kill();
      schedulerSignal.addEventListener('abort', abort, { once: true });

      proc.stdout.on('data', (chunk: Buffer) => {
        emitLines(chunk, stdoutPending, (text) => {
          stdout += text;
        });
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        emitLines(chunk, stderrPending, (text) => {
          if (stderr.length < 256 * 1024) stderr += text;
        });
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

        const stdoutTail = stdoutPending.value.trim();
        const stderrTail = stderrPending.value.trim();
        if (stdoutTail) onLine(stdoutTail);
        if (stderrTail) onLine(stderrTail);

        if (code !== 0) {
          reject(new Error((stderr || stdout || `git ${args.join(' ')} exited with code ${code}`).trim()));
          return;
        }
        resolve(stdout.trimEnd());
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

  private resolveCloneTargetPath(cloneSource: string, targetDir: string, targetName?: string): string {
    const rawTargetDir = String(targetDir || '').trim();
    if (!rawTargetDir) {
      throw new Error('Clone target directory is required.');
    }

    const resolvedTargetDir = path.resolve(rawTargetDir);
    let targetDirStats: fs.Stats;
    try {
      targetDirStats = fs.statSync(resolvedTargetDir);
    } catch {
      throw new Error(`Clone target directory does not exist: ${resolvedTargetDir}`);
    }
    if (!targetDirStats.isDirectory()) {
      throw new Error(`Clone target is not a directory: ${resolvedTargetDir}`);
    }

    const repoName = targetName
      ? this.sanitizeCloneTargetName(targetName)
      : this.deriveCloneRepoName(cloneSource);
    const repoPath = path.resolve(resolvedTargetDir, repoName);
    const relative = path.relative(resolvedTargetDir, repoPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Clone target name resolves outside of the selected directory.');
    }
    return repoPath;
  }

  async getFileTimelineData(limit: number = 2000): Promise<FileTimelineCommit[]> {
    return this.historyService.getFileTimelineData(limit);
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
      let repoPath = '';
      try {
        repoPath = this.resolveCloneTargetPath(cloneUrl, targetDir, targetName);
      } catch (error: any) {
        resolve({
          success: false,
          repoPath: targetDir ? path.resolve(String(targetDir)) : '',
          error: error?.message || 'Invalid clone target.',
        });
        return;
      }

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
