import type { GitService } from '../GitService';
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
import type { AiAutoCommitResult, AiProgressUpdate, AutoCommitStrategy, CommitMessage, ProgressMode, ProgressPhase, SnapshotFile } from './aiServiceTypes';

const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_COMMIT_FILES_NORMAL = 5;
const MAX_COMMIT_FILES_RETRY = 3;
const MAX_COMMIT_FILES_FALLBACK = 2;
const MAX_NET_LINES_PER_COMMIT = 450;
const MAX_RETRIES_PER_GROUP = 2;
const MAX_GROUP_STALL_CYCLES = 8;
const LARGE_BATCH_THRESHOLD = 8;
const STANDARD_BATCH_THRESHOLD = 7;
const LARGE_HYBRID_AI_BUDGET_MS = 60_000;
const LARGE_HYBRID_PLAN_TIMEOUT_MS = 12_000;
const LARGE_HYBRID_SELECT_TIMEOUT_MS = 10_000;
const LARGE_HYBRID_MESSAGE_TIMEOUT_MS = 14_000;
const MIN_AI_CALL_BUDGET_MS = 1_200;
const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

export class AiAutoCommitRunner {
  private readonly autoCommitPlanner = new AutoCommitPlanner({
    maxFilesNormal: MAX_COMMIT_FILES_NORMAL,
    maxFilesRetry: MAX_COMMIT_FILES_RETRY,
    maxFilesFallback: MAX_COMMIT_FILES_FALLBACK,
    maxNetLinesPerCommit: MAX_NET_LINES_PER_COMMIT,
  });

  constructor(
    private readonly gitService: GitService,
    private readonly providerClient: AiProviderClient,
  ) {}

