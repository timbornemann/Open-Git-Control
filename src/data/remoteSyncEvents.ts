import { invalidateResources } from './clientCache';
import { gitMutationAffects } from './mutationEffects';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export type RemoteSyncSuccess = { repoPath: string; remote: string; fetchedAt: number };
const listeners = new Set<(event: RemoteSyncSuccess) => void>();

export function subscribeRemoteSyncSuccess(repoPath: string, listener: (event: RemoteSyncSuccess) => void): () => void {
  const key = normalizeRepoPathKey(repoPath);
  const receive = (event: RemoteSyncSuccess) => {
    if (normalizeRepoPathKey(event.repoPath) === key) listener(event);
  };
  listeners.add(receive);
  return () => {
    listeners.delete(receive);
  };
}

/** Publish only after the complete fetch/tag sync or pull has succeeded. */
export function notifyRemoteSyncSuccess(repoPath: string, remote: string, operation: 'fetch' | 'pull' = 'fetch'): void {
  invalidateResources('git', normalizeRepoPathKey(repoPath), undefined, (key) => gitMutationAffects(operation, [], key));
  const event = { repoPath, remote, fetchedAt: Date.now() };
  for (const listener of listeners) listener(event);
}
