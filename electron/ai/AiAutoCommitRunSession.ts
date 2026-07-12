import type { GitService } from '../GitService';
import { toLiteralPathspec } from '../git/RepositoryPathSafety';
import type { AppSettings } from '../settings';
import { AutoCommitPlanner } from './AutoCommitPlanner';
import type { AiProviderClient } from './AiProviderClient';
import { getSelectedAiModel } from './AiProviderClient';
import { buildGroupKey, detectChangeType, parseStatusPorcelain } from './gitStatusSnapshot';
import { buildFallbackCommitMessage, generateCommitMessageWithAi } from './commitMessageGenerator';
import { chooseFilesWithAi, planGroupsWithAi } from './autoCommitAiPlanning';
import { AutoCommitSnapshotHydrator } from './AutoCommitSnapshotHydrator';
import { hasCommitWithMessage, hasCommitWithMessageAtPath, hasCommitWithMessageForPaths, hasStagePaths } from './autoCommitGitCapabilities';
import { CHAT_TIMEOUT_MS } from './providerText';
import type { AiAutoCommitResult, AiProgressUpdate, CommitMessage, ProgressPhase, SnapshotFile } from './aiServiceTypes';
import { AiAutoCommitGroupRecovery, type GroupState } from './AiAutoCommitGroupRecovery';
import { AiAutoCommitRunState } from './AiAutoCommitRunState';
import { buildAiAutoCommitRunResult } from './AiAutoCommitRunSummary';
import { AiAutoCommitIndexTransaction } from './AiAutoCommitIndexTransaction';

