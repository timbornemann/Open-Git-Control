import { app, ipcMain } from 'electron';
import type { GitService } from '../../GitService';
import { hostingService } from '../../hosting/HostingService';
import { IpcChannel } from '../../../src/types/ipcContract';
import type { PlannerStartWorkRequest, PlannerUpdateWorkRequest, PlannerWorkRequest } from '../../../src/types/plannerWork';
import { PlannerWorkService, type PlannerWorkContext } from '../PlannerWorkService';
import { PlannerWorkCache } from '../PlannerWorkCache';
import { PlannerWorkHosting } from '../PlannerWorkHosting';
import { requireActiveRepositoryPath } from '../activeRepositoryAuthorization';
import { repoJobRegistry } from '../repoJobRegistry';
import { beginCommitProtection, ensureCommitProtectionIsIdle } from '../RepositoryCommitProtection';
import { redactGitSensitiveText } from '../../git/GitErrorFormatter';
import { emitJobEvent } from './jobEvents';
import { randomUUID } from 'node:crypto';
import { registerPlannerBranchRename, registerPlannerWorkDetach } from '../plannerWorkEvents';

export function registerPlannerWorkHandlers(gitService: GitService, injected?: PlannerWorkService) {
  const service =
    injected ??
    new PlannerWorkService(gitService.runner, new PlannerWorkCache(app.getPath('userData')), new PlannerWorkHosting(gitService.runner, hostingService));
  registerPlannerBranchRename((repo, before, after) => service.renamed(repo, before, after));
  registerPlannerWorkDetach((repo, ids) => service.detached(repo, ids));
  for (const channel of [
    IpcChannel.PlannerInspectWork,
    IpcChannel.PlannerStartWork,
    IpcChannel.PlannerGetWork,
    IpcChannel.PlannerRefreshWork,
    IpcChannel.PlannerUpdateWork,
  ]) {
    ipcMain.handle(channel, async (event, request: PlannerWorkRequest | PlannerStartWorkRequest | PlannerUpdateWorkRequest) => {
      let release: (() => void) | null | undefined;
      let job: ReturnType<typeof repoJobRegistry.begin> | undefined;
      const operationId = randomUUID();
      const emit = (status: 'start' | 'progress' | 'done' | 'failed', message?: string) =>
        emitJobEvent(event.sender, { id: operationId, operation: channel, status, timestamp: Date.now(), message, details: { repoPath: request?.repoPath } });
      try {
        if (!request || typeof request.itemId !== 'string' || !request.itemId || request.itemId.length > 100) throw new Error('Invalid planner task.');
        const authorize = () => requireActiveRepositoryPath(request.repoPath, gitService.getRepoPath(), channel);
        request = { ...request, repoPath: authorize() };
        ensureCommitProtectionIsIdle(request.repoPath);
        if (channel === IpcChannel.PlannerStartWork || channel === IpcChannel.PlannerUpdateWork) {
          release = beginCommitProtection(request.repoPath);
          if (!release) throw new Error('Another protected repository operation is running.');
        }
        job = repoJobRegistry.begin(request.repoPath);
        const controller = new AbortController();
        const destroyed = () => controller.abort();
        event.sender.once('destroyed', destroyed);
        const signal = AbortSignal.any([job.signal, controller.signal]);
        const context: PlannerWorkContext = {
          ownerId: event.sender.id,
          signal,
          ensureActive: () => {
            job!.ensureActive();
            signal.throwIfAborted();
            authorize();
          },
          progress: (message) => emit('progress', message),
        };
        emit('start');
        try {
          const data =
            channel === IpcChannel.PlannerInspectWork
              ? await service.inspect(request, context)
              : channel === IpcChannel.PlannerStartWork
                ? await service.start(request as PlannerStartWorkRequest, context)
                : channel === IpcChannel.PlannerGetWork
                  ? await service.get(request)
                  : channel === IpcChannel.PlannerRefreshWork
                    ? await service.refresh(request, context)
                    : await service.update(request as PlannerUpdateWorkRequest, context);
          if (!(channel === IpcChannel.PlannerStartWork && 'recoveryId' in data)) context.ensureActive();
          emit('done');
          return { success: true as const, data };
        } finally {
          event.sender.removeListener('destroyed', destroyed);
        }
      } catch (error) {
        const message = redactGitSensitiveText(error instanceof Error ? error.message : String(error));
        emit('failed', message);
        return { success: false as const, error: message };
      } finally {
        release?.();
        job?.complete();
      }
    });
  }
  return service;
}
