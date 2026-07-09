import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { GitScheduler } from './GitScheduler';
import { CloneService, type CloneRepositoryResult } from './git/CloneService';
import { CommitService, type CommitMessageInput } from './git/CommitService';
import { GitRunner, defaultExecFileAsyncRunner, type DiffPreviewResult, type ExecFileAsyncRunner } from './git/GitRunner';
import { HistoryService, type CommitStats, type FileTimelineCommit } from './git/HistoryService';
import { RepositoryFiles, type RepositoryFileDataUrl, type RepositoryFileSource } from './git/RepositoryFiles';

export type { CommitStats, FileTimelineCommit };
export type { DiffPreviewResult };
export type { RepositoryFileDataUrl, RepositoryFileSource };
const statusPorcelainArgs = (): string[] => ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--untracked-files=all'];

export class GitService {
  private repoPath: string | null = null;
  private repoIsBare: boolean | null = null;
  private readonly gitRunner: GitRunner;
  private readonly commitService: CommitService;
  private readonly historyService: HistoryService;
  private readonly repositoryFiles: RepositoryFiles;
  private readonly cloneService: CloneService;

  constructor(execFileAsyncRunner: ExecFileAsyncRunner = defaultExecFileAsyncRunner, scheduler: GitScheduler = new GitScheduler()) {
    this.gitRunner = new GitRunner(execFileAsyncRunner, scheduler);
    this.commitService = new CommitService((repoPath, args, envOverrides) => this.gitRunner.run(repoPath, args, { envOverrides }));
    this.historyService = new HistoryService(
      (args) => this.runCommand(args),
      (repoPath, args, signal) => this.runCommandAtPathWithSignal(repoPath, args, signal),
    );
    this.repositoryFiles = new RepositoryFiles(
      () => this.ensureRepoPath(),
      (revisionSpec, maxBytes) => this.readGitFileBuffer(revisionSpec, maxBytes),
    );
    this.cloneService = new CloneService(this.gitRunner);
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

  requireActiveRepoPath(): string {
    return this.ensureRepoPath();
  }

  get runner(): GitRunner {
    return this.gitRunner;
  }

  get commits(): CommitService {
    return this.commitService;
  }

  get history(): HistoryService {
    return this.historyService;
  }

  get files(): RepositoryFiles {
    return this.repositoryFiles;
  }

  get clone(): CloneService {
    return this.cloneService;
  }

  /**
   * Normalisiert auf den echten Repository-Root (falls `newPath` innerhalb eines Repos liegt).
   * Das verhindert pathspec-Fehler bei Dateipfaden, wenn Nutzer Unterordner als Repo oeffnen.
   */
  private resolveRepoRoot(candidatePath: string): string {
    return this.gitRunner.resolveRepositoryRootSync(candidatePath);
  }

  private detectIsBareRepositorySync(candidatePath: string): boolean {
    return this.gitRunner.detectIsBareRepositorySync(candidatePath);
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
    const primary = String(commandArgs?.[0] || '')
      .trim()
      .toLowerCase();
    if (!primary) return false;

    if (primary === 'status') {
      return true;
    }

    if (primary === 'diff') {
      return commandArgs.some(
        (arg) =>
          String(arg || '')
            .trim()
            .toLowerCase() === '--numstat',
      );
    }

    if (primary === 'submodule') {
      const secondary = String(commandArgs?.[1] || '')
        .trim()
        .toLowerCase();
      return secondary === 'status';
    }

    return false;
  }

  private readGitFileBuffer(revisionSpec: string, maxBytes: number): Promise<Buffer> {
    const repoPath = this.ensureRepoPath();
    return this.gitRunner.runBuffer(repoPath, ['show', revisionSpec], {
      maxBytes,
      tooLargeMessage: 'File is too large for Markdown preview.',
      requestedKind: 'interactive',
      commandName: 'show',
    });
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

  async runPollingCommandAtPath(repoPath: string, args: string[], coalesceKey?: string): Promise<string> {
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

  async readRepositoryFileTextAtSource(source: RepositoryFileSource, relativePath: string, commitHash?: string): Promise<string> {
    return this.repositoryFiles.readRepositoryFileTextAtSource(source, relativePath, commitHash);
  }

  async readRepositoryImageDataUrlAtSource(source: RepositoryFileSource, relativePath: string, commitHash?: string): Promise<RepositoryFileDataUrl> {
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

    const normalizedLines = Array.isArray(todoLines) ? todoLines.map((line) => String(line || '').trim()).filter(Boolean) : [];

    if (normalizedLines.length === 0) {
      throw new Error('At least one rebase todo line is required.');
    }

    const todoText = normalizedLines.join('\n') + '\n';
    const tempDir = this.createPrivateTempDir('ogc-rebase-editor-');
    const helperPath = path.join(tempDir, 'editor.js');
    const helperScript = [
      "const fs = require('fs');",
      'const target = process.argv[2];',
      'if (!target) process.exit(1);',
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

    return this.gitRunner.runWithInput(repoPath, args, patch, {
      requestedKind: 'write',
      commandName: 'apply',
    });
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

  async getFileBlameRange(filePath: string, commitHash: string | undefined, startLine: number, lineCount: number): Promise<string> {
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

  async getDiffPreview(args: string[], limits: { maxBytes?: number; maxLines?: number } = {}): Promise<DiffPreviewResult> {
    const repoPath = this.ensureRepoPath();
    return this.gitRunner.getDiffPreview(repoPath, args, limits);
  }

  async streamCommandLines(args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<void> {
    const repoPath = this.ensureRepoPath();
    await this.gitRunner.streamLines(repoPath, args, onLine, signal);
  }

  async streamCommandOutput(args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<string> {
    const repoPath = this.ensureRepoPath();
    return this.gitRunner.streamOutput(repoPath, args, onLine, signal);
  }

  async getFileTimelineData(limit: number = 2000): Promise<FileTimelineCommit[]> {
    return this.historyService.getFileTimelineData(limit);
  }

  /**
   * Klont ein Repository mit Fortschrittsanzeige
   */
  cloneRepo(cloneUrl: string, targetDir: string, onProgress: (line: string) => void, targetName?: string): Promise<CloneRepositoryResult> {
    return this.cloneService.cloneRepo(cloneUrl, targetDir, onProgress, targetName);
  }
}

// Singleton Instanz
export const gitService = new GitService();
