import { dialog, ipcMain } from 'electron';
import type { CommitStatsService } from '../../CommitStatsService';
import type { GitService } from '../../GitService';
import type { SecretScanService } from '../../SecretScanService';
import type { WorkingTreeService } from '../../WorkingTreeService';
import type { AppSettings } from '../../settings';
import { IpcChannel } from '../../../src/types/ipcContract';
import { createJobId } from '../gitCommandPolicy';
import { normalizeDiffPreviewArgs } from '../diffPreviewPolicy';
import { repoJobRegistry as defaultRepoJobRegistry } from '../repoJobRegistry';
import type { RepoJobRegistry } from '../repoJobRegistry';
import { handleGitCommand } from './gitCommandRouter';
import { registerGitFileHandlers } from './git/registerGitFileHandlers';
import { registerGitHistoryHandlers } from './git/registerGitHistoryHandlers';
import { emitJobEvent } from './jobEvents';
import { normalizeInteractiveRebaseTodo } from '../../git/RebaseService';
import { requireActiveRepositoryPath } from '../activeRepositoryAuthorization';

type RegisterGitHandlersDeps = {
  gitService: GitService;
  secretScanService: SecretScanService;
  commitStatsService: CommitStatsService;
  workingTreeService: WorkingTreeService;
  readSettingsWithMigration: () => AppSettings;
  repoJobRegistry?: RepoJobRegistry;
};

