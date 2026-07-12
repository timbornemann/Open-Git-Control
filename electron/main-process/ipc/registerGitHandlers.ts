import { ipcMain } from 'electron';
import type { CommitStatsService } from '../../CommitStatsService';
import type { GitService } from '../../GitService';
import type { SecretScanService } from '../../SecretScanService';
import type { WorkingTreeService } from '../../WorkingTreeService';
import type { AppSettings } from '../../settings';
import { redactGitSensitiveText } from '../../git/GitErrorFormatter';
import { IpcChannel } from '../../../src/types/ipcContract';
import { createJobId } from '../gitCommandPolicy';
import { normalizeDiffPreviewArgs } from '../diffPreviewPolicy';
import { repoJobRegistry as defaultRepoJobRegistry } from '../repoJobRegistry';
import type { RepoJobRegistry } from '../repoJobRegistry';
import { handleGitCommand } from './gitCommandRouter';
import { registerGitFileHandlers } from './git/registerGitFileHandlers';
import { registerGitHistoryHandlers } from './git/registerGitHistoryHandlers';
import { registerGitOperationStateHandler } from './git/registerGitOperationStateHandler';
import { registerSecretScanPushGuard } from './git/secretScanPushGuard';
import { registerSecretScanCommitGuard } from './git/secretScanCommitGuard';
import { emitJobEvent, sendToWebContents } from './jobEvents';
import { normalizeInteractiveRebaseTodo } from '../../git/RebaseService';
import { repositoryPathKey, requireActiveRepositoryPath } from '../activeRepositoryAuthorization';
import { readStoreData } from '../repoStore';
import { normalizeRepositoryInitializationOptions, scaffoldInitializedRepository } from '../../git/RepositoryScaffolding';

type RegisterGitHandlersDeps = {
  gitService: GitService;
  secretScanService: SecretScanService;
  commitStatsService: CommitStatsService;
  workingTreeService: WorkingTreeService;
  readSettingsWithMigration: () => AppSettings;
  repoJobRegistry?: RepoJobRegistry;
  readStoredRepoPaths?: () => string[];
};

