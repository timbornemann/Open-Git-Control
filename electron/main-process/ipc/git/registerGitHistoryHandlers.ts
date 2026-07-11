import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import type { CommitStatsPriority, CommitStatsService } from '../../../CommitStatsService';
import type { GitService } from '../../../GitService';
import type { WorkingTreeService } from '../../../WorkingTreeService';
import { EXPECTED_NON_FATAL_GIT_ERROR_NAME } from '../../../git/GitErrorFormatter';
import { isRepoUnavailableError } from '../../../../src/shared/git/errors';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { parseFileBlame, parseFileHistory, parseStashList } from '../../parsing';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';

type RegisterGitHistoryHandlersDeps = {
  gitService: GitService;
  commitStatsService: CommitStatsService;
  workingTreeService: WorkingTreeService;
};

const isUnbornHeadError = (error: unknown): boolean => {
  if (error instanceof Error && error.name === EXPECTED_NON_FATAL_GIT_ERROR_NAME) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /needed a single revision|does not have any commits yet|unknown revision or path not in the working tree|ambiguous argument ['"]?HEAD['"]?: unknown revision/i.test(
    message,
  );
};

export function registerGitHistoryHandlers({ gitService, commitStatsService, workingTreeService }: RegisterGitHistoryHandlersDeps): void {
  const commitStatsSubscribers = new Set<WebContents>();
  commitStatsService.onUpdate((update) => {
    for (const webContents of commitStatsSubscribers) {
      if (webContents.isDestroyed?.()) {
        commitStatsSubscribers.delete(webContents);
        continue;
      }
      webContents.send(IpcChannel.GitCommitStats, update);
    }
  });

  ipcMain.handle(
    IpcChannel.GitCommitLogPage,
    async (_event: unknown, params: { repoPath?: unknown; limit?: unknown; offset?: unknown; scope?: unknown } = {}) => {
      try {
        const limit = Math.max(1, Math.min(500, Math.floor(Number(params.limit) || 100)));
        const offset = Math.max(0, Math.floor(Number(params.offset) || 0));
        const scope = params.scope === 'head' ? 'head' : 'all';
        const repoPath = requireActiveRepositoryPath(params.repoPath, gitService.getRepoPath());

        try {
          await gitService.runCommandAtPath(repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD']);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          if (isRepoUnavailableError(message)) {
            throw error;
          }
          if (!isUnbornHeadError(error)) {
            throw error;
          }
          return {
            success: true,
            data: {
              raw: '',
              hasMore: false,
              stats: {},
              repoPath,
            },
          };
        }

        const raw = await gitService.history.getLog(limit + 1, scope === 'all', offset, repoPath);
        // eslint-disable-next-line no-control-regex -- Git log records are NUL/unit-separator delimited.
        const hashes = [...raw.matchAll(/(?:^|\x00)([0-9a-f]{7,64})\x1f/gi)].map((match) => match[1]);
        const hasMore = hashes.length > limit;
        const visibleHashes = hashes.slice(0, limit);
        const stats = await commitStatsService.getCachedStats(visibleHashes, repoPath);
        return {
          success: true,
          data: {
            raw,
            hasMore,
            stats,
            repoPath,
          },
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.GitRequestCommitStats,
    async (event: IpcMainInvokeEvent, hashes: unknown, requestedPriority: unknown, requestedRepoPath?: unknown) => {
      try {
        commitStatsSubscribers.add(event.sender);
        const normalizedHashes = Array.isArray(hashes) ? hashes.map((hash) => String(hash || '')).slice(0, 500) : [];
        const priority: CommitStatsPriority =
          requestedPriority === 'selected' || requestedPriority === 'visible' || requestedPriority === 'background' ? requestedPriority : 'background';
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        const data = await commitStatsService.requestStats(normalizedHashes, priority, repoPath);
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitWorkingTreeSnapshot, async (_event: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      return { success: true, data: await workingTreeService.getSnapshot(repoPath) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitWorkingTreeStats, async (_event: unknown, snapshotId: unknown, requestedRepoPath?: unknown) => {
    try {
      const normalizedId = String(snapshotId || '').trim();
      if (!normalizedId) throw new Error('Snapshot ID is required.');
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      return { success: true, data: await workingTreeService.getStats(normalizedId, repoPath) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    IpcChannel.GitFileBlameRange,
    async (
      _event: unknown,
      filePath: unknown,
      commitHash: unknown,
      startLine: unknown,
      lineCount: unknown,
      requestedRepoPath?: unknown,
      requestedSource?: unknown,
    ) => {
      try {
        commitStatsService.interruptBackgroundWork();
        const normalizedPath = String(filePath ?? '');
        if (!normalizedPath) throw new Error('File path is required.');
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        const normalizedCommitHash = String(commitHash || '').trim() || undefined;
        if (requestedSource !== undefined && requestedSource !== 'staged' && requestedSource !== 'unstaged') {
          throw new Error('Invalid blame source.');
        }
        if (requestedSource === 'staged' && normalizedCommitHash) throw new Error('Staged blame cannot target a commit.');
        const raw =
          requestedSource === 'staged'
            ? await gitService.history.getStagedFileBlameRange(normalizedPath, Number(startLine), Number(lineCount), repoPath)
            : await gitService.history.getFileBlameRange(normalizedPath, normalizedCommitHash, Number(startLine), Number(lineCount), repoPath);
        return { success: true, data: parseFileBlame(raw) };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitStashes, async (_event: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      const raw = await gitService.runCommandAtPath(repoPath, ['stash', 'list', '--format=%gd%x1f%H%x1f%gs%x00', '--max-count=200']);
      return { success: true, data: parseStashList(raw) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    IpcChannel.GitFileHistory,
    async (_event: unknown, filePath: string, commitHash?: string, limit: number = 100, requestedRepoPath?: unknown) => {
      try {
        const normalizedPath = String(filePath ?? '');
        if (!normalizedPath) {
          return { success: false, error: 'File path is required' };
        }

        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        const raw = await gitService.history.getFileHistory(normalizedPath, limit, commitHash, repoPath);
        return { success: true, data: parseFileHistory(raw) };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.GitFileBlame,
    async (_event: unknown, filePath: string, commitHash?: string, requestedRepoPath?: unknown, requestedSource?: unknown) => {
      try {
        const normalizedPath = String(filePath ?? '');
        if (!normalizedPath) {
          return { success: false, error: 'File path is required' };
        }

        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
        if (requestedSource !== undefined && requestedSource !== 'staged' && requestedSource !== 'unstaged') {
          throw new Error('Invalid blame source.');
        }
        if (requestedSource === 'staged' && commitHash) throw new Error('Staged blame cannot target a commit.');
        const raw =
          requestedSource === 'staged'
            ? await gitService.history.getStagedFileBlame(normalizedPath, repoPath)
            : await gitService.history.getFileBlame(normalizedPath, commitHash, repoPath);
        return { success: true, data: parseFileBlame(raw) };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitGetFileTimelineData, async (_event: unknown, limit?: number, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      const commits = await gitService.history.getFileTimelineData(limit, repoPath);
      return { success: true, data: commits };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