const MAX_COMMIT_FILES_NORMAL = 5;
const MAX_COMMIT_FILES_RETRY = 3;
const MAX_COMMIT_FILES_FALLBACK = 2;
const MAX_NET_LINES_PER_COMMIT = 450;
const LARGE_BATCH_THRESHOLD = 8;
const STANDARD_BATCH_THRESHOLD = 7;
const LARGE_HYBRID_PLAN_TIMEOUT_MS = 12_000;
const LARGE_HYBRID_SELECT_TIMEOUT_MS = 10_000;
const LARGE_HYBRID_MESSAGE_TIMEOUT_MS = 14_000;
const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);
export class AiAutoCommitRunSession {
  private readonly state: AiAutoCommitRunState;
  private readonly groupRecovery: AiAutoCommitGroupRecovery;
  private readonly autoCommitPlanner = new AutoCommitPlanner({
    maxFilesNormal: MAX_COMMIT_FILES_NORMAL,
    maxFilesRetry: MAX_COMMIT_FILES_RETRY,
    maxFilesFallback: MAX_COMMIT_FILES_FALLBACK,
    maxNetLinesPerCommit: MAX_NET_LINES_PER_COMMIT,
  });
  private readonly indexTransaction: AiAutoCommitIndexTransaction;
  constructor(
    private readonly gitService: GitService,
    private readonly providerClient: AiProviderClient,
    private readonly repoPath: string,
    private readonly settings: AppSettings,
    private readonly getGeminiApiKey: () => string,
    onProgress?: (update: AiProgressUpdate) => void,
    private readonly shouldCancel?: () => boolean,
    private readonly getOpenAiApiKey: () => string = () => '',
    beforeCommit?: (privateIndexPath: string) => Promise<void>,
  ) {
    this.state = new AiAutoCommitRunState(onProgress);
    this.groupRecovery = new AiAutoCommitGroupRecovery(this.state);
    this.indexTransaction = new AiAutoCommitIndexTransaction(this.gitService, this.repoPath, beforeCommit);
  }
  async run(): Promise<AiAutoCommitResult> {
    try {
      this.validateInputs();
      this.state.emitProgress({ phase: 'snapshot', message: 'Snapshot wird erstellt...', progress: 5, details: this.state.buildProgressDetails(0) });
      const snapshotFiles = await this.prepareSnapshotFiles();
      const snapshotHydrator = new AutoCommitSnapshotHydrator(
        this.gitService,
        this.repoPath,
        () => this.ensureNotCancelled(),
        this.indexTransaction.supported ? this.indexTransaction.snapshotIndexPathForRead : undefined,
      );
      const groups = await this.planGroups(snapshotFiles, snapshotHydrator);
      await this.processGroups(groups, snapshotFiles, snapshotHydrator);
      if (this.state.commits.length === 0) {
        const diagnostic = this.state.diagnostics[this.state.diagnostics.length - 1];
        throw new Error(diagnostic || 'KI Auto-Commit konnte keinen Commit erstellen.');
      }
      return buildAiAutoCommitRunResult(this.gitService, this.repoPath, snapshotFiles, groups, this.state);
    } finally {
      this.indexTransaction.dispose();
    }
  }
  private validateInputs(): void {
    if (!this.repoPath.trim()) throw new Error('No repository selected.');
    if (!this.settings.aiAutoCommitEnabled) throw new Error('AI Auto-Commit ist in den Einstellungen deaktiviert.');
    if (!getSelectedAiModel(this.settings)) throw new Error('Kein KI-Modell konfiguriert.');
    if (this.settings.aiProvider === 'gemini' && !this.getGeminiApiKey().trim()) throw new Error('Gemini API key fehlt.');
    if (this.settings.aiProvider === 'openai' && !this.getOpenAiApiKey().trim()) throw new Error('OpenAI API key fehlt.');
  }
  private async prepareSnapshotFiles(): Promise<SnapshotFile[]> {
    this.ensureNotCancelled();
    const initialStatus = await this.getStatusPorcelain();
    this.ensureNotCancelled();
    const statusEntries = parseStatusPorcelain(initialStatus);
    if (statusEntries.some((entry) => CONFLICT_CODES.has(entry.code))) {
      throw new Error('Repository hat Konflikte. Bitte zuerst aufloesen.');
    }
    if (statusEntries.length === 0) {
      throw new Error('Working Tree ist sauber. Keine Commits noetig.');
    }

    // Capture every changed path in a private index before any provider call.
    // The live index is not touched while messages are being generated.
    await this.indexTransaction.initialize(statusEntries);

    const snapshotFiles = statusEntries.map((entry): SnapshotFile => this.toSnapshotFile(entry));
    if (snapshotFiles.length >= LARGE_BATCH_THRESHOLD) {
      this.state.enableLargeHybridBudget();
    }

    this.state.emitProgress({
      phase: 'snapshot',
      message: `Vorgruppierung abgeschlossen: ${snapshotFiles.length} Datei(en) erkannt`,
      progress: 14,
      details: this.state.buildProgressDetails(snapshotFiles.length, {
        processedFiles: this.state.processedFiles,
        remainingFiles: snapshotFiles.length,
      }),
    });
    return snapshotFiles;
  }

  private toSnapshotFile(entry: ReturnType<typeof parseStatusPorcelain>[number]): SnapshotFile {
    const pathValue = entry.path;
    const changeType = detectChangeType(entry);
    // A rename batch must also remove its source path. A copy must not include
    // the source: it can have an independent modification/status entry and is
    // otherwise already present in the batch's HEAD base tree.
    const renamedFrom = entry.x === 'R' || entry.y === 'R' ? entry.originalPath : undefined;
    return {
      path: pathValue,
      ...(renamedFrom ? { originalPath: renamedFrom } : {}),
      changeType,
      additions: 0,
      deletions: 0,
      isBinary: false,
      preview: '(preview pending)',
      keyChanges: [],
      groupKey: buildGroupKey(pathValue, changeType),
      hydrated: false,
    };
  }

