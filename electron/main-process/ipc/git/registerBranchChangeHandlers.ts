import { app, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import type { GitService } from '../../../GitService';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type {
  BranchChangeProgress,
  ExecuteBranchChangeRequest,
  InspectBranchChangeRequest,
  RestoreBranchChangeRequest,
} from '../../../../src/shared/ipc/branchChange';
import { BranchChangeService } from '../../BranchChangeService';
import { PlannerWorkCache } from '../../PlannerWorkCache';
import { repoJobRegistry } from '../../repoJobRegistry';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { beginCommitProtection, ensureCommitProtectionIsIdle } from '../../RepositoryCommitProtection';
import { redactGitSensitiveText } from '../../../git/GitErrorFormatter';
import { emitJobEvent } from '../jobEvents';

export function registerBranchChangeHandlers(git: GitService, injected?: BranchChangeService) {
  const service = injected || new BranchChangeService(git.runner, new PlannerWorkCache(app.getPath('userData')));
  const active = new Map<string, AbortController>();
  const channels = [IpcChannel.GitInspectBranchChange, IpcChannel.GitExecuteBranchChange, IpcChannel.GitRestoreBranchChange];
  for (const channel of channels)
    ipcMain.handle(channel, async (event, request: InspectBranchChangeRequest | ExecuteBranchChangeRequest | RestoreBranchChangeRequest) => {
      let release: (() => void) | null | undefined;
      let job: ReturnType<typeof repoJobRegistry.begin> | undefined;
      const id = randomUUID();
      const key = `${event.sender.id}:${request?.repoPath}`;
      const controller = new AbortController();
      const destroyed = () => controller.abort();
      const emit = (status: 'start' | 'progress' | 'done' | 'failed', message?: string, progress?: BranchChangeProgress) =>
        emitJobEvent(event.sender, {
          id,
          operation: channel,
          status,
          timestamp: Date.now(),
          message,
          details: {
            repoPath: request?.repoPath,
            branchChangeId: typeof request?.progressId === 'string' ? request.progressId.slice(0, 128) : undefined,
            branchChange: progress,
          },
        });
      try {
        const authorize = () => requireActiveRepositoryPath(request?.repoPath, git.getRepoPath(), channel);
        const repo = authorize();
        ensureCommitProtectionIsIdle(repo);
        if (channel !== IpcChannel.GitInspectBranchChange) {
          release = beginCommitProtection(repo);
          if (!release) throw new Error('Another protected repository operation is running.');
        }
        if (active.has(key)) throw new Error('Another branch-change operation is running.');
        active.set(key, controller);
        event.sender.once('destroyed', destroyed);
        job = repoJobRegistry.begin(repo);
        const signal = AbortSignal.any([job.signal, controller.signal]);
        const context = {
          ownerId: event.sender.id,
          signal,
          ensureActive: () => {
            signal.throwIfAborted();
            job!.ensureActive();
            authorize();
          },
          progress: (text: string, progress?: BranchChangeProgress) => emit('progress', text, progress),
        };
        emit('start');
        const data =
          channel === IpcChannel.GitInspectBranchChange
            ? await service.inspect({ ...request, repoPath: repo } as InspectBranchChangeRequest, context)
            : channel === IpcChannel.GitExecuteBranchChange
              ? await service.execute({ ...request, repoPath: repo } as ExecuteBranchChangeRequest, context)
              : await service.restore(repo, (request as RestoreBranchChangeRequest).planId, context);
        emit('done');
        return { success: true as const, data };
      } catch (error) {
        const errorText = redactGitSensitiveText(error instanceof Error ? error.message : String(error));
        emit('failed', errorText);
        return { success: false as const, error: errorText };
      } finally {
        if (active.get(key) === controller) active.delete(key);
        event.sender.removeListener('destroyed', destroyed);
        release?.();
        job?.complete();
      }
    });
  ipcMain.handle(IpcChannel.GitListParkedBranchChanges, async (_event, repo: string) => {
    try {
      return { success: true as const, data: await service.list(requireActiveRepositoryPath(repo, git.getRepoPath(), IpcChannel.GitListParkedBranchChanges)) };
    } catch (error) {
      return { success: false as const, error: redactGitSensitiveText(error instanceof Error ? error.message : String(error)) };
    }
  });
  ipcMain.handle(IpcChannel.GitCancelBranchChange, (event, repo: string) => {
    const controller = active.get(`${event.sender.id}:${repo}`);
    controller?.abort();
    return service.cancel(repo, event.sender.id) || Boolean(controller);
  });
  return service;
}
