import * as path from 'path';
import { GitScheduler } from './GitScheduler';
import { shouldSuppressBareWorkTreeCommand } from './git/BareRepositoryPolicy';
import { CloneService, type CloneRepositoryResult } from './git/CloneService';
import { CommitService, type CommitMessageInput } from './git/CommitService';
import { isMissingOriginGitError } from './git/GitErrorFormatter';
import { GitRunner, defaultExecFileAsyncRunner, type DiffPreviewResult, type ExecFileAsyncRunner } from './git/GitRunner';
import { HistoryService, type CommitStats, type FileTimelineCommit } from './git/HistoryService';
import { CherryPickService } from './git/CherryPickService';
import { MergeConflictService } from './git/MergeConflictService';
import { RebaseService } from './git/RebaseService';
import { RepositoryBareState } from './git/RepositoryBareState';
import { RepositoryFiles, type RepositoryFileDataUrl, type RepositoryFileSource } from './git/RepositoryFiles';
import { StashService } from './git/StashService';
import { SubmoduleService } from './git/SubmoduleService';

export type { CommitStats, FileTimelineCommit };
export type { DiffPreviewResult };
export type { RepositoryFileDataUrl, RepositoryFileSource };
const statusPorcelainArgs = (): string[] => ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--untracked-files=all'];
const statusPorcelainZArgs = (): string[] => [...statusPorcelainArgs(), '-z'];

export class GitService {
  private repoPath: string | null = null;
  private readonly bareState = new RepositoryBareState((repoPath) => this.gitRunner.detectIsBareRepositorySync(repoPath));
  private readonly gitRunner: GitRunner;
  private readonly commitService: CommitService;
  private readonly historyService: HistoryService;
  private readonly repositoryFiles: RepositoryFiles;
  private readonly cloneService: CloneService;
  private readonly mergeConflictService: MergeConflictService;
  private readonly rebaseService: RebaseService;
  private readonly cherryPickService: CherryPickService;
  private readonly stashService: StashService;
  private readonly submoduleService: SubmoduleService;

  constructor(execFileAsyncRunner: ExecFileAsyncRunner = defaultExecFileAsyncRunner, scheduler: GitScheduler = new GitScheduler()) {
    this.gitRunner = new GitRunner(execFileAsyncRunner, scheduler);
    this.commitService = new CommitService((repoPath, args, envOverrides) => this.gitRunner.run(repoPath, args, { envOverrides }));
    this.historyService = new HistoryService(
      (args) => this.runCommand(args),
      (repoPath, args, signal) => this.runCommandAtPathWithSignal(repoPath, args, signal),
      (repoPath, args, input) => this.gitRunner.runWithInput(repoPath, args, input, { commandName: 'blame' }),
      (repoPath, revisionSpec, maxBytes) => this.readGitFileBufferAtPath(repoPath, revisionSpec, maxBytes),
    );
    this.repositoryFiles = new RepositoryFiles(
      () => this.ensureRepoPath(),
      (repoPath, revisionSpec, maxBytes) => this.readGitFileBufferAtPath(repoPath, revisionSpec, maxBytes),
    );
    this.cloneService = new CloneService(this.gitRunner);
    this.mergeConflictService = new MergeConflictService(
      () => this.ensureRepoPath(),
      (args) => this.runCommand(args),
      this.gitRunner,
    );
    this.rebaseService = new RebaseService(() => this.ensureRepoPath(), this.gitRunner);
    this.cherryPickService = new CherryPickService(() => this.ensureRepoPath(), this.gitRunner);
    this.stashService = new StashService(
      (args) => this.runCommand(args),
      (repoPath, args) => this.runCommandAtPath(repoPath, args),
    );
    this.submoduleService = new SubmoduleService((args) => this.runCommand(args));
  }

  setRepoPath(newPath: string) {
    const resolvedRepoPath = this.resolveRepositoryPath(newPath);
    this.repoPath = resolvedRepoPath;
    this.bareState.setActive(resolvedRepoPath, this.gitRunner.detectIsBareRepositorySync(resolvedRepoPath));
  }

  clearRepoPath() {
    this.repoPath = null;
    this.bareState.clear();
  }

  getRepoPath(): string | null {
    return this.repoPath;
  }

