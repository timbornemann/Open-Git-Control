import { app, ipcMain } from 'electron';
import * as path from 'node:path';
import type { GitService } from '../../../GitService';
import type { RemoteTransferService } from '../../../git/RemoteTransferService';
import type { CredentialEnvironmentFactory } from '../../../git/remoteTransferModels';
import type { HostingService } from '../../../hosting/HostingService';
import type { BranchCleanupPreferences, ExecuteBranchCleanupRequest, InspectBranchCleanupRequest } from '../../../../src/shared/ipc/branchCleanup';
import { BranchCleanupService } from '../../../git/BranchCleanupService';
import { BranchCleanupPreferencesStore } from '../../../git/BranchCleanupPreferences';
import { BranchCleanupRemotes } from '../../../git/BranchCleanupRemotes';
import { CLEANUP_ID, type CleanupContext } from '../../../git/branchCleanupModel';
import { cleanupAccountVersion, cleanupHostingMetadata } from '../../../hosting/BranchCleanupHosting';
import { redactGitSensitiveText } from '../../../git/GitErrorFormatter';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { beginCommitProtection, ensureCommitProtectionIsIdle } from '../../RepositoryCommitProtection';
import { repoJobRegistry as defaultRegistry, type RepoJobRegistry } from '../../repoJobRegistry';
import { emitJobEvent } from '../jobEvents';

type Dependencies = {
  gitService: GitService;
  transfers: RemoteTransferService;
  hosting: HostingService;
  credentials?: CredentialEnvironmentFactory;
  repoJobRegistry?: RepoJobRegistry;
  preferences?: BranchCleanupPreferencesStore;
  service?: BranchCleanupService;
};

export function registerBranchCleanupHandlers(deps: Dependencies) {
  const registry = deps.repoJobRegistry ?? defaultRegistry;
  const preferences = deps.preferences ?? new BranchCleanupPreferencesStore(() => path.join(app.getPath('userData'), 'branch-cleanup.json'));
  const remotes = new BranchCleanupRemotes({
    git: deps.gitService.runner,
    transfers: deps.transfers,
    credentials: deps.credentials,
    credentialGeneration: (id) => deps.hosting.generation(id),
    accountVersion: () => cleanupAccountVersion(deps.hosting),
    metadata: (endpoint, signal) => cleanupHostingMetadata(deps.hosting, endpoint, signal),
  });
  const service = deps.service ?? new BranchCleanupService({ git: deps.gitService.runner, remotes, preferences });
  const active = new Map<string, { ownerId: number; controller: AbortController }>();
  const authorize = (repo: unknown) => requireActiveRepositoryPath(repo, deps.gitService.getRepoPath(), 'git:branchCleanup');
  const failure = (error: unknown) => ({ success: false as const, error: redactGitSensitiveText(error instanceof Error ? error.message : String(error)) });
  const register = (channel: IpcChannel.GitInspectBranchCleanup | IpcChannel.GitExecuteBranchCleanup) => {
    ipcMain.handle(channel, async (event, request: InspectBranchCleanupRequest | ExecuteBranchCleanupRequest) => {
      let release: (() => void) | null | undefined;
      let finish: (() => void) | undefined;
      try {
        if (!request || typeof request.operationId !== 'string' || !CLEANUP_ID.test(request.operationId) || active.has(request.operationId))
          throw new Error('Invalid or duplicate cleanup operation.');
        const repoPath = authorize(request.repoPath);
        ensureCommitProtectionIsIdle(repoPath);
        if (channel === IpcChannel.GitExecuteBranchCleanup) {
          release = beginCommitProtection(repoPath);
          if (!release) throw new Error('Another protected repository operation is running.');
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
            message: message ? redactGitSensitiveText(message) : undefined,
            details: { repoPath },
          });
        const context: CleanupContext = {
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
            channel === IpcChannel.GitInspectBranchCleanup
              ? await service.inspect({ ...request, repoPath }, context)
              : await service.execute({ ...(request as ExecuteBranchCleanupRequest), repoPath }, context);
          emit(controller.signal.aborted ? 'cancelled' : 'done');
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
  };
  register(IpcChannel.GitInspectBranchCleanup);
  register(IpcChannel.GitExecuteBranchCleanup);
  ipcMain.handle(IpcChannel.GitCancelBranchCleanup, (event, id: unknown) => {
    if (typeof id !== 'string' || active.get(id)?.ownerId !== event.sender.id) return false;
    active.get(id)!.controller.abort();
    return true;
  });
  ipcMain.handle(IpcChannel.GitBranchCleanupPreferencesGet, (_event, requestedRepo: unknown) => {
    try {
      return { success: true, data: preferences.read(authorize(requestedRepo)) };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle(IpcChannel.GitBranchCleanupPreferencesSave, (_event, requestedRepo: unknown, value: BranchCleanupPreferences) => {
    try {
      const repo = authorize(requestedRepo);
      ensureCommitProtectionIsIdle(repo);
      return { success: true, data: preferences.write(repo, value) };
    } catch (error) {
      return failure(error);
    }
  });
  return service;
}
