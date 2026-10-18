import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ReadRequest } from '../../../../src/shared/cache/resource';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { GitService } from '../../../GitService';
import type { CommitStatsService } from '../../../CommitStatsService';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { normalizeDiffPreviewArgs } from '../../diffPreviewPolicy';
import { beginReadRequest } from '../../readRequests';

export function registerGitDiffPreviewHandler({ gitService, commitStatsService }: { gitService: GitService; commitStatsService: CommitStatsService }) {
  ipcMain.handle(
    IpcChannel.GitDiffPreview,
    async (
      event: IpcMainInvokeEvent,
      args: unknown,
      limits: { maxBytes?: unknown; maxLines?: unknown } = {},
      requestedRepoPath?: unknown,
      request?: ReadRequest,
    ) => {
      const read = beginReadRequest(event, request);
      try {
        read.signal.throwIfAborted();
        const normalizedArgs = normalizeDiffPreviewArgs(args);
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitDiffPreview);
        commitStatsService.interruptBackgroundWork();
        const data = await gitService.runner.getDiffPreview(
          repoPath,
          normalizedArgs,
          {
            maxBytes: Number(limits.maxBytes) || undefined,
            maxLines: Number(limits.maxLines) || undefined,
          },
          read.signal,
        );
        return { success: true, data };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Git diff preview failed.' };
      } finally {
        read.finish();
      }
    },
  );
}