export function registerGitHandlers({
  gitService,
  secretScanService,
  commitStatsService,
  workingTreeService,
  readSettingsWithMigration,
  repoJobRegistry = defaultRepoJobRegistry,
  readStoredRepoPaths = () => readStoreData().repos.map((repo) => repo.path),
}: RegisterGitHandlersDeps): void {
  const secretScanPushGuard = registerSecretScanPushGuard({
    gitService,
    secretScanService,
    readSettingsWithMigration,
    repoJobRegistry,
  });
  const secretScanCommitGuard = registerSecretScanCommitGuard({
    gitService,
    secretScanService,
    readSettingsWithMigration,
    repoJobRegistry,
  });

  registerGitHistoryHandlers({ gitService, commitStatsService, workingTreeService });
  registerGitFileHandlers({ gitService, readStoredRepoPaths });
  registerGitOperationStateHandler({ gitService });

  ipcMain.handle(IpcChannel.GitResolveRepoPath, async (_event: any, repoPath: string) => {
    const requestedRepoPath = String(repoPath || '').trim();
    if (!requestedRepoPath) throw new Error('Repository path is required.');
    return gitService.resolveRepositoryPathAsync(requestedRepoPath);
  });

  ipcMain.handle(IpcChannel.GitSetRepo, async (_event: any, repoPath: string) => {
    const requestedRepoPath = String(repoPath || '').trim();
    if (!requestedRepoPath) throw new Error('Repository path is required.');
    commitStatsService.interruptBackgroundWork();
    workingTreeService.setActiveRepo();
    gitService.setRepoPath(requestedRepoPath);
    const activeRepoPath = gitService.getRepoPath() || requestedRepoPath;
    repoJobRegistry.cancelForRepoChange(activeRepoPath);
    secretScanPushGuard.abortActiveScan();
    secretScanCommitGuard.clearApprovals();
    commitStatsService.setActiveRepo(activeRepoPath);
    return activeRepoPath;
  });

  ipcMain.handle(IpcChannel.GitClearRepo, async () => {
    commitStatsService.interruptBackgroundWork();
    workingTreeService.setActiveRepo();
    repoJobRegistry.cancelForRepoChange(null);
    secretScanPushGuard.abortActiveScan();
    secretScanCommitGuard.clearApprovals();
    gitService.clearRepoPath();
    commitStatsService.setActiveRepo('');
    return true;
  });

  ipcMain.handle(
    IpcChannel.GitCreateCommit,
    async (
      event: any,
      params: {
        repoPath?: unknown;
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
        const repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath());
        const scanBlock = await secretScanCommitGuard.requireCommitSecretScanApproval(event, repoPath);
        if (scanBlock) {
          emitJobEvent(event.sender, {
            id: jobId,
            operation: 'git:commit',
            status: 'failed',
            message: scanBlock.error,
            timestamp: Date.now(),
          });
          return scanBlock;
        }
        const data = await gitService.commits.commitWithMessageAtPath(repoPath, {
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
        const safeError = redactGitSensitiveText(error?.message || 'Commit failed.');
        emitJobEvent(event.sender, {
          id: jobId,
          operation: 'git:commit',
          status: 'failed',
          message: safeError,
          timestamp: Date.now(),
        });
        return { success: false, error: safeError };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitScanCommitSecrets, async (event: any, params: { repoPath?: unknown } = {}) => {
    if (typeof params.repoPath !== 'string' || !params.repoPath.trim()) {
      return { success: false, error: 'Repository path is required.' };
    }
    return secretScanCommitGuard.scanCommitSecrets(event, { repoPath: params.repoPath, recordRendererScan: true });
  });

  ipcMain.handle(IpcChannel.GitApproveSecretScanCommit, async (event: any, requestedRepoPath?: unknown) => {
    if (typeof requestedRepoPath !== 'string' || !requestedRepoPath.trim()) return { success: false };
    return secretScanCommitGuard.approveSecretScanCommit(event, requestedRepoPath);
  });

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

  ipcMain.handle(
    IpcChannel.GitDiffPreview,
    async (_event: any, args: unknown, limits: { maxBytes?: unknown; maxLines?: unknown } = {}, requestedRepoPath?: unknown) => {
      try {
        commitStatsService.interruptBackgroundWork();
        const normalizedArgs = normalizeDiffPreviewArgs(args);
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        const data = await gitService.runner.getDiffPreview(repoPath, normalizedArgs, {
          maxBytes: Number(limits.maxBytes) || undefined,
          maxLines: Number(limits.maxLines) || undefined,
        });
        return { success: true, data };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitCommand, async (event: any, commandName: unknown, ...rawArgs: unknown[]) => {
    let repoPath: string;
    try {
      repoPath = requireActiveRepositoryPath(undefined, gitService.getRepoPath());
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'No repository selected.' };
    }
    if (commandName === 'push') {
      const scanBlock = await secretScanPushGuard.requirePushSecretScanApproval(event, rawArgs, repoPath);
      if (scanBlock) return scanBlock;
      try {
        requireActiveRepositoryPath(repoPath, gitService.getRepoPath());
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Requested repository is not the active repository.' };
      }
    }
    return handleGitCommand(event, gitService, commandName, rawArgs, repoPath);
  });

  ipcMain.handle(IpcChannel.GitCommandForRepo, async (event: any, requestedRepoPath: unknown, commandName: unknown, ...rawArgs: unknown[]) => {
    let repoPath: string;
    try {
      repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Requested repository is not the active repository.' };
    }
    if (commandName === 'push') {
      const scanBlock = await secretScanPushGuard.requirePushSecretScanApproval(event, rawArgs, repoPath);
      if (scanBlock) return scanBlock;
      try {
        requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Requested repository is not the active repository.' };
      }
    }
    return handleGitCommand(event, gitService, commandName, rawArgs, repoPath);
  });

  ipcMain.handle(IpcChannel.GitInteractiveRebase, async (_event: any, baseHash: unknown, todoLines: unknown, requestedRepoPath?: unknown) => {
    try {
      const normalizedBase = String(baseHash || '').trim();
      if (!/^[0-9a-f]{7,64}$/i.test(normalizedBase)) {
        return { success: false, error: 'Invalid base commit hash.' };
      }

      const normalizedTodo = normalizeInteractiveRebaseTodo(todoLines);

      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      const data = await gitService.startInteractiveRebaseAtPath(repoPath, normalizedBase, normalizedTodo);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    IpcChannel.GitApplyPatch,
    async (_event: any, patch: unknown, options: { cached?: unknown; reverse?: unknown } = {}, requestedRepoPath?: unknown) => {
      try {
        const normalizedPatch = String(patch || '');
        if (!normalizedPatch.trim()) {
          return { success: false, error: 'Patch is empty.' };
        }
        if (normalizedPatch.length > 2_000_000) {
          return { success: false, error: 'Patch is too large.' };
        }

        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        const data = await gitService.applyPatchAtPath(repoPath, normalizedPatch, {
          cached: Boolean(options.cached),
          reverse: Boolean(options.reverse),
        });
        return { success: true, data };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitStashBranch, async (event: any, params: { stashName?: unknown; branchName?: unknown; repoPath?: unknown } = {}) => {
    const jobId = createJobId('git-stash-branch');
    emitJobEvent(event.sender, {
      id: jobId,
      operation: 'git:stash-branch',
      status: 'start',
      timestamp: Date.now(),
    });

    try {
      const repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath());
      const data = await gitService.createBranchFromStashAtPath(repoPath, String(params.stashName || ''), String(params.branchName || ''));
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
      const requestedRepoPath = String(repoPath || '').trim();
      if (!requestedRepoPath) throw new Error('Repository path is required.');

      let authorizedRepoPath: string;
      try {
        authorizedRepoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      } catch {
        // Origin lookup is the sole read-only operation needed for inactive
        // repositories in the sidebar. Authorize only exact, main-owned paths
        // from the persisted workspace list; never accept an arbitrary renderer
        // path and never extend this exception to mutations.
        const requestedKey = repositoryPathKey(requestedRepoPath);
        const storedRepoPath = readStoredRepoPaths().find((storedPath) => repositoryPathKey(storedPath) === requestedKey);
        if (!storedRepoPath) throw new Error('Requested repository is not an open repository.');
        authorizedRepoPath = storedRepoPath;
      }

      const url = await gitService.getRepoOriginUrl(authorizedRepoPath);
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

  ipcMain.handle(IpcChannel.GitInit, async (_event: any, repoPath: string, options?: unknown) => {
    try {
      const normalizedPath = String(repoPath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'Repository path is required.' };
      }
      const initializationOptions = options === undefined ? null : normalizeRepositoryInitializationOptions(options);
      const out = await gitService.runCommandAtPath(normalizedPath, ['init']);
      const createdFiles = initializationOptions ? scaffoldInitializedRepository(normalizedPath, initializationOptions) : undefined;
      // Initializing an explicit target is not a repository-selection action.
      // The renderer performs a sequenced GitSetRepo only after this succeeds;
      // switching here could overwrite a newer user-selected repository while
      // `git init` was still running.
      return createdFiles ? { success: true, data: out, createdFiles } : { success: true, data: out };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
