import { requireElectronApi } from './electronApi';
import type { HostingOperation, HostingOperations } from '@/shared/ipc/contracts/hosting';
import type { RemoteTransferOperation, RemoteTransferOperations } from '@/types/remoteTransfers';
import { queryClient } from '@/data/queryClient';

const reads = new Set<HostingOperation>([
  'capabilities',
  'repositories',
  'cachedRepositories',
  'repository',
  'resolveRepository',
  'branches',
  'tags',
  'changeRequests',
  'runs',
  'jobs',
  'status',
  'artifacts',
  'releases',
  'releaseAssets',
]);
const sessions = new Map<string, number>();
const authChanges = new Set<HostingOperation>([
  'saveConnection',
  'removeConnection',
  'login',
  'loginBrowser',
  'loginWithCli',
  'inspectCliLogin',
  'startDeviceLogin',
  'logout',
  'cancelAuth',
]);
export type HostingFailureKind = 'unsupported' | 'disabled' | 'permission' | 'unavailable' | 'invalid';
export class HostingRequestError extends Error {
  readonly kind: HostingFailureKind;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.kind =
      status === 501 || status === 405
        ? 'unsupported'
        : status === 401 || status === 403
          ? 'permission'
          : status === 409 && (!code || code === 'feature_disabled')
            ? 'disabled'
            : !status || status >= 500 || status === 429
              ? 'unavailable'
              : 'invalid';
  }
}

export const hostingClient = {
  cachedRepositories(connectionId: string): HostingOperations['repositories']['output'] | undefined {
    const generation = sessions.get(connectionId) ?? 0;
    return (
      queryClient.getQueryData(['hosting', connectionId, generation, 'repositories', { connectionId }]) ??
      queryClient.getQueryData(['hosting', connectionId, generation, 'cachedRepositories', { connectionId }])
    );
  },
  async request<K extends HostingOperation>(operation: K, input: HostingOperations[K]['input']): Promise<HostingOperations[K]['output']> {
    const context = input as { id?: string; connectionId?: string; repository?: { connectionId: string } } | undefined;
    const connectionId = context?.connectionId ?? context?.repository?.connectionId ?? context?.id ?? 'application';
    if (authChanges.has(operation)) {
      sessions.set(connectionId, (sessions.get(connectionId) ?? 0) + 1);
      if (connectionId !== 'application') sessions.set('application', (sessions.get('application') ?? 0) + 1);
      await queryClient.cancelQueries({ queryKey: ['hosting', connectionId] });
      queryClient.removeQueries({ queryKey: ['hosting', connectionId] });
    }
    const generation = sessions.get(connectionId) ?? 0;
    const request = async () => {
      const result = await requireElectronApi().hosting.hostingRequest(operation, input);
      if (generation !== (sessions.get(connectionId) ?? 0)) throw new Error('The hosting account changed. Reload this view.');
      if (!result.success) throw new HostingRequestError(result.error, (result as { status?: number }).status, (result as { code?: string }).code);
      return result.data;
    };
    // A cache-only URL lookup can be a miss just before the online catalog is
    // persisted. Never retain that miss as a fresh network resource.
    if (operation === 'resolveRepository' && (input as HostingOperations['resolveRepository']['input']).cachedOnly) return request();
    if (reads.has(operation)) return queryClient.fetchQuery({ queryKey: ['hosting', connectionId, generation, operation, input], queryFn: request });
    const result = await request();
    if (operation === 'pollDeviceLogin' && (result as { status?: string }).status === 'success') {
      sessions.set('application', (sessions.get('application') ?? 0) + 1);
    }
    if (operation !== 'connections' && operation !== 'logs' && operation !== 'downloadArtifact' && operation !== 'startDeviceLogin') {
      await queryClient.cancelQueries({ queryKey: ['hosting', connectionId] });
      queryClient.removeQueries({ queryKey: ['hosting', connectionId] });
    }
    return result;
  },
};
export const transferClient = {
  async request<K extends RemoteTransferOperation>(operation: K, input: RemoteTransferOperations[K]['input']): Promise<RemoteTransferOperations[K]['output']> {
    const result = await requireElectronApi().transfers.remoteTransferRequest(operation, input);
    if (!result.success) throw new Error(result.error);
    return result.data;
  },
};
