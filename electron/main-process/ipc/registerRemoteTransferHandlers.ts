import { app, ipcMain } from 'electron';
import { configureLfsInventory, referencedLfsObjects } from '../../git/GitLfsTransfers';
import { pushPreflightSources } from '../../git/PushPreflightSources';
import { GitLfsInventory } from '../../git/GitLfsInventory';
import { GitLfsInventoryStore } from '../../git/GitLfsInventoryStore';
import type { GitService } from '../../GitService';
import { RemoteTransferService, type CredentialEnvironmentFactory, type RemoteTransferContext } from '../../git/RemoteTransferService';
import type { RemotePreferencesStore } from '../../git/RemotePreferencesStore';
import { redactGitSensitiveText } from '../../git/GitErrorFormatter';
import { IpcChannel } from '../../../src/types/ipcContract';
import type { RemoteTransferOperation, RemoteTransferOperations } from '../../../src/types/remoteTransfers';
import { repositoryPathKey, requireActiveRepositoryPath } from '../activeRepositoryAuthorization';
import { COMMIT_PROTECTION_BUSY_ERROR, ensureCommitProtectionIsIdle } from '../RepositoryCommitProtection';
import { BackgroundFetchPreemptedError } from '../../git/BackgroundFetchPreemptedError';
import { repoJobRegistry as defaultRegistry, type RepoJobRegistry } from '../repoJobRegistry';
import { createJobId } from '../gitCommandPolicy';
import { emitJobEvent } from './jobEvents';
import type { SecretScanPushGuard } from './git/secretScanPushGuard';
import { readStoreData } from '../repoStore';
import { remoteSyncReferenceVersion } from '../../git/RemoteSyncReferences';

type Dependencies = {
  gitService: GitService;
  pushGuard: SecretScanPushGuard;
  createCredentialEnvironment?: CredentialEnvironmentFactory;
  getCredentialGeneration?: (connectionId: string) => number;
  repoJobRegistry?: RepoJobRegistry;
  preferencesStore?: RemotePreferencesStore;
  readStoredRepoPaths?: () => string[];
  lfsInventory?: GitLfsInventory;
};
const operations = new Set<RemoteTransferOperation>([
  'getRemotes',
  'checkConnection',
  'editRemote',
  'getPreferences',
  'getPullConfiguration',
  'setPreferences',
  'fetch',
  'pull',
  'setUpstream',
  'planPush',
  'executePush',
  'retryPush',
  'cancel',
]);
const writes = new Set<RemoteTransferOperation>(['editRemote', 'setPreferences', 'fetch', 'pull', 'setUpstream', 'executePush', 'retryPush']);
const transfers = new Set<RemoteTransferOperation>(['fetch', 'pull', 'planPush', 'executePush', 'retryPush']);