  private async planGroups(snapshotFiles: SnapshotFile[], snapshotHydrator: AutoCommitSnapshotHydrator): Promise<SnapshotFile[][]> {
    this.state.emitProgress({
      phase: 'grouping',
      message: `Dateien werden gruppiert (${snapshotFiles.length})...`,
      progress: 15,
      details: this.state.buildProgressDetails(snapshotFiles.length, {
        groupSize: snapshotFiles.length,
        step: this.state.strategy === 'large-hybrid' ? 'planning-groups' : 'grouping',
      }),
    });

    let groups = this.autoCommitPlanner.groupFilesDeterministically(snapshotFiles);
    if (this.state.strategy !== 'large-hybrid') return groups;

    await snapshotHydrator.hydrateLargeBatchSignals(snapshotFiles);
    const aiPlannedGroups = await this.planLargeBatchGroups(snapshotFiles);
    if (aiPlannedGroups.length > 0) {
      groups = this.mapPlannedGroupsToFiles(snapshotFiles, aiPlannedGroups);
    } else {
      this.state.warnings.push('Hybrid-Gruppenplanung ungueltig oder unvollstaendig; deterministische Gruppierung aktiv.');
      this.state.emitProgress({
        phase: 'fallback',
        message: 'Deterministische Gruppenplanung aktiv (Hybrid-Fallback).',
        details: this.state.buildProgressDetails(snapshotFiles.length, { step: 'deterministic-fallback' }),
      });
    }
    return groups;
  }

  private async planLargeBatchGroups(snapshotFiles: SnapshotFile[]): Promise<string[][]> {
    this.state.emitProgress({
      phase: 'grouping',
      message: 'KI plant Commit-Gruppen (Hybrid-Modus)...',
      progress: 16,
      details: this.state.buildProgressDetails(snapshotFiles.length, { step: 'planning-groups' }),
    });

    const planTimeoutMs = this.state.getAiTimeoutMs(LARGE_HYBRID_PLAN_TIMEOUT_MS);
    if (planTimeoutMs == null) {
      this.state.markAiBudgetExhausted('Gruppenplanung');
      return [];
    }

    try {
      this.ensureNotCancelled();
      this.state.modelTurns += 1;
      const aiCallStartedAt = Date.now();
      const plannedGroups = await planGroupsWithAi(
        this.providerClient,
        this.settings,
        snapshotFiles,
        this.getGeminiApiKey,
        this.shouldCancel,
        planTimeoutMs,
        this.getOpenAiApiKey,
      );
      this.state.consumeAiBudget(aiCallStartedAt, 'Gruppenplanung');
      this.ensureNotCancelled();
      return plannedGroups;
    } catch (error: unknown) {
      this.ensureNotCancelled();
      this.state.diagnostics.push(error instanceof Error ? error.message : 'KI-Gruppenplanung fehlgeschlagen.');
      return [];
    }
  }

  private mapPlannedGroupsToFiles(snapshotFiles: SnapshotFile[], plannedGroups: string[][]): SnapshotFile[][] {
    const byPath = new Map(snapshotFiles.map((file) => [file.path, file]));
    return plannedGroups
      .map((groupPaths) => groupPaths.map((pathValue) => byPath.get(pathValue)).filter((file): file is SnapshotFile => Boolean(file)))
      .filter((group) => group.length > 0);
  }

  private async processGroups(groups: SnapshotFile[][], snapshotFiles: SnapshotFile[], snapshotHydrator: AutoCommitSnapshotHydrator): Promise<void> {
    const groupQueues = groups.map((group) => [...group]);
    for (let groupIndex = 0; groupIndex < groupQueues.length; groupIndex += 1) {
      const queue = groupQueues[groupIndex];
      if (queue.length > 0) {
        await this.processGroupQueue(queue, groupIndex, groupQueues.length, snapshotFiles, snapshotHydrator);
      }
      if (this.state.isRunTimedOut()) break;
    }
  }

