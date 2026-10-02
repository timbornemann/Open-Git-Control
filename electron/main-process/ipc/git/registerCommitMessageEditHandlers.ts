import { ipcMain } from 'electron';
import type { GitService } from '../../../GitService';
import { CommitMessageEditService } from '../../../git/CommitMessageEditService';
import { EDIT_ID } from '../../../git/commitMessageEditJournal';
import { redactGitSensitiveText } from '../../../git/GitErrorFormatter';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { RewordCommitMessageRequest } from '../../../../src/shared/ipc/commitMessageEdit';
import type { RepoJobRegistry } from '../../repoJobRegistry';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { emitJobEvent } from '../jobEvents';

type Dependencies = {
  gitService: GitService;
  repoJobRegistry: RepoJobRegistry;
  beginCommitProtection: (repoPath: string) => (() => void) | null;
  ensureCommitProtectionIsIdle: (repoPath: string) => void;
};

export function registerCommitMessageEditHandlers(deps: Dependencies) {
  const service = new CommitMessageEditService(deps.gitService.runner);
  const active = new Map<string, { senderId: number; controller: AbortController }>();
  const failure = (error: unknown) => ({ success: false as const, error: redactGitSensitiveText(error instanceof Error ? error.message : String(error)) });
  const authorize = (repo: unknown, channel: string) => requireActiveRepositoryPath(repo, deps.gitService.getRepoPath(), channel);

  ipcMain.handle(IpcChannel.GitInspectCommitMessageEdit, async (_event, request: { repoPath?: unknown; commitHash?: unknown } = {}) => {
    try {
      const repoPath = authorize(request.repoPath, IpcChannel.GitInspectCommitMessageEdit);
      deps.ensureCommitProtectionIsIdle(repoPath);
      if (typeof request.commitHash !== 'string') throw new Error('Invalid commit hash.');
      const data = await service.inspect(repoPath, request.commitHash);
      authorize(repoPath, IpcChannel.GitInspectCommitMessageEdit);
      return { success: true, data };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(IpcChannel.GitRewordCommitMessage, async (event, request: RewordCommitMessageRequest) => {
    let release: (() => void) | undefined;
    let finish: (() => void) | undefined;
    try {
      if (!request || typeof request.operationId !== 'string' || !EDIT_ID.test(request.operationId) || active.has(request.operationId))
        throw new Error('Invalid or duplicate commit edit operation.');
      const repoPath = authorize(request.repoPath, IpcChannel.GitRewordCommitMessage);
      const protection = deps.beginCommitProtection(repoPath);
      if (!protection) throw new Error('Another protected commit operation is running.');
      release = protection;
      const job = deps.repoJobRegistry.begin(repoPath);
      const controller = new AbortController();
      const abort = () => controller.abort();
      job.signal.addEventListener('abort', abort, { once: true });
      active.set(request.operationId, { senderId: event.sender.id, controller });
      finish = () => {
        job.signal.removeEventListener('abort', abort);
        job.complete();
        active.delete(request.operationId);
      };
      const emit = (status: 'start' | 'progress' | 'done' | 'failed', message?: string) =>
        emitJobEvent(event.sender, {
          id: request.operationId,
          operation: IpcChannel.GitRewordCommitMessage,
          status,
          timestamp: Date.now(),
          message,
        });
      emit('start');
      try {
        const data = await service.reword(
          { ...request, repoPath },
          {
            signal: controller.signal,
            ensureActive: () => {
              job.ensureActive();
              controller.signal.throwIfAborted();
              authorize(repoPath, IpcChannel.GitRewordCommitMessage);
            },
            progress: (phase) => emit('progress', phase),
          },
        );
        emit('done');
        return { success: true, data };
      } catch (error) {
        const result = failure(error);
        emit('failed', result.error);
        return result;
      }
    } catch (error) {
      return failure(error);
    } finally {
      finish?.();
      release?.();
    }
  });

  ipcMain.handle(IpcChannel.GitCancelCommitMessageEdit, (event, operationId: unknown) => {
    if (typeof operationId !== 'string') return false;
    const operation = active.get(operationId);
    if (!operation || operation.senderId !== event.sender.id) return false;
    operation.controller.abort();
    return true;
  });

  ipcMain.handle(IpcChannel.GitCommitMessageEditBackups, async (_event, requestedRepo: unknown) => {
    try {
      const repoPath = authorize(requestedRepo, IpcChannel.GitCommitMessageEditBackups);
      return { success: true, data: await service.backups(repoPath) };
    } catch (error) {
      return failure(error);
    }
  });
  return service;
}
