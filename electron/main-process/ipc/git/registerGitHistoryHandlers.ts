import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import type { CommitStatsPriority, CommitStatsService } from '../../../CommitStatsService';
import type { GitService } from '../../../GitService';
import type { WorkingTreeService } from '../../../WorkingTreeService';
import { isRepoUnavailableError } from '../../../../src/shared/git/errors';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { parseFileBlame, parseFileHistory, parseStashList } from '../../parsing';

type RegisterGitHistoryHandlersDeps = {
  gitService: GitService;
  commitStatsService: CommitStatsService;
  workingTreeService: WorkingTreeService;
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

  ipcMain.handle(IpcChannel.GitCommitLogPage, async (_event: unknown, params: { limit?: unknown; offset?: unknown; scope?: unknown } = {}) => {
    try {
      const limit = Math.max(1, Math.min(500, Math.floor(Number(params.limit) || 100)));
      const offset = Math.max(0, Math.floor(Number(params.offset) || 0));
      const scope = params.scope === 'head' ? 'head' : 'all';
      const repoPath = gitService.getRepoPath();
      if (!repoPath) throw new Error('No repository path set.');

      try {
        await gitService.runCommand(['rev-parse', '--verify', 'HEAD']);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (isRepoUnavailableError(message)) {
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

      const raw = await gitService.history.getLog(limit + 1, scope === 'all', offset);
      // eslint-disable-next-line no-control-regex -- Git log records are NUL/unit-separator delimited.
      const hashes = [...raw.matchAll(/(?:^|\x00)([0-9a-f]{7,64})\x1f/gi)].map((match) => match[1]);
      const hasMore = hashes.length > limit;
      const visibleHashes = hashes.slice(0, limit);
      const stats = await commitStatsService.getCachedStats(visibleHashes);
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
  });

  ipcMain.handle(IpcChannel.GitRequestCommitStats, async (event: IpcMainInvokeEvent, hashes: unknown, requestedPriority: unknown) => {
    try {
      commitStatsSubscribers.add(event.sender);
      const normalizedHashes = Array.isArray(hashes) ? hashes.map((hash) => String(hash || '')).slice(0, 500) : [];
      const priority: CommitStatsPriority =
        requestedPriority === 'selected' || requestedPriority === 'visible' || requestedPriority === 'background' ? requestedPriority : 'background';
      const data = await commitStatsService.requestStats(normalizedHashes, priority);
      return { success: true, data };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitWorkingTreeSnapshot, async () => {
    try {
      return { success: true, data: await workingTreeService.getSnapshot() };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitWorkingTreeStats, async (_event: unknown, snapshotId: unknown) => {
    try {
      const normalizedId = String(snapshotId || '').trim();
      if (!normalizedId) throw new Error('Snapshot ID is required.');
      return { success: true, data: await workingTreeService.getStats(normalizedId) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitFileBlameRange, async (_event: unknown, filePath: unknown, commitHash: unknown, startLine: unknown, lineCount: unknown) => {
    try {
      commitStatsService.interruptBackgroundWork();
      const normalizedPath = String(filePath || '').trim();
      if (!normalizedPath) throw new Error('File path is required.');
      const raw = await gitService.history.getFileBlameRange(
        normalizedPath,
        String(commitHash || '').trim() || undefined,
        Number(startLine),
        Number(lineCount),
      );
      return { success: true, data: parseFileBlame(raw) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitStashes, async () => {
    try {
      const raw = await gitService.getStashes(200);
      return { success: true, data: parseStashList(raw) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitFileHistory, async (_event: unknown, filePath: string, commitHash?: string, limit: number = 100) => {
    try {
      const normalizedPath = (filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const raw = await gitService.history.getFileHistory(normalizedPath, limit, commitHash);
      return { success: true, data: parseFileHistory(raw) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitFileBlame, async (_event: unknown, filePath: string, commitHash?: string) => {
    try {
      const normalizedPath = (filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const raw = await gitService.history.getFileBlame(normalizedPath, commitHash);
      return { success: true, data: parseFileBlame(raw) };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IpcChannel.GitGetFileTimelineData, async (_event: unknown, limit?: number) => {
    try {
      const commits = await gitService.history.getFileTimelineData(limit);
      return { success: true, data: commits };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
