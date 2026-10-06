import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import type { GitService } from '../../../GitService';
import { GitLfsService } from '../../../git/GitLfsService';
import type { GitLfsStatusRequest, TrackWithGitLfsRequest } from '../../../../src/shared/ipc/gitLfs';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { repoJobRegistry } from '../../repoJobRegistry';
import { emitJobEvent } from '../jobEvents';
import { redactGitSensitiveText } from '../../../git/GitErrorFormatter';

export function registerGitLfsHandlers(gitService: GitService, ensureWriteAllowed: (repoPath: string) => void): void {
  const service = new GitLfsService(gitService.runner);
  ipcMain.handle(IpcChannel.GitGetLfsStatus, async (_event, input: GitLfsStatusRequest) => {
    try {
      const repoPath = requireActiveRepositoryPath(input?.repoPath, gitService.getRepoPath(), IpcChannel.GitGetLfsStatus);
      return { success: true, data: await service.getStatus({ ...input, repoPath }) };
    } catch (error) {
      return { success: false, error: redactGitSensitiveText(String(error instanceof Error ? error.message : error)) };
    }
  });
  ipcMain.handle(IpcChannel.GitTrackWithLfs, async (event, input: TrackWithGitLfsRequest) => {
    const id = randomUUID();
    let job: ReturnType<typeof repoJobRegistry.begin> | undefined;
    let repoPath = '';
    const report = (status: 'start' | 'done' | 'failed' | 'cancelled', message?: string) =>
      emitJobEvent(event.sender, { id, operation: IpcChannel.GitTrackWithLfs, status, message, details: { repoPath }, timestamp: Date.now() });
    try {
      repoPath = requireActiveRepositoryPath(input?.repoPath, gitService.getRepoPath(), IpcChannel.GitTrackWithLfs);
      ensureWriteAllowed(repoPath);
      job = repoJobRegistry.begin(repoPath);
      report('start', 'Converting the selected file to Git LFS…');
      const data = await service.track(
        { ...input, repoPath },
        () => {
          job!.ensureActive();
          requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), IpcChannel.GitTrackWithLfs);
          ensureWriteAllowed(repoPath);
        },
        job.signal,
      );
      report('done');
      return { success: true, data };
    } catch (error) {
      const message = redactGitSensitiveText(error instanceof Error ? error.message : String(error));
      report(job?.signal.aborted ? 'cancelled' : 'failed', message);
      return { success: false, error: message };
    } finally {
      job?.complete();
    }
  });
}