  private async processGroupQueue(
    queue: SnapshotFile[],
    groupIndex: number,
    totalGroups: number,
    snapshotFiles: SnapshotFile[],
    snapshotHydrator: AutoCommitSnapshotHydrator,
  ): Promise<void> {
    const groupState: GroupState = this.groupRecovery.createState();
    while (queue.length > 0) {
      this.ensureNotCancelled();
      if (this.state.stopIfTimedOut()) break;

      this.maybeSwitchToStandardStrategy(queue, groupIndex, snapshotFiles);
      const windowFiles = await this.prepareWindow(queue, groupIndex, totalGroups, snapshotFiles, snapshotHydrator);
      const selectedPaths = await this.selectPathsForWindow(windowFiles, groupIndex, snapshotFiles, queue.length);

      if (selectedPaths.length === 0) {
        if (this.groupRecovery.handleEmptySelection(groupState, groupIndex, queue.length, snapshotFiles) === 'continue') continue;
        break;
      }

      const batchFiles = this.resolveBatchFiles(queue, selectedPaths);
      if (batchFiles.length === 0) {
        if (this.groupRecovery.handleInvalidBatch(groupState, groupIndex, queue.length, snapshotFiles) === 'continue') continue;
        break;
      }

      const committed = await this.tryCommitBatch(batchFiles, queue, groupState, groupIndex, snapshotFiles);
      if (!committed && this.groupRecovery.isStalled(groupState)) break;
    }
  }

  private async prepareWindow(
    queue: SnapshotFile[],
    groupIndex: number,
    totalGroups: number,
    snapshotFiles: SnapshotFile[],
    snapshotHydrator: AutoCommitSnapshotHydrator,
  ): Promise<SnapshotFile[]> {
    const phase: ProgressPhase = this.state.mode === 'fallback' ? 'fallback' : this.state.mode === 'retry' ? 'retry' : 'committing';
    const windowFiles = this.autoCommitPlanner.pickWindow(queue, this.state.mode);

    this.state.emitProgress({
      phase,
      message: `Gruppe ${groupIndex + 1}/${totalGroups}: ${windowFiles.length} Datei(en) werden vorbereitet`,
      progress: Math.min(95, 20 + Math.floor((this.state.processedFiles / Math.max(1, snapshotFiles.length)) * 70)),
      details: this.state.buildProgressDetails(snapshotFiles.length, {
        groupId: groupIndex + 1,
        groupSize: queue.length,
        step: this.state.strategy === 'large-hybrid' ? 'hybrid-window' : 'standard-window',
      }),
    });

    if (this.state.strategy === 'standard') {
      for (const file of windowFiles) {
        await snapshotHydrator.hydrateSnapshotFile(file);
      }
    }
    this.ensureNotCancelled();
    return windowFiles;
  }

  private async selectPathsForWindow(windowFiles: SnapshotFile[], groupIndex: number, snapshotFiles: SnapshotFile[], groupSize: number): Promise<string[]> {
    if (this.state.mode === 'fallback') return windowFiles.map((file) => file.path).slice(0, MAX_COMMIT_FILES_FALLBACK);
    if (this.state.strategy === 'large-hybrid' || this.state.aiBudgetExhausted) {
      this.emitDeterministicFallbackProgress(groupIndex, groupSize, snapshotFiles.length);
      return windowFiles.map((file) => file.path);
    }
    return this.selectPathsWithAi(windowFiles, groupIndex, groupSize, snapshotFiles.length);
  }

