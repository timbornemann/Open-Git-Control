import { ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import { UntrackFilesService } from '../../../git/UntrackFilesService';
import { UNTRACK_OPERATION_ID, type UntrackContext } from '../../../git/untrackFilesSnapshot';
import { redactGitSensitiveText } from '../../../git/GitErrorFormatter';
import type { ExecuteUntrackFilesRequest, InspectUntrackFilesRequest } from '../../../../src/shared/ipc/untrackFiles';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { beginCommitProtection, ensureCommitProtectionIsIdle } from '../../RepositoryCommitProtection';
import { repoJobRegistry as defaultRegistry, type RepoJobRegistry } from '../../repoJobRegistry';
import { emitJobEvent } from '../jobEvents';

export function registerUntrackFilesHandlers(
  gitService: GitService,
  registry: RepoJobRegistry = defaultRegistry,
  service = new UntrackFilesService(gitService.runner),
) {
  const active = new Map<string, { ownerId: number; controller: AbortController }>();
  const owners = new Set<number>();
  const authorize = (repo: unknown) => requireActiveRepositoryPath(repo, gitService.getRepoPath(), 'git:untrackFiles');
  const failure = (error: unknown) => ({ success: false as const, error: redactGitSensitiveText(error instanceof Error ? error.message : String(error)) });
  for (const channel of [IpcChannel.GitInspectUntrackFiles, IpcChannel.GitExecuteUntrackFiles] as const) {
    ipcMain.handle(channel, async (event, request: InspectUntrackFilesRequest | ExecuteUntrackFilesRequest) => {
      let release: (() => void) | null | undefined;
      let finish: (() => void) | undefined;
      try {
        if (!request || typeof request.operationId !== 'string' || !UNTRACK_OPERATION_ID.test(request.operationId) || active.has(request.operationId))
          throw new Error('Invalid or duplicate untracking operation.');
        const repoPath = authorize(request.repoPath);
        ensureCommitProtectionIsIdle(repoPath);
        if (channel === IpcChannel.GitExecuteUntrackFiles) {
          release = beginCommitProtection(repoPath);
          if (!release) throw new Error('Another protected repository operation is running.');
        }
        if (!owners.has(event.sender.id)) {
          owners.add(event.sender.id);
          event.sender.once('destroyed', () => {
            owners.delete(event.sender.id);
            service.forgetOwner(event.sender.id);
            for (const operation of active.values()) if (operation.ownerId === event.sender.id) operation.controller.abort();
          });
        }
        const job = registry.begin(repoPath);
        const controller = new AbortController();
        const abort = () => controller.abort();
        job.signal.addEventListener('abort', abort, { once: true });
        if (job.signal.aborted) abort();
        active.set(request.operationId, { ownerId: event.sender.id, controller });
        finish = () => {
          active.delete(request.operationId);
          job.signal.removeEventListener('abort', abort);
          job.complete();
        };
        const emit = (status: 'start' | 'progress' | 'done' | 'failed' | 'cancelled', message?: string) =>
          emitJobEvent(event.sender, {
            id: request.operationId,
            operation: channel,
            status,
            timestamp: Date.now(),
            message,
            details: { repoPath },
          });
        const context: UntrackContext = {
          ownerId: event.sender.id,
          generation: job.generation,
          signal: controller.signal,
          ensureActive: () => {
            job.ensureActive();
            controller.signal.throwIfAborted();
            authorize(repoPath);
          },
          progress: (phase) => emit('progress', phase),
        };
        emit('start');
        try {
          const data =
            channel === IpcChannel.GitInspectUntrackFiles
              ? await service.inspect({ ...(request as InspectUntrackFilesRequest), repoPath }, context)
              : await service.execute({ ...(request as ExecuteUntrackFilesRequest), repoPath }, context);
          emit('done');
          return { success: true, data };
        } catch (error) {
          const result = failure(error);
          emit(controller.signal.aborted ? 'cancelled' : 'failed', result.error);
          return result;
        }
      } catch (error) {
        return failure(error);
      } finally {
        finish?.();
        release?.();
      }
    });
  }
  ipcMain.handle(IpcChannel.GitCancelUntrackFiles, (event, id: unknown) => {
    if (typeof id !== 'string' || active.get(id)?.ownerId !== event.sender.id) return false;
    active.get(id)!.controller.abort();
    return true;
  });
}
