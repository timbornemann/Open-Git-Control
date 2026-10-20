import type { HostingService } from './HostingService';
import type { CleanupEndpoint } from '../git/branchCleanupModel';

export function cleanupAccountVersion(service: HostingService) {
  return JSON.stringify(
    service
      .listConnections()
      .map((connection) => [connection.id, connection.username, connection.authenticated, connection.hasCredentials, service.generation(connection.id)])
      .sort(),
  );
}

export async function cleanupHostingMetadata(service: HostingService, endpoint: CleanupEndpoint, signal: AbortSignal) {
  const ids = endpoint.repository
    ? [endpoint.repository.connectionId]
    : service
        .listConnections()
        .filter((connection) => connection.hasCredentials)
        .map((connection) => connection.id);
  for (const connectionId of ids) {
    signal.throwIfAborted();
    const repository = await service.request('resolveRepository', { connectionId, url: endpoint.url });
    signal.throwIfAborted();
    if (!repository) continue;
    if (
      endpoint.repository &&
      (repository.ref.fullPath.toLowerCase() !== endpoint.repository.fullPath.toLowerCase() ||
        (endpoint.repository.repositoryId && repository.ref.repositoryId !== endpoint.repository.repositoryId))
    )
      throw new Error('The hosting binding no longer matches this endpoint.');
    return service.branchCleanupMetadata(repository.ref, signal);
  }
  return null;
}