  private async selectPathsWithAi(windowFiles: SnapshotFile[], groupIndex: number, groupSize: number, totalFiles: number): Promise<string[]> {
    try {
      this.state.emitProgress({
        phase: 'grouping',
        message: `KI waehlt Dateien fuer Gruppe ${groupIndex + 1}...`,
        details: this.state.buildProgressDetails(totalFiles, {
          groupId: groupIndex + 1,
          groupSize,
          step: 'selecting-files',
        }),
      });
      this.ensureNotCancelled();
      this.state.modelTurns += 1;
      const selectTimeoutMs = this.state.getAiTimeoutMs(LARGE_HYBRID_SELECT_TIMEOUT_MS);
      if (selectTimeoutMs == null) {
        this.state.markAiBudgetExhausted('Dateiauswahl');
        return windowFiles.map((file) => file.path);
      }

      const aiCallStartedAt = Date.now();
      const selectedPaths = await chooseFilesWithAi(
        this.providerClient,
        this.settings,
        windowFiles,
        this.getGeminiApiKey,
        this.shouldCancel,
        selectTimeoutMs,
        this.getOpenAiApiKey,
      );
      this.state.consumeAiBudget(aiCallStartedAt, 'Dateiauswahl');
      this.ensureNotCancelled();
      return selectedPaths;
    } catch (error: unknown) {
      this.ensureNotCancelled();
      this.state.diagnostics.push(error instanceof Error ? error.message : 'KI-Auswahl fehlgeschlagen.');
      return [];
    }
  }

  private async tryCommitBatch(
    batchFiles: SnapshotFile[],
    queue: SnapshotFile[],
    groupState: GroupState,
    groupIndex: number,
    snapshotFiles: SnapshotFile[],
  ): Promise<boolean> {
    try {
      await this.commitBatch(batchFiles, queue, groupIndex, snapshotFiles.length);
      groupState.groupRetries = 0;
      groupState.stallCycles = 0;
      this.state.transitionMode('normal');
      return true;
    } catch (error: unknown) {
      this.ensureNotCancelled();
      const message = error instanceof Error ? error.message : 'Commit fehlgeschlagen.';
      this.state.diagnostics.push(message);
      throw new Error(`KI Auto-Commit konnte den Commit nicht erstellen: ${message}`);
    }
  }

  private async commitBatch(batchFiles: SnapshotFile[], queue: SnapshotFile[], groupIndex: number, totalFiles: number): Promise<void> {
    // Do not begin a batch that has already been cancelled.
    this.ensureNotCancelled();
    let message: CommitMessage;
    let committedRevision = 'HEAD';
    if (this.indexTransaction.supported) {
      // The private snapshot index already contains the immutable blobs. No
      // live staging occurs before or during the provider request.
      message = await this.buildMessageForBatch(batchFiles, groupIndex, queue.length, totalFiles);
      this.ensureNotCancelled();
      committedRevision = await this.indexTransaction.commit(batchFiles, message);
    } else {
      // Compatibility path for lightweight test/service adapters. Production
      // GitService always supports the isolated index transaction.
      await this.stageBatchFiles(batchFiles);
      try {
        message = await this.buildMessageForBatch(batchFiles, groupIndex, queue.length, totalFiles);
        this.ensureNotCancelled();
        await this.commitBatchWithMessage(batchFiles, message);
      } catch (error: unknown) {
        await this.safeUnstageBatchFiles(batchFiles);
        throw error;
      }
    }

    // The commit is now durable. Record it and advance the queue BEFORE any
    // further cancellation check, so a cancel arriving right after the commit
    // cannot make an already-created commit look like an unresolved batch (which
    // would otherwise be re-committed on the next run).
    const hash = (await this.runGitCommand(['rev-parse', '--short', committedRevision])).trim();
    const subject = (await this.runGitCommand(['show', '-s', '--format=%s', committedRevision])).trim();
    this.state.commits.push({ hash, subject });
    this.removeCommittedFiles(queue, batchFiles);
    this.state.processedFiles += batchFiles.length;
    if (this.state.mode === 'fallback') this.state.fallbackCommits += 1;

    this.state.emitProgress({
      phase: 'committing',
      message: `Commit erstellt: ${subject}`,
      details: this.state.buildProgressDetails(totalFiles, {
        groupId: groupIndex + 1,
        groupSize: queue.length,
        lastCommit: `${hash} ${subject}`,
      }),
    });
  }

