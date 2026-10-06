import type { HostedRepositoryRef } from '../../src/types/hostingDtos';
import type { HostingAdapter } from './HostingAdapter';
import { RemotePreferencesStore } from '../git/RemotePreferencesStore';

const sameRepository = (left: HostedRepositoryRef | null | undefined, right: HostedRepositoryRef) =>
  left?.connectionId === right.connectionId && left.repositoryId === right.repositoryId && left.fullPath === right.fullPath;

export function releaseCredentialUrls(repoPath: string, remoteName: string, args: string[]) {
  const bindings = new RemotePreferencesStore().read(repoPath).bindings || [];
  return args.filter(
    (url) => url.startsWith('https://') && bindings.find((binding) => binding.remoteName === remoteName && binding.url === url)?.credentialMode !== 'system',
  );
}

/** Explicit bindings are authoritative for SSH aliases that an adapter cannot resolve by URL. */
export function releaseEndpointResolver(repoPath: string, remoteName: string, repository: HostedRepositoryRef, adapter: HostingAdapter) {
  const store = new RemotePreferencesStore();
  const bindings = () => (store.read(repoPath).bindings || []).filter((binding) => binding.remoteName === remoteName);
  const captured = bindings();
  const stamp = JSON.stringify(captured);
  return {
    stamp,
    matches: async (url: string) => {
      const binding = captured.find((entry) => entry.url === url && entry.repository);
      if (binding) return sameRepository(binding.repository, repository);
      return sameRepository((await adapter.resolveRepository(url))?.ref, repository);
    },
    assertCurrent: () => {
      if (JSON.stringify(bindings()) !== stamp) throw new Error('The release remote account binding changed. Inspect the endpoint again.');
    },
  };
}