/** Paths and plans are main-owned authority. Renderer inputs only select typed operations. */
export function registerRemoteTransferHandlers({
  gitService,
  pushGuard,
  createCredentialEnvironment,
  getCredentialGeneration,
  repoJobRegistry = defaultRegistry,
  preferencesStore,
  readStoredRepoPaths = () => readStoreData().repos.map((repo) => repo.path),
  lfsInventory = new GitLfsInventory((namespace) => new GitLfsInventoryStore(() => app.getPath('userData'), namespace)),
}: Dependencies): RemoteTransferService {
  configureLfsInventory(gitService.runner, lfsInventory);
  const service = new RemoteTransferService(gitService.runner, preferencesStore, createCredentialEnvironment, getCredentialGeneration);
  pushGuard.configurePreflight?.({
    sources: (repo, signal) => pushPreflightSources(repo, gitService.runner, service.getPreferences(repo), signal),
    warmLfs: async (repo, sources, signal) => {
      for (const source of sources)
        await referencedLfsObjects(repo, [source], gitService.runner, {
          requestedKind: 'preflight',
          signal,
          envOverrides: { GIT_NO_LAZY_FETCH: '1' },
        });
    },
  });
  pushGuard.setPushScanResolver?.((repoPath, args, context) => service.getPushScanScope(repoPath, args, context));
  const running = new Map<string, Set<AbortController>>();
  // Each window retains its own completed version through failed/deferred
  // attempts. A retry must still publish previously interrupted changes.
  const syncVersions = new Map<string, string>();

  ipcMain.handle(
    IpcChannel.RemoteTransferRequest,
    // Typed dispatch keeps the path, job and guard checks shared for every operation.
    // eslint-disable-next-line complexity
    async (event: any, operation: RemoteTransferOperation, input: RemoteTransferOperations[RemoteTransferOperation]['input']) => {
      let job: ReturnType<RepoJobRegistry['begin']> | undefined;
      let controller: AbortController | undefined;
      let key = '';
      let repoPath = '';
      let completedSync: { key: string; version: string } | undefined;
      const jobId = createJobId(`remote-${operation}`);
      const jobOperation = `git:${operation}`;
      try {
        if (!operations.has(operation) || !input || typeof input !== 'object' || typeof input.repoPath !== 'string' || !input.repoPath.trim())
          throw new Error('Invalid remote transfer request.');
        if (operation === 'fetch' && 'background' in input && typeof input.background !== 'boolean') throw new Error('Invalid background fetch mode.');
        if (operation === 'fetch') {
          const fetch = input as RemoteTransferOperations['fetch']['input'];
          if (['tagsOnly', 'includeTags'].some((key) => key in fetch && typeof fetch[key as 'tagsOnly' | 'includeTags'] !== 'boolean'))
            throw new Error('Invalid fetch scope.');
          if (fetch.tagsOnly && fetch.includeTags) throw new Error('Tag-only and combined fetch modes cannot be used together.');
        }
        const readonly = operation === 'getRemotes' || operation === 'getPreferences' || operation === 'getPullConfiguration';
        try {
          repoPath = requireActiveRepositoryPath(input.repoPath, gitService.getRepoPath(), IpcChannel.RemoteTransferRequest);
        } catch (error) {
          const savedPath = readonly && readStoredRepoPaths().find((stored) => repositoryPathKey(stored) === repositoryPathKey(input.repoPath));
          if (!savedPath) throw error;
          repoPath = savedPath;
        }
        const ownerId = typeof event.sender?.id === 'number' ? event.sender.id : 0;
        key = `${ownerId}:${repositoryPathKey(repoPath)}`;
        if (operation === 'cancel') {
          for (const active of running.get(key) ?? []) active.abort();
          return { success: true, data: true };
        }
        if (writes.has(operation)) ensureCommitProtectionIsIdle(repoPath);
        job = repoJobRegistry.begin(repoPath);
        controller = new AbortController();
        const abort = () => controller!.abort();
        job.signal.addEventListener('abort', abort, { once: true });
        if (job.signal.aborted) abort();
        const set = running.get(key) ?? new Set<AbortController>();
        set.add(controller);
        running.set(key, set);
        let verifyPushPolicy: (() => void) | undefined;
        const context: RemoteTransferContext = {
          ownerId,
          generation: job.generation,
          signal: controller.signal,
          ensureActive: () => {
            controller!.signal.throwIfAborted();
            job!.ensureActive();
            if (!readonly) requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), IpcChannel.RemoteTransferRequest);
            if (writes.has(operation)) ensureCommitProtectionIsIdle(repoPath);
            verifyPushPolicy?.();
          },
          onProgress: (message, remoteTransfer) =>
            emitJobEvent(event.sender, {
              id: jobId,
              operation: jobOperation,
              status: 'progress',
              message,
              details: { repoPath, ...(remoteTransfer ? { remoteTransfer } : {}) },
              timestamp: Date.now(),
            }),
          authorizePush: async (args) => {
            const verifyPolicy = await pushGuard.createPushPolicyVerifier?.(repoPath);
            const blocked = await pushGuard.requirePushSecretScanApproval(event, args, repoPath);
            if (blocked) throw new Error(blocked.error);
            verifyPolicy?.();
            verifyPushPolicy = verifyPolicy;
          },
        };
        if (transfers.has(operation))
          emitJobEvent(event.sender, { id: jobId, operation: jobOperation, status: 'start', details: { repoPath }, timestamp: Date.now() });
        let data: unknown;
        switch (operation) {
          case 'getRemotes':
            data = await service.getRemotes(repoPath);
            break;
          case 'getPreferences':
            data = service.getPreferences(repoPath);
            break;
          case 'getPullConfiguration':
            data = await service.getPullConfiguration(repoPath, context.signal);
            break;
          case 'checkConnection':
            data = await service.checkConnection(repoPath, input as RemoteTransferOperations['checkConnection']['input'], context);
            break;
          case 'setPreferences':
            data = await service.setPreferences(repoPath, (input as RemoteTransferOperations['setPreferences']['input']).preferences, context);
            break;
          case 'editRemote':
            data = await service.editRemote(repoPath, (input as RemoteTransferOperations['editRemote']['input']).mutation, context);
            break;
          case 'fetch': {
            const fetch = input as RemoteTransferOperations['fetch']['input'];
            const scope = key;
            const before = fetch.includeTags ? await remoteSyncReferenceVersion(repoPath, gitService.runner, context.signal) : undefined;
            if (before !== undefined && !syncVersions.has(scope)) {
              syncVersions.set(scope, before);
              if (syncVersions.size > 128) syncVersions.delete(syncVersions.keys().next().value!);
            }
            const fetched = await service.fetch(repoPath, fetch.remote, context, {
              tagsOnly: fetch.tagsOnly,
              includeTags: fetch.includeTags,
              background: fetch.background,
            });
            data = fetched;
            if (before !== undefined) {
              const version = await remoteSyncReferenceVersion(repoPath, gitService.runner, context.signal);
              data = { ...fetched, refsChanged: before !== version || syncVersions.get(scope) !== version };
              completedSync = { key: scope, version };
            }
            break;
          }
          case 'pull':
            data = await service.pull(repoPath, input as RemoteTransferOperations['pull']['input'], context);
            break;
          case 'setUpstream': {
            const selected = input as RemoteTransferOperations['setUpstream']['input'];
            data = await service.setUpstream(repoPath, selected.remote, selected.branch, context);
            break;
          }
          case 'planPush':
            data = await service.planPush(repoPath, input as RemoteTransferOperations['planPush']['input'], context);
            break;
          case 'executePush':
            data = await service.executePush(repoPath, (input as RemoteTransferOperations['executePush']['input']).planId, context);
            break;
          case 'retryPush': {
            const selected = input as RemoteTransferOperations['retryPush']['input'];
            data = await service.retryPush(repoPath, selected.batchId, selected.targetIds, context);
            break;
          }
        }
        // A cancelled push still returns its endpoint outcomes: already-published refs cannot be rolled back.
        if (operation !== 'executePush' && operation !== 'retryPush') context.ensureActive();
        if (completedSync) {
          syncVersions.delete(completedSync.key);
          syncVersions.set(completedSync.key, completedSync.version);
        }
        if (transfers.has(operation)) {
          const state = (data as { state?: string })?.state;
          emitJobEvent(event.sender, {
            id: jobId,
            operation: jobOperation,
            status: state === 'cancelled' ? 'cancelled' : state === 'failed' || state === 'partial' ? 'failed' : 'done',
            details: { repoPath, state },
            timestamp: Date.now(),
          });
        }
        job.signal.removeEventListener('abort', abort);
        return { success: true, data };
      } catch (error) {
        const message = redactGitSensitiveText(error instanceof Error ? error.message : 'Remote transfer failed.');
        const deferred =
          operation === 'fetch' &&
          (input as RemoteTransferOperations['fetch']['input'])?.background === true &&
          (error instanceof BackgroundFetchPreemptedError || message === COMMIT_PROTECTION_BUSY_ERROR) &&
          !controller?.signal.aborted &&
          repoPath &&
          repositoryPathKey(gitService.getRepoPath() || '') === repositoryPathKey(repoPath);
        if (deferred) {
          if (job)
            emitJobEvent(event.sender, {
              id: jobId,
              operation: jobOperation,
              status: 'cancelled',
              message: 'Automatic fetch deferred for a foreground Git action.',
              details: { repoPath, deferred: true },
              timestamp: Date.now(),
            });
          return { success: true, data: { output: '', deferred: true } };
        }
        if (transfers.has(operation))
          emitJobEvent(event.sender, {
            id: jobId,
            operation: jobOperation,
            status: controller?.signal.aborted ? 'cancelled' : 'failed',
            message,
            details: { repoPath: job?.repoPath },
            timestamp: Date.now(),
          });
        return { success: false, error: message };
      } finally {
        job?.complete();
        if (controller) running.get(key)?.delete(controller);
        if (!running.get(key)?.size) running.delete(key);
      }
    },
  );
  return service;
}