  private async stageBatchFiles(batchFiles: SnapshotFile[]): Promise<void> {
    // Staging is intentionally NOT interrupted by cancellation: a partially
    // staged batch must never be left behind. The caller checks for
    // cancellation after staging and rolls back if needed.
    const gitCapabilities: unknown = this.gitService;
    if (typeof this.gitService.stagePathsAtPath === 'function') {
      await this.gitService.stagePathsAtPath(
        this.repoPath,
        batchFiles.map((file) => file.path),
      );
      return;
    }
    if (hasStagePaths(gitCapabilities)) {
      await gitCapabilities.stagePaths(batchFiles.map((file) => file.path));
      return;
    }

    for (const file of batchFiles) {
      await this.runGitCommand(['add', '--', toLiteralPathspec(file.path)]);
    }
  }

  /**
   * Best-effort rollback of a staged batch (e.g. after a cancellation before the
   * commit was created). Resetting the paths restores them to unstaged; failures
   * are swallowed so the original error/cancellation still surfaces.
   */
  private async safeUnstageBatchFiles(batchFiles: SnapshotFile[]): Promise<void> {
    const paths = batchFiles.map((file) => file.path);
    if (paths.length === 0) return;
    try {
      await this.runGitCommand(['reset', '-q', '--', ...paths.map((filePath) => toLiteralPathspec(filePath))]);
    } catch {
      // Ignore rollback failures; the caller re-throws the original error.
    }
  }

  private async buildMessageForBatch(batchFiles: SnapshotFile[], groupIndex: number, groupSize: number, totalFiles: number): Promise<CommitMessage> {
    if (this.state.aiBudgetExhausted) return buildFallbackCommitMessage(batchFiles);

    try {
      this.state.emitProgress({
        phase: 'committing',
        message: `KI erstellt Commit-Message fuer ${batchFiles.length} Datei(en)...`,
        details: this.state.buildProgressDetails(totalFiles, {
          groupId: groupIndex + 1,
          groupSize,
          step: 'generating-message',
        }),
      });
      this.ensureNotCancelled();
      this.state.modelTurns += 1;
      const messageTimeoutMs = this.state.strategy === 'large-hybrid' ? this.state.getAiTimeoutMs(LARGE_HYBRID_MESSAGE_TIMEOUT_MS) : CHAT_TIMEOUT_MS;
      if (messageTimeoutMs == null) {
        this.state.markAiBudgetExhausted('Commit-Message');
        return buildFallbackCommitMessage(batchFiles);
      }

      const aiCallStartedAt = Date.now();
      const message = await generateCommitMessageWithAi(
        this.providerClient,
        this.settings,
        batchFiles,
        this.getGeminiApiKey,
        this.shouldCancel,
        messageTimeoutMs,
        this.getOpenAiApiKey,
      );
      this.state.consumeAiBudget(aiCallStartedAt, 'Commit-Message');
      this.ensureNotCancelled();
      return message;
    } catch (error: unknown) {
      this.ensureNotCancelled();
      this.state.diagnostics.push(error instanceof Error ? error.message : 'Commit-Message KI fehlgeschlagen.');
      return buildFallbackCommitMessage(batchFiles);
    }
  }

  private async commitBatchWithMessage(batchFiles: SnapshotFile[], message: CommitMessage): Promise<void> {
    const gitCapabilities: unknown = this.gitService;
    const batchPaths = batchFiles.map((file) => file.path);
    const input = { title: message.title, description: message.description };

    if (hasCommitWithMessageAtPath(gitCapabilities)) {
      await gitCapabilities.commitWithMessageAtPath(this.repoPath, input, batchPaths);
    } else if (hasCommitWithMessageForPaths(gitCapabilities)) {
      await gitCapabilities.commitWithMessageForPaths(input, batchPaths);
    } else if (hasCommitWithMessage(gitCapabilities) && batchPaths.length === 0) {
      await gitCapabilities.commitWithMessage(input);
    } else {
      await this.runGitCommand(this.buildCommitArgs(message, batchPaths));
    }
  }

