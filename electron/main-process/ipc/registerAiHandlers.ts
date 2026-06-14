import { ipcMain } from 'electron';
import { AiService, ReleaseCommitInput } from '../../AiService';
import { AppSettings } from '../../settings';
import { createJobId } from '../gitCommandPolicy';
import { emitJobEvent, JobEventPayload } from './jobEvents';

type RegisterAiHandlersDeps = {
  aiService: AiService;
  readSettingsWithMigration: () => AppSettings;
  getGeminiApiKeyFromSecureStore: () => string;
};

export function registerAiHandlers({
  aiService,
  readSettingsWithMigration,
  getGeminiApiKeyFromSecureStore,
}: RegisterAiHandlersDeps): void {
  let currentAiAutoCommitJob: { id: string; cancelRequested: boolean } | null = null;
  let latestAiAutoCommitEvent: JobEventPayload | null = null;

  const emitAiAutoCommitEvent = (webContents: Electron.WebContents, payload: JobEventPayload): void => {
    latestAiAutoCommitEvent = payload;
    emitJobEvent(webContents, payload);
  };

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
    if (currentAiAutoCommitJob) {
      const message = 'KI Auto-Commit laeuft bereits. Bitte den laufenden Job erst abschliessen oder abbrechen.';
      emitAiAutoCommitEvent(webContents, {
        id: currentAiAutoCommitJob.id,
        operation: 'git:aiAutoCommit',
        status: 'failed',
        message,
        details: { phase: 'failed', mode: 'normal' },
        timestamp: Date.now(),
      });
      return { success: false, error: message };
    }

    const jobId = createJobId('git-aiAutoCommit');
    currentAiAutoCommitJob = { id: jobId, cancelRequested: false };

    emitAiAutoCommitEvent(webContents, {
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
          emitAiAutoCommitEvent(webContents, {
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

      emitAiAutoCommitEvent(webContents, {
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

      emitAiAutoCommitEvent(webContents, {
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

  ipcMain.handle('git:cancelAiAutoCommit', async (event: any) => {
    if (!currentAiAutoCommitJob) {
      return { success: true, canceled: false };
    }
    currentAiAutoCommitJob.cancelRequested = true;
    const previousDetails = (
      latestAiAutoCommitEvent?.id === currentAiAutoCommitJob.id
      && latestAiAutoCommitEvent.details
      && typeof latestAiAutoCommitEvent.details === 'object'
    )
      ? latestAiAutoCommitEvent.details
      : {};

    const phase = typeof previousDetails.phase === 'string' ? previousDetails.phase : 'snapshot';
    const mode = typeof previousDetails.mode === 'string' ? previousDetails.mode : 'normal';

    emitAiAutoCommitEvent(event.sender, {
      id: currentAiAutoCommitJob.id,
      operation: 'git:aiAutoCommit',
      status: 'progress',
      message: 'Abbruch angefordert...',
      details: { ...previousDetails, phase, mode, cancelRequested: true },
      timestamp: Date.now(),
    });
    return { success: true, canceled: true };
  });

  ipcMain.handle('git:getAiAutoCommitState', async () => {
    return { success: true, data: latestAiAutoCommitEvent };
  });

  ipcMain.handle('ai:generateReleaseNotes', async (_event, params: {
    tagName: string;
    releaseName: string;
    lastReleaseTag?: string | null;
    commits: ReleaseCommitInput[];
    language: 'de' | 'en';
    versionBump?: 'major' | 'minor' | 'patch';
    hints?: string[];
  }) => {
    try {
      const tagName = String(params?.tagName || '').trim();
      const releaseName = String(params?.releaseName || '').trim();
      const language = params?.language === 'en' ? 'en' : 'de';
      const versionBump = params?.versionBump === 'major' || params?.versionBump === 'minor'
        ? params.versionBump
        : 'patch';
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
      const markdown = await aiService.generateReleaseNotes(settings, getGeminiApiKeyFromSecureStore, {
        tagName,
        releaseName,
        lastReleaseTag: params?.lastReleaseTag || null,
        commits,
        language,
        versionBump,
        hints,
      });

      return { success: true, data: { markdown } };
    } catch (error: any) {
      return { success: false, error: error?.message || 'KI Release Notes konnten nicht erstellt werden.' };
    }
  });
}
