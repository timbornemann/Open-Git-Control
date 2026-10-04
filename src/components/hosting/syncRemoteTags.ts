import { transferClient } from '@/services/hostingClient';
import { gitClient } from '@/services/gitClient';
import { parseTagReferenceStatus, remoteTagTrackingRefPrefix, TAG_REFERENCE_STATUS_FORMAT } from '@/utils/tagConflicts';

type Scoped = <T>(operation: () => Promise<T>) => Promise<T>;

/** Fetch remote tags into their own namespace, then atomically adopt only missing local tags. */
export async function syncRemoteTags(repoPath: string, remote: string, scoped: Scoped = (operation) => operation()) {
  await scoped(() => transferClient.request('fetch', { repoPath, remote, tagsOnly: true }));
  const refs = await scoped(() =>
    gitClient.runGitCommandForRepo(repoPath, 'forEachRef', TAG_REFERENCE_STATUS_FORMAT, 'refs/tags', remoteTagTrackingRefPrefix(remote)),
  );
  if (!refs.success) throw new Error(refs.error || 'Remote tag state could not be read.');
  const state = parseTagReferenceStatus(refs.data, remote);
  for (const name of state.remoteOnlyTagNames) {
    const adoption = await scoped(() => gitClient.runGitCommandForRepo(repoPath, 'adoptRemoteTag', remote, name));
    if (!adoption.success) throw new Error(adoption.error || `Remote tag "${name}" could not be adopted.`);
  }
  return state;
}