  private async getStatusPorcelain(): Promise<string> {
    const gitCapabilities = this.gitService as GitService & {
      getStatusPorcelainZAtPath?: (repoPath: string) => Promise<string>;
      getStatusPorcelainAtPath?: (repoPath: string) => Promise<string>;
      getStatusPorcelain?: () => Promise<string>;
    };
    if (typeof gitCapabilities.getStatusPorcelainZAtPath === 'function') {
      return gitCapabilities.getStatusPorcelainZAtPath(this.repoPath);
    }
    if (typeof gitCapabilities.getStatusPorcelainAtPath === 'function') {
      return gitCapabilities.getStatusPorcelainAtPath(this.repoPath);
    }
    if (typeof gitCapabilities.getStatusPorcelain === 'function') {
      return gitCapabilities.getStatusPorcelain();
    }
    throw new Error('Git status porcelain is not available.');
  }

  private async runGitCommand(args: string[]): Promise<string> {
    const gitCapabilities = this.gitService as GitService & {
      runCommandAtPath?: (repoPath: string, args: string[]) => Promise<string>;
      runCommand?: (args: string[]) => Promise<string>;
    };
    if (typeof gitCapabilities.runCommandAtPath === 'function') {
      return gitCapabilities.runCommandAtPath(this.repoPath, args);
    }
    if (typeof gitCapabilities.runCommand === 'function') {
      return gitCapabilities.runCommand(args);
    }
    throw new Error('Git command execution is not available.');
  }

  private buildCommitArgs(message: CommitMessage, batchPaths: string[]): string[] {
    const commitArgs = ['commit', '-m', message.title];
    if (message.description.trim()) {
      commitArgs.push('-m', message.description.trim());
    }
    commitArgs.push('--', ...batchPaths.map((filePath) => toLiteralPathspec(filePath)));
    return commitArgs;
  }

  private maybeSwitchToStandardStrategy(queue: SnapshotFile[], groupIndex: number, snapshotFiles: SnapshotFile[]): void {
    const remainingBeforeBatch = snapshotFiles.length - this.state.processedFiles;
    if (this.state.strategy !== 'large-hybrid' || remainingBeforeBatch > STANDARD_BATCH_THRESHOLD) return;

    this.state.strategy = 'standard';
    this.state.emitProgress({
      phase: 'grouping',
      message: `Strategiewechsel: Standard-Modus aktiv (${remainingBeforeBatch} Datei(en) verbleibend).`,
      details: this.state.buildProgressDetails(snapshotFiles.length, {
        groupId: groupIndex + 1,
        groupSize: queue.length,
        step: 'strategy-switch',
      }),
    });
  }

  private emitDeterministicFallbackProgress(groupIndex: number, groupSize: number, totalFiles: number): void {
    if (!this.state.aiBudgetExhausted) return;
    this.state.emitProgress({
      phase: 'fallback',
      message: 'Deterministische Dateiauswahl aktiv (KI-Budget erreicht).',
      details: this.state.buildProgressDetails(totalFiles, {
        groupId: groupIndex + 1,
        groupSize,
        step: 'deterministic-fallback',
      }),
    });
  }

  private resolveBatchFiles(queue: SnapshotFile[], selectedPaths: string[]): SnapshotFile[] {
    const selectedSet = new Set(selectedPaths);
    return queue.filter((file) => selectedSet.has(file.path));
  }

  private removeCommittedFiles(queue: SnapshotFile[], batchFiles: SnapshotFile[]): void {
    const committedPaths = new Set(batchFiles.map((file) => file.path));
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (committedPaths.has(queue[i].path)) {
        queue.splice(i, 1);
      }
    }
  }

  private ensureNotCancelled(): void {
    if (this.shouldCancel?.()) {
      throw new Error('KI Auto-Commit wurde abgebrochen.');
    }
  }
}