  async run(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    onProgress?: (update: AiProgressUpdate) => void,
    shouldCancel?: () => boolean,
  ): Promise<AiAutoCommitResult> {
    const runStartedAt = Date.now();

    const repoPath = this.gitService.getRepoPath();
    if (!repoPath) {
      throw new Error('No repository selected.');
    }

    if (!settings.aiAutoCommitEnabled) {
      throw new Error('AI Auto-Commit ist in den Einstellungen deaktiviert.');
    }

    const model = getSelectedAiModel(settings);
    if (!model) {
      throw new Error('Kein KI-Modell konfiguriert.');
    }

    if (settings.aiProvider === 'gemini') {
      const apiKey = getGeminiApiKey().trim();
      if (!apiKey) {
        throw new Error('Gemini API key fehlt.');
      }
    }

    let mode: ProgressMode = 'normal';
    let strategy: AutoCommitStrategy = 'standard';
    let aiBudgetRemainingMs = Number.POSITIVE_INFINITY;
    let aiBudgetExhausted = false;
    let processedFiles = 0;

    const commits: Array<{ hash: string; subject: string }> = [];
    const warnings: string[] = [];
    const diagnostics: string[] = [];
    const modeTransitions: string[] = ['normal'];
    let modelTurns = 0;
    let retries = 0;
    let fallbackCommits = 0;

    const buildProgressDetails = (totalFiles: number, extra: Record<string, unknown> = {}): Record<string, unknown> => {
      const details: Record<string, unknown> = {
        mode,
        strategy,
        remainingFiles: Math.max(0, totalFiles - processedFiles),
        elapsedMs: Date.now() - runStartedAt,
        ...extra,
      };
      if (Number.isFinite(aiBudgetRemainingMs)) {
        details.aiBudgetRemainingMs = Math.max(0, Math.floor(aiBudgetRemainingMs));
      }
      return details;
    };

    const getAiTimeoutMs = (defaultTimeoutMs: number): number | null => {
      if (!Number.isFinite(aiBudgetRemainingMs)) {
        return defaultTimeoutMs;
      }
      if (aiBudgetRemainingMs < MIN_AI_CALL_BUDGET_MS) {
        return null;
      }
      return Math.max(MIN_AI_CALL_BUDGET_MS, Math.min(defaultTimeoutMs, aiBudgetRemainingMs));
    };

    const consumeAiBudget = (startedAt: number, context: string) => {
      if (!Number.isFinite(aiBudgetRemainingMs)) return;
      const wasExhausted = aiBudgetExhausted;
      aiBudgetRemainingMs = Math.max(0, aiBudgetRemainingMs - (Date.now() - startedAt));
      if (aiBudgetRemainingMs < MIN_AI_CALL_BUDGET_MS) {
        aiBudgetExhausted = true;
        if (!wasExhausted) {
          warnings.push(`KI-Budget erreicht (${context}); verbleibende Gruppen laufen deterministisch weiter.`);
        }
      }
    };

    const markAiBudgetExhausted = (context: string) => {
      if (!aiBudgetExhausted) {
        aiBudgetExhausted = true;
        warnings.push(`KI-Budget erreicht (${context}); verbleibende Gruppen laufen deterministisch weiter.`);
      }
    };

    onProgress?.({ phase: 'snapshot', message: 'Snapshot wird erstellt...', progress: 5, details: buildProgressDetails(0) });
    const ensureNotCancelled = () => {
      if (shouldCancel?.()) {
        throw new Error('KI Auto-Commit wurde abgebrochen.');
      }
    };
    ensureNotCancelled();

    const initialStatus = await this.gitService.getStatusPorcelain();
    ensureNotCancelled();
    const statusEntries = parseStatusPorcelain(initialStatus);

    if (statusEntries.some((entry) => CONFLICT_CODES.has(entry.code))) {
      throw new Error('Repository hat Konflikte. Bitte zuerst aufloesen.');
    }

    if (statusEntries.length === 0) {
      throw new Error('Working Tree ist sauber. Keine Commits noetig.');
    }

    const snapshotFiles: SnapshotFile[] = statusEntries.map((entry) => {
      const pathValue = entry.path;
      const changeType = detectChangeType(entry);
      return {
        path: pathValue,
        changeType,
        additions: 0,
        deletions: 0,
        isBinary: false,
        preview: '(preview pending)',
        keyChanges: [],
        groupKey: buildGroupKey(pathValue, changeType),
        hydrated: false,
      };
    });

    if (snapshotFiles.length >= LARGE_BATCH_THRESHOLD) {
      strategy = 'large-hybrid';
      aiBudgetRemainingMs = LARGE_HYBRID_AI_BUDGET_MS;
    }

    onProgress?.({
      phase: 'snapshot',
      message: `Vorgruppierung abgeschlossen: ${snapshotFiles.length} Datei(en) erkannt`,
      progress: 14,
      details: buildProgressDetails(snapshotFiles.length, {
        processedFiles,
        remainingFiles: snapshotFiles.length,
      }),
    });

    const snapshotHydrator = new AutoCommitSnapshotHydrator(this.gitService, repoPath, ensureNotCancelled);

    onProgress?.({
      phase: 'grouping',
      message: `Dateien werden gruppiert (${snapshotFiles.length})...`,
      progress: 15,
      details: buildProgressDetails(snapshotFiles.length, {
        groupSize: snapshotFiles.length,
        step: strategy === 'large-hybrid' ? 'planning-groups' : 'grouping',
      }),
    });

    let groups = this.autoCommitPlanner.groupFilesDeterministically(snapshotFiles);
    if (strategy === 'large-hybrid') {
      await snapshotHydrator.hydrateLargeBatchSignals(snapshotFiles);

      onProgress?.({
        phase: 'grouping',
        message: 'KI plant Commit-Gruppen (Hybrid-Modus)...',
        progress: 16,
        details: buildProgressDetails(snapshotFiles.length, { step: 'planning-groups' }),
      });

      let aiPlannedGroups: string[][] = [];
      const planTimeoutMs = getAiTimeoutMs(LARGE_HYBRID_PLAN_TIMEOUT_MS);
      if (planTimeoutMs == null) {
        markAiBudgetExhausted('Gruppenplanung');
      } else {
        try {
          ensureNotCancelled();
          modelTurns += 1;
          const aiCallStartedAt = Date.now();
          aiPlannedGroups = await planGroupsWithAi(this.providerClient, settings, snapshotFiles, getGeminiApiKey, shouldCancel, planTimeoutMs);
          consumeAiBudget(aiCallStartedAt, 'Gruppenplanung');
          ensureNotCancelled();
        } catch (error: unknown) {
          diagnostics.push(error instanceof Error ? error.message : 'KI-Gruppenplanung fehlgeschlagen.');
        }
      }

      if (aiPlannedGroups.length > 0) {
        const byPath = new Map(snapshotFiles.map((file) => [file.path, file]));
        groups = aiPlannedGroups
          .map((groupPaths) => groupPaths.map((pathValue) => byPath.get(pathValue)).filter((file): file is SnapshotFile => Boolean(file)))
          .filter((group) => group.length > 0);
      } else {
        warnings.push('Hybrid-Gruppenplanung ungueltig oder unvollstaendig; deterministische Gruppierung aktiv.');
        onProgress?.({
          phase: 'fallback',
          message: 'Deterministische Gruppenplanung aktiv (Hybrid-Fallback).',
          details: buildProgressDetails(snapshotFiles.length, { step: 'deterministic-fallback' }),
        });
      }
    }

    const groupQueues = groups.map((group) => [...group]);

    for (let groupIndex = 0; groupIndex < groupQueues.length; groupIndex += 1) {
      const queue = groupQueues[groupIndex];
      if (queue.length === 0) continue;

      let groupRetries = 0;
      let stallCycles = 0;

      while (queue.length > 0) {
        ensureNotCancelled();
        if (Date.now() - runStartedAt > RUN_TIMEOUT_MS) {
          warnings.push('Zeitbudget erreicht; verbleibende Dateien werden im Ergebnis ausgewiesen.');
          break;
        }

        const remainingBeforeBatch = snapshotFiles.length - processedFiles;
        if (strategy === 'large-hybrid' && remainingBeforeBatch <= STANDARD_BATCH_THRESHOLD) {
          strategy = 'standard';
          onProgress?.({
            phase: 'grouping',
            message: `Strategiewechsel: Standard-Modus aktiv (${remainingBeforeBatch} Datei(en) verbleibend).`,
            details: buildProgressDetails(snapshotFiles.length, {
              groupId: groupIndex + 1,
              groupSize: queue.length,
              step: 'strategy-switch',
            }),
          });
        }

        const phase: ProgressPhase = mode === 'fallback' ? 'fallback' : mode === 'retry' ? 'retry' : 'committing';
        const windowFiles = this.autoCommitPlanner.pickWindow(queue, mode);

        onProgress?.({
          phase,
          message: `Gruppe ${groupIndex + 1}/${groupQueues.length}: ${windowFiles.length} Datei(en) werden vorbereitet`,
          progress: Math.min(95, 20 + Math.floor((processedFiles / Math.max(1, snapshotFiles.length)) * 70)),
          details: buildProgressDetails(snapshotFiles.length, {
            groupId: groupIndex + 1,
            groupSize: queue.length,
            step: strategy === 'large-hybrid' ? 'hybrid-window' : 'standard-window',
          }),
        });

        if (strategy === 'standard') {
          for (const file of windowFiles) {
            await snapshotHydrator.hydrateSnapshotFile(file);
          }
        }
        ensureNotCancelled();

        let selectedPaths: string[] = [];

        if (mode === 'fallback') {
          selectedPaths = windowFiles.map((file) => file.path).slice(0, MAX_COMMIT_FILES_FALLBACK);
        } else if (strategy === 'large-hybrid' || aiBudgetExhausted) {
          selectedPaths = windowFiles.map((file) => file.path);
          if (aiBudgetExhausted) {
            onProgress?.({
              phase: 'fallback',
              message: 'Deterministische Dateiauswahl aktiv (KI-Budget erreicht).',
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                step: 'deterministic-fallback',
              }),
            });
          }
        } else {
          try {
            onProgress?.({
              phase: 'grouping',
              message: `KI waehlt Dateien fuer Gruppe ${groupIndex + 1}/${groupQueues.length}...`,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                step: 'selecting-files',
              }),
            });
            ensureNotCancelled();
            modelTurns += 1;
            const selectTimeoutMs = getAiTimeoutMs(LARGE_HYBRID_SELECT_TIMEOUT_MS);
            if (selectTimeoutMs == null) {
              markAiBudgetExhausted('Dateiauswahl');
              selectedPaths = windowFiles.map((file) => file.path);
            } else {
              const aiCallStartedAt = Date.now();
              selectedPaths = await chooseFilesWithAi(this.providerClient, settings, windowFiles, getGeminiApiKey, shouldCancel, selectTimeoutMs);
              consumeAiBudget(aiCallStartedAt, 'Dateiauswahl');
            }
            ensureNotCancelled();
          } catch (error: unknown) {
            diagnostics.push(error instanceof Error ? error.message : 'KI-Auswahl fehlgeschlagen.');
            selectedPaths = [];
          }
        }

        if (selectedPaths.length === 0) {
          stallCycles += 1;
          if (stallCycles >= MAX_GROUP_STALL_CYCLES) {
            const message = `Gruppe ${groupIndex + 1} wurde nach ${stallCycles} erfolglosen Auswahl-/Retry-Zyklen uebersprungen.`;
            warnings.push(message);
            onProgress?.({
              phase: 'fallback',
              message,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                stallCycles,
              }),
            });
            break;
          }
          if (groupRetries < MAX_RETRIES_PER_GROUP) {
            groupRetries += 1;
            retries += 1;
            if (mode !== 'retry') {
              mode = 'retry';
              modeTransitions.push('retry');
            }
            onProgress?.({
              phase: 'retry',
              message: `Keine Auswahl erhalten, Retry ${groupRetries}/${MAX_RETRIES_PER_GROUP}`,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                retryCount: groupRetries,
              }),
            });
            continue;
          }

          if (mode !== 'fallback') {
            mode = 'fallback';
            modeTransitions.push('fallback');
          }
          onProgress?.({
            phase: 'fallback',
            message: 'Auto-Fallback aktiv: Mikro-Batches werden verwendet.',
            details: buildProgressDetails(snapshotFiles.length, {
              groupId: groupIndex + 1,
              groupSize: queue.length,
              step: 'deterministic-fallback',
            }),
          });
          continue;
        }

        const selectedSet = new Set(selectedPaths);
        const batchFiles = queue.filter((file) => selectedSet.has(file.path));

        if (batchFiles.length === 0) {
          stallCycles += 1;
          warnings.push(`Gruppe ${groupIndex + 1}: KI-Auswahl enthielt keine gueltigen Pfade.`);
          if (stallCycles >= MAX_GROUP_STALL_CYCLES) {
            const message = `Gruppe ${groupIndex + 1} wurde wegen wiederholt ungueltiger Auswahl uebersprungen.`;
            warnings.push(message);
            onProgress?.({
              phase: 'fallback',
              message,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                stallCycles,
              }),
            });
            break;
          }
          if (groupRetries < MAX_RETRIES_PER_GROUP) {
            groupRetries += 1;
            retries += 1;
            if (mode !== 'retry') {
              mode = 'retry';
              modeTransitions.push('retry');
            }
            continue;
          }
          if (mode !== 'fallback') {
            mode = 'fallback';
            modeTransitions.push('fallback');
          }
          continue;
        }

        try {
          const gitCapabilities: unknown = this.gitService;
          if (hasStagePaths(gitCapabilities)) {
            await gitCapabilities.stagePaths(batchFiles.map((file) => file.path));
            ensureNotCancelled();
          } else {
            for (const file of batchFiles) {
              await this.gitService.runCommand(['add', '--', file.path]);
              ensureNotCancelled();
            }
          }

          let message: CommitMessage;
          if (aiBudgetExhausted) {
            message = buildFallbackCommitMessage(batchFiles);
          } else {
            try {
              onProgress?.({
                phase: 'committing',
                message: `KI erstellt Commit-Message fuer ${batchFiles.length} Datei(en)...`,
                details: buildProgressDetails(snapshotFiles.length, {
                  groupId: groupIndex + 1,
                  groupSize: queue.length,
                  step: 'generating-message',
                }),
              });
              ensureNotCancelled();
              modelTurns += 1;
              const messageTimeoutMs = strategy === 'large-hybrid' ? getAiTimeoutMs(LARGE_HYBRID_MESSAGE_TIMEOUT_MS) : CHAT_TIMEOUT_MS;

              if (messageTimeoutMs == null) {
                markAiBudgetExhausted('Commit-Message');
                message = buildFallbackCommitMessage(batchFiles);
              } else {
                const aiCallStartedAt = Date.now();
                message = await generateCommitMessageWithAi(this.providerClient, settings, batchFiles, getGeminiApiKey, shouldCancel, messageTimeoutMs);
                consumeAiBudget(aiCallStartedAt, 'Commit-Message');
              }
              ensureNotCancelled();
            } catch (error: unknown) {
              diagnostics.push(error instanceof Error ? error.message : 'Commit-Message KI fehlgeschlagen.');
              message = buildFallbackCommitMessage(batchFiles);
            }
          }

          const batchPaths = batchFiles.map((file) => file.path);
          if (hasCommitWithMessageForPaths(gitCapabilities)) {
            await gitCapabilities.commitWithMessageForPaths(
              {
                title: message.title,
                description: message.description,
              },
              batchPaths,
            );
          } else if (hasCommitWithMessageAtPath(gitCapabilities)) {
            const repoPathForCommit = gitCapabilities.getRepoPath();
            if (!repoPathForCommit) {
              throw new Error('Repository path is required.');
            }
            await gitCapabilities.commitWithMessageAtPath(
              repoPathForCommit,
              {
                title: message.title,
                description: message.description,
              },
              batchPaths,
            );
          } else if (hasCommitWithMessage(gitCapabilities) && batchPaths.length === 0) {
            await gitCapabilities.commitWithMessage({
              title: message.title,
              description: message.description,
            });
          } else {
            const commitArgs = ['commit', '-m', message.title];
            if (message.description.trim()) {
              commitArgs.push('-m', message.description.trim());
            }
            commitArgs.push('--', ...batchPaths);
            await this.gitService.runCommand(commitArgs);
          }
          ensureNotCancelled();

          const hash = (await this.gitService.runCommand(['rev-parse', '--short', 'HEAD'])).trim();
          const subject = (await this.gitService.runCommand(['show', '-s', '--format=%s', 'HEAD'])).trim();
          commits.push({ hash, subject });

          const committedPaths = new Set(batchFiles.map((file) => file.path));
          for (let i = queue.length - 1; i >= 0; i -= 1) {
            if (committedPaths.has(queue[i].path)) {
              queue.splice(i, 1);
            }
          }

          processedFiles += batchFiles.length;
          if (mode === 'fallback') {
            fallbackCommits += 1;
          }

          groupRetries = 0;
          stallCycles = 0;
          if (mode !== 'normal') {
            mode = 'normal';
            modeTransitions.push('normal');
          }

          onProgress?.({
            phase: 'committing',
            message: `Commit erstellt: ${subject}`,
            details: buildProgressDetails(snapshotFiles.length, {
              groupId: groupIndex + 1,
              groupSize: queue.length,
              lastCommit: `${hash} ${subject}`,
            }),
          });
        } catch (error: unknown) {
          diagnostics.push(error instanceof Error ? error.message : 'Commit fehlgeschlagen.');
          stallCycles += 1;
          if (stallCycles >= MAX_GROUP_STALL_CYCLES) {
            const message = `Gruppe ${groupIndex + 1} wird nach ${stallCycles} wiederholten Commit-Fehlern uebersprungen.`;
            warnings.push(message);
            onProgress?.({
              phase: 'fallback',
              message,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                stallCycles,
              }),
            });
            break;
          }

          if (groupRetries < MAX_RETRIES_PER_GROUP) {
            groupRetries += 1;
            retries += 1;
            if (mode !== 'retry') {
              mode = 'retry';
              modeTransitions.push('retry');
            }
            continue;
          }

          if (mode !== 'fallback') {
            mode = 'fallback';
            modeTransitions.push('fallback');
          }
          warnings.push(`Gruppe ${groupIndex + 1}: Wechsel auf Fallback nach Commit-Fehler.`);
        }
      }

      if (Date.now() - runStartedAt > RUN_TIMEOUT_MS) {
        break;
      }
    }

    const finalStatus = await this.gitService.getStatusPorcelain();
    const remainingEntries = parseStatusPorcelain(finalStatus);
    const remainingFiles = remainingEntries.length;

    const summary = commits.length === 0 ? 'Keine Commits erstellt.' : `KI Auto-Commit abgeschlossen: ${commits.length} Commit(s) erstellt.`;

    onProgress?.({
      phase: 'done',
      message: summary,
      progress: 100,
      details: buildProgressDetails(snapshotFiles.length, {
        remainingFiles,
        processedFiles,
        lastCommit: commits.length > 0 ? `${commits[commits.length - 1].hash} ${commits[commits.length - 1].subject}` : null,
      }),
    });

    return {
      commits,
      summary,
      turns: modelTurns,
      modeTransitions,
      processedFiles,
      remainingFiles,
      commitPlanStats: {
        groupCount: groups.length,
        retries,
        fallbackCommits,
        totalCommits: commits.length,
        totalFilesProcessed: processedFiles,
      },
      warnings,
      diagnostics,
    };
  }
}