  resolveRepositoryPath(repoPath: string): string {
    const normalizedPath = path.resolve(String(repoPath || '').trim() || '.');
    return this.resolveRepoRoot(normalizedPath);
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

  isBareRepository(): boolean {
    return this.repoPath ? this.bareState.isBareAtPath(this.repoPath) : false;
  }

  /** Detects the bare status of an explicit repository path (not the active repo). */
  isBareRepositoryAtPath(repoPath: string): boolean {
    return this.bareState.isBareAtPath(repoPath);
  }

  private readGitFileBufferAtPath(repoPath: string, revisionSpec: string, maxBytes: number): Promise<Buffer> {
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
    if (this.bareState.isBareAtPath(repoPath) && shouldSuppressBareWorkTreeCommand(args)) {
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

  /**
   * Runs a Git command against an explicit repository with process-local
   * environment overrides. This is intentionally kept on the main-process
   * service so callers still go through the repository scheduler and the
   * standard Git error normalization path.
   */
  async runCommandAtPathWithEnv(repoPath: string, args: string[], envOverrides: NodeJS.ProcessEnv): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }
    return this.gitRunner.run(normalizedPath, args, { envOverrides });
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
    const normalizedPath = (repoPath || '').trim();
    if (normalizedPath && this.bareState.isBareAtPath(normalizedPath) && shouldSuppressBareWorkTreeCommand(statusPorcelainArgs())) {
      return '';
    }
    return this.runCommandAtPath(repoPath, statusPorcelainArgs());
  }

  /** Unambiguous NUL-delimited status for backend parsers. */
  async getStatusPorcelainZAtPath(repoPath: string): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (normalizedPath && this.bareState.isBareAtPath(normalizedPath) && shouldSuppressBareWorkTreeCommand(statusPorcelainZArgs())) {
      return '';
    }
    return this.runCommandAtPath(repoPath, statusPorcelainZArgs());
  }

  /**
   * Nimmt bei einer Konfliktdatei die lokale (ours) oder entfernte (theirs) Variante.
   */
  async checkoutConflictVersion(filePath: string, side: 'ours' | 'theirs'): Promise<string> {
    return this.mergeConflictService.checkoutConflictVersion(filePath, side);
  }

  /**
   * Loest einen Modify/Delete-Konflikt auf, indem die geloeschte Seite
   * uebernommen wird (Datei wird entfernt und die Aufloesung gestaged).
   */
  async resolveConflictWithDeletion(filePath: string): Promise<string> {
    return this.mergeConflictService.resolveConflictWithDeletion(filePath);
  }

  /**
   * Markiert eine Datei nach Konfliktaufloesung als geloest (staged).
   */
  async addFile(filePath: string): Promise<string> {
    return this.mergeConflictService.markFileResolved(filePath);
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
    return this.mergeConflictService.continueMerge();
  }

  /**
   * Bricht einen laufenden Merge ab.
   */
  async abortMerge(): Promise<string> {
    return this.mergeConflictService.abortMerge();
  }

  /**
   * Setzt einen laufenden Rebase nach Konfliktaufloesung fort.
   */
  async continueRebase(): Promise<string> {
    return this.rebaseService.continueRebase();
  }

  /**
   * Bricht einen laufenden Rebase ab.
   */
  async abortRebase(): Promise<string> {
    return this.rebaseService.abortRebase();
  }

  /**
   * Setzt einen laufenden Cherry-Pick nach Konfliktaufloesung fort.
   */
  async continueCherryPick(): Promise<string> {
    return this.cherryPickService.continueCherryPick();
  }

  /**
   * Bricht einen laufenden Cherry-Pick ab.
   */
  async abortCherryPick(): Promise<string> {
    return this.cherryPickService.abortCherryPick();
  }

  /**
   * Startet einen interaktiven Rebase mit einer vorgegebenen Todo-Liste.
   */
  async startInteractiveRebase(baseHash: string, todoLines: string[]): Promise<string> {
    return this.rebaseService.startInteractiveRebase(baseHash, todoLines);
  }

  async startInteractiveRebaseAtPath(repoPath: string, baseHash: string, todoLines: string[]): Promise<string> {
    return this.rebaseService.startInteractiveRebaseAtPath(repoPath, baseHash, todoLines);
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
    return this.applyPatchAtPath(this.ensureRepoPath(), patchText, options);
  }

  async applyPatchAtPath(repoPath: string, patchText: string, options?: { cached?: boolean; reverse?: boolean }): Promise<string> {
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
      return String(output || '').trim() || null;
    } catch (error: unknown) {
      if (isMissingOriginGitError(error)) return null;
      throw error;
    }
  }

  async getStashes(limit: number = 200): Promise<string> {
    return this.stashService.getStashes(limit);
  }

  async createBranchFromStash(stashName: string, branchName: string): Promise<string> {
    return this.stashService.createBranchFromStash(stashName, branchName);
  }

  async createBranchFromStashAtPath(repoPath: string, stashName: string, branchName: string): Promise<string> {
    return this.stashService.createBranchFromStashAtPath(repoPath, stashName, branchName);
  }

  async getSubmoduleStatus(): Promise<string> {
    return this.submoduleService.getSubmoduleStatus();
  }

  async updateSubmodulesInitRecursive(): Promise<string> {
    return this.submoduleService.updateInitRecursive();
  }

  async syncSubmodulesRecursive(): Promise<string> {
    return this.submoduleService.syncRecursive();
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

  async streamCommandLinesAtPath(repoPath: string, args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<void> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }
    await this.gitRunner.streamLines(normalizedPath, args, onLine, signal);
  }

  async streamCommandOutput(args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<string> {
    const repoPath = this.ensureRepoPath();
    return this.gitRunner.streamOutput(repoPath, args, onLine, signal);
  }

  async streamCommandOutputAtPath(repoPath: string, args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<string> {
    const normalizedPath = (repoPath || '').trim();
    if (!normalizedPath) {
      throw new Error('Repository path is required.');
    }
    return this.gitRunner.streamOutput(normalizedPath, args, onLine, signal);
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
