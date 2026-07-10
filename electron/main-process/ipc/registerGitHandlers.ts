import { ipcMain } from 'electron';
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
import { registerSecretScanPushGuard } from './git/secretScanPushGuard';
import { emitJobEvent, sendToWebContents } from './jobEvents';
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
  const secretScanPushGuard = registerSecretScanPushGuard({
    gitService,
    secretScanService,
    readSettingsWithMigration,
    repoJobRegistry,
  });

  registerGitHistoryHandlers({ gitService, commitStatsService, workingTreeService });
  registerGitFileHandlers({ gitService });

  ipcMain.handle(IpcChannel.GitSetRepo, async (_event: any, repoPath: string) => {
    commitStatsService.interruptBackgroundWork();
    gitService.setRepoPath(repoPath);
    const activeRepoPath = gitService.getRepoPath() || repoPath;
    repoJobRegistry.cancelForRepoChange(activeRepoPath);
    secretScanPushGuard.abortActiveScan();
    commitStatsService.setActiveRepo(activeRepoPath);
    return true;
  });

  ipcMain.handle(IpcChannel.GitClearRepo, async () => {
    commitStatsService.interruptBackgroundWork();
    repoJobRegistry.cancelForRepoChange(null);
    secretScanPushGuard.abortActiveScan();
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

  ipcMain.handle(IpcChannel.GitStagePaths, async (event: any, paths: unknown, requestedRepoPath?: unknown) => {
    const jobId = createJobId('git-stage-paths');
    emitJobEvent(event.sender, {
      id: jobId,
      operation: 'git:add',
      status: 'start',
      timestamp: Date.now(),
    });
    try {
      const normalizedPaths = Array.isArray(paths) ? paths.map((filePath) => String(filePath || '')).slice(0, 100_000) : [];
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      commitStatsService.interruptBackgroundWork();
      const data = await gitService.commits.stagePathsAtPath(repoPath, normalizedPaths);
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

  ipcMain.handle(IpcChannel.GitCommand, async (event: any, commandName: unknown, ...rawArgs: unknown[]) => {
    if (commandName === 'push') {
      const scanBlock = await secretScanPushGuard.requirePushSecretScanApproval(event, rawArgs);
      if (scanBlock) return scanBlock;
    }
    return handleGitCommand(event, gitService, commandName, ...rawArgs);
  });

  ipcMain.handle(IpcChannel.GitCommandForRepo, async (event: any, requestedRepoPath: unknown, commandName: unknown, ...rawArgs: unknown[]) => {
    try {
      requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Requested repository is not the active repository.' };
    }
    if (commandName === 'push') {
      const scanBlock = await secretScanPushGuard.requirePushSecretScanApproval(event, rawArgs);
      if (scanBlock) return scanBlock;
      try {
        requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Requested repository is not the active repository.' };
      }
    }
    return handleGitCommand(event, gitService, commandName, ...rawArgs);
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
        // The window can be closed or reloaded mid-clone; use a guarded send so
        // a progress event after teardown does not crash the main process.
        sendToWebContents(webContents, IpcChannel.CloneProgress, line);
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
