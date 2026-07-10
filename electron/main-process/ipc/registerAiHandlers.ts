import { ipcMain } from 'electron';
import type { AiService, ReleaseCommitInput } from '../../AiService';
import type { AppSettings } from '../../settings';
import { createJobId } from '../gitCommandPolicy';
import { RepoJobCancelledError, repoJobRegistry as defaultRepoJobRegistry } from '../repoJobRegistry';
import type { RepoJobRegistry } from '../repoJobRegistry';
import type { JobEventPayload } from './jobEvents';
import { emitJobEvent } from './jobEvents';
import { IpcChannel } from '../../../src/types/ipcContract';
import { requireActiveRepositoryPath } from '../activeRepositoryAuthorization';

type RegisterAiHandlersDeps = {
  aiService: AiService;
  readSettingsWithMigration: () => AppSettings;
  getGeminiApiKeyFromSecureStore: () => string;
  getOpenAiApiKeyFromSecureStore: () => string;
  getActiveRepoPath: () => string | null;
  repoJobRegistry?: RepoJobRegistry;
};

export function registerAiHandlers({
  aiService,
  readSettingsWithMigration,
  getGeminiApiKeyFromSecureStore,
  getOpenAiApiKeyFromSecureStore,
  getActiveRepoPath,
  repoJobRegistry = defaultRepoJobRegistry,
}: RegisterAiHandlersDeps): void {
  let currentAiAutoCommitJob: { id: string; repoPath: string; generation: number; cancelRequested: boolean } | null = null;
  let latestAiAutoCommitEvent: JobEventPayload | null = null;

  const emitAiAutoCommitEvent = (webContents: Electron.WebContents, payload: JobEventPayload): void => {
    latestAiAutoCommitEvent = payload;
    emitJobEvent(webContents, payload);
  };

  ipcMain.handle(IpcChannel.AiTestConnection, async () => {
    try {
      const settings = readSettingsWithMigration();
      const result = await aiService.testConnection(settings, getGeminiApiKeyFromSecureStore, getOpenAiApiKeyFromSecureStore);
      return { success: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'KI-Verbindung fehlgeschlagen.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IpcChannel.AiListModels, async () => {
    try {
      const settings = readSettingsWithMigration();
      const models = await aiService.listModels(settings, getGeminiApiKeyFromSecureStore, getOpenAiApiKeyFromSecureStore);
      return { success: true, data: models };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'KI-Modelle konnten nicht geladen werden.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IpcChannel.AiGenerateCommitMessage, async (_event, params: { notes?: string }) => {
    try {
      const notes = String(params?.notes || '').trim();
      if (!notes) {
        return { success: false, error: 'Bitte beschreibe die Aenderungen fuer die Commit-Message.' };
      }

      const settings = readSettingsWithMigration();
      const message = await aiService.generateCommitMessageFromUserNotes(settings, getGeminiApiKeyFromSecureStore, { notes }, getOpenAiApiKeyFromSecureStore);

      return { success: true, data: message };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'KI Commit-Message konnte nicht erstellt werden.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IpcChannel.GitAiAutoCommit, async (event: any, params: { repoPath?: unknown } = {}) => {
    const webContents = event.sender;
    let repoPath: string;
    try {
      repoPath = requireActiveRepositoryPath(params?.repoPath, getActiveRepoPath());
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'No repository selected.' };
    }

    if (currentAiAutoCommitJob) {
      const message = 'KI Auto-Commit laeuft bereits. Bitte den laufenden Job erst abschliessen oder abbrechen.';
      // Do NOT emit through emitAiAutoCommitEvent here: that would overwrite the
      // tracked latest event of the STILL-RUNNING job with a 'failed' status
      // (its id), making the running job disappear from the UI. Only the caller
      // of this duplicate start needs to learn it was rejected, via the return.
      return { success: false, error: message };
    }

    const jobId = createJobId('git-aiAutoCommit');
    const repoJob = repoJobRegistry.begin(repoPath);
    currentAiAutoCommitJob = { id: jobId, repoPath: repoJob.repoPath, generation: repoJob.generation, cancelRequested: false };

    emitAiAutoCommitEvent(webContents, {
      id: jobId,
      operation: IpcChannel.GitAiAutoCommit,
      status: 'start',
      message: 'KI Auto-Commit gestartet.',
      details: { phase: 'snapshot', mode: 'normal', repoPath: repoJob.repoPath, generation: repoJob.generation },
      timestamp: Date.now(),
    });

    try {
      const settings = readSettingsWithMigration();
      const result = await aiService.runAutoCommit(
        repoJob.repoPath,
        settings,
        getGeminiApiKeyFromSecureStore,
        (update) => {
          repoJob.ensureActive();
          emitAiAutoCommitEvent(webContents, {
            id: jobId,
            operation: IpcChannel.GitAiAutoCommit,
            status: 'progress',
            message: update.message,
            ...(typeof update.progress === 'number' ? { progress: update.progress } : {}),
            details: update.details
              ? { ...update.details, phase: update.phase, repoPath: repoJob.repoPath, generation: repoJob.generation }
              : { phase: update.phase, repoPath: repoJob.repoPath, generation: repoJob.generation },
            timestamp: Date.now(),
          });
        },
        () => repoJob.signal.aborted || (currentAiAutoCommitJob?.id === jobId && currentAiAutoCommitJob.cancelRequested),
        getOpenAiApiKeyFromSecureStore,
      );
      repoJob.ensureActive();

      emitAiAutoCommitEvent(webContents, {
        id: jobId,
        operation: IpcChannel.GitAiAutoCommit,
        status: 'done',
        message: result.summary || 'KI Auto-Commit abgeschlossen.',
        details: {
          phase: 'done',
          mode: result.modeTransitions[result.modeTransitions.length - 1] || 'normal',
          repoPath: repoJob.repoPath,
          generation: repoJob.generation,
          processedFiles: result.processedFiles,
          remainingFiles: result.remainingFiles,
          totalCommits: result.commitPlanStats.totalCommits,
        },
        timestamp: Date.now(),
      });

      return { success: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'KI Auto-Commit fehlgeschlagen.';
      const cancelRequested = currentAiAutoCommitJob?.id === jobId && currentAiAutoCommitJob.cancelRequested;
      const wasRepoSwitchCancel = error instanceof RepoJobCancelledError || (repoJob.signal.aborted && !cancelRequested);
      const wasUserCancel = cancelRequested || (!wasRepoSwitchCancel && /abgebrochen|cancelled/i.test(message));
      const wasCancelled = wasRepoSwitchCancel || wasUserCancel;
      const cancelMessage = wasRepoSwitchCancel ? 'KI Auto-Commit wurde wegen Repository-Wechsel abgebrochen.' : 'KI Auto-Commit wurde abgebrochen.';

      emitAiAutoCommitEvent(webContents, {
        id: jobId,
        operation: IpcChannel.GitAiAutoCommit,
        status: wasCancelled ? 'cancelled' : 'failed',
        message: wasCancelled ? cancelMessage : message,
        details: { phase: wasCancelled ? 'cancelled' : 'failed', mode: 'normal', repoPath: repoJob.repoPath, generation: repoJob.generation },
        timestamp: Date.now(),
      });

      return { success: false, error: wasCancelled ? cancelMessage : message };
    } finally {
      repoJob.complete();
      if (currentAiAutoCommitJob?.id === jobId) {
        currentAiAutoCommitJob = null;
      }
    }
  });

  ipcMain.handle(IpcChannel.GitCancelAiAutoCommit, async (event: any) => {
    if (!currentAiAutoCommitJob) {
      return { success: true, canceled: false };
    }
    currentAiAutoCommitJob.cancelRequested = true;
    const previousDetails =
      latestAiAutoCommitEvent?.id === currentAiAutoCommitJob.id && latestAiAutoCommitEvent.details && typeof latestAiAutoCommitEvent.details === 'object'
        ? latestAiAutoCommitEvent.details
        : {};

    const phase = typeof previousDetails.phase === 'string' ? previousDetails.phase : 'snapshot';
    const mode = typeof previousDetails.mode === 'string' ? previousDetails.mode : 'normal';

    emitAiAutoCommitEvent(event.sender, {
      id: currentAiAutoCommitJob.id,
      operation: IpcChannel.GitAiAutoCommit,
      status: 'progress',
      message: 'Abbruch angefordert...',
      details: {
        ...previousDetails,
        phase,
        mode,
        repoPath: currentAiAutoCommitJob.repoPath,
        generation: currentAiAutoCommitJob.generation,
        cancelRequested: true,
      },
      timestamp: Date.now(),
    });
    return { success: true, canceled: true };
  });

  ipcMain.handle(IpcChannel.GitGetAiAutoCommitState, async () => {
    if (
      !currentAiAutoCommitJob ||
      latestAiAutoCommitEvent?.id !== currentAiAutoCommitJob.id ||
      latestAiAutoCommitEvent.status === 'done' ||
      latestAiAutoCommitEvent.status === 'failed' ||
      latestAiAutoCommitEvent.status === 'cancelled'
    ) {
      return { success: true, data: null };
    }
    return { success: true, data: latestAiAutoCommitEvent };
  });

  ipcMain.handle(
    IpcChannel.AiGenerateReleaseNotes,
    async (
      _event,
      params: {
        tagName: string;
        releaseName: string;
        lastReleaseTag?: string | null;
        commits: ReleaseCommitInput[];
        repositoryHtmlUrl?: string | null;
        language: 'de' | 'en';
        versionBump?: 'major' | 'minor' | 'patch';
        hints?: string[];
      },
    ) => {
      try {
        const tagName = String(params?.tagName || '').trim();
        const releaseName = String(params?.releaseName || '').trim();
        const language = params?.language === 'en' ? 'en' : 'de';
        const versionBump = params?.versionBump === 'major' || params?.versionBump === 'minor' ? params.versionBump : 'patch';
        const commits = Array.isArray(params?.commits) ? params.commits.slice(0, 400) : [];
        const hints = Array.isArray(params?.hints)
          ? params.hints.filter((hint): hint is string => typeof hint === 'string' && hint.trim().length > 0).slice(0, 12)
          : [];

        if (!tagName) {
          return { success: false, error: 'Tag-Name ist erforderlich.' };
        }
        if (!releaseName) {
          return { success: false, error: 'Release-Name ist erforderlich.' };
        }

        const settings = readSettingsWithMigration();
        const markdown = await aiService.generateReleaseNotes(
          settings,
          getGeminiApiKeyFromSecureStore,
          {
            tagName,
            releaseName,
            lastReleaseTag: params?.lastReleaseTag || null,
            commits,
            repositoryHtmlUrl: typeof params?.repositoryHtmlUrl === 'string' ? params.repositoryHtmlUrl : null,
            language,
            versionBump,
            hints,
          },
          getOpenAiApiKeyFromSecureStore,
        );

        return { success: true, data: { markdown } };
      } catch (error: any) {
        return { success: false, error: error?.message || 'KI Release Notes konnten nicht erstellt werden.' };
      }
    },
  );
}