export function registerGitHandlers({
  gitService,
  secretScanService,
  commitStatsService,
  workingTreeService,
  readSettingsWithMigration,
  repoJobRegistry = defaultRepoJobRegistry,
}: RegisterGitHandlersDeps): void {
  let activeSecretScanController: AbortController | null = null;

  registerGitHistoryHandlers({ gitService, commitStatsService, workingTreeService });
  registerGitFileHandlers({ gitService });

  ipcMain.handle(IpcChannel.GitSetRepo, async (_event: any, repoPath: string) => {
    commitStatsService.interruptBackgroundWork();
    gitService.setRepoPath(repoPath);
    const activeRepoPath = gitService.getRepoPath() || repoPath;
    repoJobRegistry.cancelForRepoChange(activeRepoPath);
    activeSecretScanController?.abort();
    commitStatsService.setActiveRepo(activeRepoPath);
    return true;
  });

  ipcMain.handle(IpcChannel.GitClearRepo, async () => {
    commitStatsService.interruptBackgroundWork();
    repoJobRegistry.cancelForRepoChange(null);
    activeSecretScanController?.abort();
    gitService.clearRepoPath();
    commitStatsService.setActiveRepo('');
    return true;
  });

  ipcMain.handle(
    IpcChannel.GitCreateCommit,
    async (
      event: any,
      params: {
        title?: unknown;
        description?: unknown;
        amend?: unknown;
        signoff?: unknown;
        allowEmpty?: unknown;
      } = {},
    ) => {
      const jobId = createJobId('git-commit');
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:commit',
        status: 'start',
        timestamp: Date.now(),
      });

      try {
        const data = await gitService.commits.commitWithMessageAtPath(gitService.requireActiveRepoPath(), {
          title: String(params.title || ''),
          description: String(params.description || ''),
          amend: params.amend === true,
          signoff: params.signoff === true,
          allowEmpty: params.allowEmpty === true,
        });
        emitJobEvent(event.sender, {
          id: jobId,
          operation: 'git:commit',
          status: 'done',
          timestamp: Date.now(),
        });
        return { success: true, data };
      } catch (error: any) {
        emitJobEvent(event.sender, {
          id: jobId,
          operation: 'git:commit',
          status: 'failed',
          message: error.message,
          timestamp: Date.now(),
        });
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitStagePaths, async (event: any, paths: unknown) => {
    const jobId = createJobId('git-stage-paths');
    emitJobEvent(event.sender, {
      id: jobId,
      operation: 'git:add',
      status: 'start',
      timestamp: Date.now(),
    });
    try {
      commitStatsService.interruptBackgroundWork();
      const normalizedPaths = Array.isArray(paths) ? paths.map((filePath) => String(filePath || '')).slice(0, 100_000) : [];
      const data = await gitService.commits.stagePathsAtPath(gitService.requireActiveRepoPath(), normalizedPaths);
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:add',
        status: 'done',
        details: { pathCount: normalizedPaths.length },
        timestamp: Date.now(),
      });
      return { success: true, data };
    } catch (error: any) {
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:add',
        status: 'failed',
        message: error.message,
        timestamp: Date.now(),
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitDiffPreview, async (_event: any, args: unknown, limits: { maxBytes?: unknown; maxLines?: unknown } = {}) => {
    try {
      commitStatsService.interruptBackgroundWork();
      const normalizedArgs = normalizeDiffPreviewArgs(args);
      const data = await gitService.runner.getDiffPreview(gitService.requireActiveRepoPath(), normalizedArgs, {
        maxBytes: Number(limits.maxBytes) || undefined,
        maxLines: Number(limits.maxLines) || undefined,
      });
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  const scanPushSecrets = async (event: any, params: { includeTags?: unknown; repoPath?: unknown; revisions?: unknown; excludeRemote?: unknown } = {}) => {
    activeSecretScanController?.abort();
    let repoPath: string;
    try {
      repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath());
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Repository path is required.' };
    }
    const repoJob = repoJobRegistry.begin(repoPath);
    const controller = new AbortController();
    repoJob.signal.addEventListener('abort', () => controller.abort(), { once: true });
    activeSecretScanController = controller;
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
        repoPath: repoJob.repoPath,
        strictness: settings.secretScanStrictness,
        allowlistText: settings.secretScanAllowlist,
        includeTags: params?.includeTags === true,
        revisions: Array.isArray(params.revisions) ? params.revisions.map((revision) => String(revision || '')).slice(0, 8) : undefined,
        excludeRemote: typeof params.excludeRemote === 'string' ? params.excludeRemote : undefined,
        signal: controller.signal,
        onProgress: (checkedLines) => {
          emitJobEvent(event.sender, {
            id: jobId,
            operation,
            status: 'progress',
            message: `Secret scan checked ${checkedLines} added line(s).`,
            details: { checkedLines },
            timestamp: Date.now(),
          });
        },
      });
      repoJob.ensureActive();

      const findingCount = result.findings.length;
      const filesWithFindings = new Set(result.findings.map((item) => item.filePath)).size;
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: 'done',
        message: findingCount > 0 ? `Secret scan found ${findingCount} hit(s) in ${filesWithFindings} file(s).` : 'Secret scan finished with no hits.',
        details: {
          strictness: result.strictness,
          findingCount,
          filesWithFindings,
          checkedLines: result.stats.checkedLines,
          stagedLines: result.stats.stagedLines,
          toPushLines: result.stats.toPushLines,
          tagLines: result.stats.tagLines,
          notes: result.notes,
        },
        timestamp: Date.now(),
      });

      return { success: true, data: result };
    } catch (error: any) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError';
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: cancelled ? 'cancelled' : 'failed',
        message: cancelled ? 'Secret scan cancelled.' : error?.message || 'Secret scan failed.',
        timestamp: Date.now(),
      });
      return { success: false, error: cancelled ? 'Secret scan cancelled.' : error?.message || 'Secret scan failed.' };
    } finally {
      repoJob.complete();
      if (activeSecretScanController === controller) activeSecretScanController = null;
    }
  };

  const requirePushSecretScanApproval = async (event: any, rawArgs: unknown[]) => {
    const settings = readSettingsWithMigration();
    if (!settings?.secretScanBeforePushEnabled) return null;

    const positionalArgs = rawArgs.filter((arg): arg is string => typeof arg === 'string' && !arg.startsWith('-'));
    const destinationRemote = positionalArgs[0] || '';
    const refspec = positionalArgs.length >= 2 ? positionalArgs[1] : '';
    const sourceRevision = refspec && !refspec.startsWith(':') ? (refspec.split(':', 1)[0] || 'HEAD').replace(/^\+/, '') : destinationRemote ? 'HEAD' : '';
    const scanResult = await scanPushSecrets(event, {
      includeTags: rawArgs.some((arg) => arg === '--tags'),
      repoPath: gitService.getRepoPath(),
      revisions: sourceRevision ? [sourceRevision] : undefined,
      excludeRemote: destinationRemote || undefined,
    });
    if (!scanResult.success || !scanResult.data) return scanResult;
    if (scanResult.data.findings.length === 0) return null;

    const findings = scanResult.data.findings;
    const fileCount = new Set(findings.map((finding) => finding.filePath)).size;
    const preview = findings
      .slice(0, 8)
      .map((finding) => `${finding.filePath}:${finding.lineNumber}`)
      .join('\n');
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: 'Potential secrets detected before push',
      message: `${findings.length} potential secret hit(s) were found in ${fileCount} file(s).`,
      detail: `${preview}${findings.length > 8 ? '\n...' : ''}\n\nReview the changes before publishing.`,
      buttons: ['Cancel', 'Push anyway'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response === 1) return null;
    return { success: false, error: 'Push cancelled after secret scan findings.' };
  };

  ipcMain.handle(IpcChannel.GitCommand, async (event: any, commandName: unknown, ...rawArgs: unknown[]) => {
    if (commandName === 'push') {
      const scanBlock = await requirePushSecretScanApproval(event, rawArgs);
      if (scanBlock) return scanBlock;
    }
    return handleGitCommand(event, gitService, commandName, ...rawArgs);
  });

  ipcMain.handle(IpcChannel.GitScanPushSecrets, async (event: any, params: { includeTags?: unknown; repoPath?: unknown } = {}) =>
    scanPushSecrets(event, { includeTags: params.includeTags, repoPath: params.repoPath }),
  );

  ipcMain.handle(IpcChannel.GitCancelSecretScan, async () => {
    const cancelled = Boolean(activeSecretScanController);
    activeSecretScanController?.abort();
    return { success: true, cancelled };
  });

  ipcMain.handle(IpcChannel.GitInteractiveRebase, async (_event: any, baseHash: unknown, todoLines: unknown) => {
    try {
      const normalizedBase = String(baseHash || '').trim();
      if (!/^[0-9a-f]{7,64}$/i.test(normalizedBase)) {
        return { success: false, error: 'Invalid base commit hash.' };
      }

      const normalizedTodo = normalizeInteractiveRebaseTodo(todoLines);

      const data = await gitService.startInteractiveRebase(normalizedBase, normalizedTodo);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitApplyPatch, async (_event: any, patch: unknown, options: { cached?: unknown; reverse?: unknown } = {}) => {
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

  ipcMain.handle(IpcChannel.GitStashBranch, async (event: any, params: { stashName?: unknown; branchName?: unknown } = {}) => {
    const jobId = createJobId('git-stash-branch');
    emitJobEvent(event.sender, {
      id: jobId,
      operation: 'git:stash-branch',
      status: 'start',
      timestamp: Date.now(),
    });

    try {
      const data = await gitService.createBranchFromStash(String(params.stashName || ''), String(params.branchName || ''));
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:stash-branch',
        status: 'done',
        timestamp: Date.now(),
      });
      return { success: true, data };
    } catch (error: any) {
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:stash-branch',
        status: 'failed',
        message: error.message,
        timestamp: Date.now(),
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitRepoOriginUrl, async (_event: any, repoPath: string) => {
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

  ipcMain.handle(IpcChannel.GitClone, async (event, cloneUrl: string, targetDir: string, targetName?: string) => {
    const webContents = event.sender;
    const jobId = createJobId('git-clone');

    emitJobEvent(webContents, {
      id: jobId,
      operation: IpcChannel.GitClone,
      status: 'start',
      timestamp: Date.now(),
    });

    const result = await gitService.clone.cloneRepo(
      cloneUrl,
      targetDir,
      (line: string) => {
        webContents.send(IpcChannel.CloneProgress, line);
        emitJobEvent(webContents, {
          id: jobId,
          operation: IpcChannel.GitClone,
          status: 'progress',
          message: line,
          timestamp: Date.now(),
        });
      },
      targetName,
    );

    emitJobEvent(webContents, {
      id: jobId,
      operation: IpcChannel.GitClone,
      status: result.success ? 'done' : 'failed',
      message: result.error,
      timestamp: Date.now(),
    });

    return result;
  });

  ipcMain.handle(IpcChannel.GitInit, async (_event: any, repoPath: string) => {
    try {
      const normalizedPath = String(repoPath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'Repository path is required.' };
      }
      const out = await gitService.runCommandAtPath(normalizedPath, ['init']);
      gitService.setRepoPath(normalizedPath);
      const activeRepoPath = gitService.getRepoPath() || normalizedPath;
      repoJobRegistry.cancelForRepoChange(activeRepoPath);
      commitStatsService.setActiveRepo(activeRepoPath);
      return { success: true, data: out };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
