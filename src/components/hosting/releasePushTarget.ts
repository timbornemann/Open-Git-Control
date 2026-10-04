import { hostingClient, transferClient } from '@/services/hostingClient';
import type { HostedRepositoryRef } from '@/types/hostingDtos';

const sameRepository = (left: HostedRepositoryRef | null, right: HostedRepositoryRef) =>
  left?.connectionId === right.connectionId && left.repositoryId === right.repositoryId && left.fullPath === right.fullPath;

/** A release publishes to its selected hosting endpoint, even when a named remote also has backup URLs. */
export async function resolveReleasePushTarget(repoPath: string, remoteName: string, repository: HostedRepositoryRef, endpointUrl?: string) {
  const [snapshot, preferences] = await Promise.all([
    transferClient.request('getRemotes', { repoPath }),
    transferClient.request('getPreferences', { repoPath }),
  ]);
  const remote = snapshot.remotes.find((candidate) => candidate.name === remoteName);
  if (!remote) throw new Error('The selected release remote no longer exists.');
  if (endpointUrl && remote.pushUrls.includes(endpointUrl)) return { [remoteName]: [endpointUrl] };
  const bound = remote.pushUrls.find((url) =>
    preferences.bindings?.some((binding) => binding.remoteName === remoteName && binding.url === url && sameRepository(binding.repository, repository)),
  );
  if (bound) return { [remoteName]: [bound] };
  const resolved = await Promise.allSettled(
    remote.pushUrls.map(async (url) => {
      const found = await hostingClient.request('resolveRepository', { connectionId: repository.connectionId, url });
      return found && sameRepository(found.ref, repository) ? url : null;
    }),
  );
  const target = resolved.find((result) => result.status === 'fulfilled' && result.value);
  if (target?.status === 'fulfilled' && target.value) return { [remoteName]: [target.value] };
  throw new Error('No push URL matches the selected release repository. Bind its push endpoint in Remote configuration.');
}
