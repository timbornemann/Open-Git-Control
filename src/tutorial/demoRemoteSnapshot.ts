import type { GitRemoteSnapshotDto } from '@/types/remoteTransfers';
import type { DemoRepository } from './demoRepository';

export function demoRemoteSnapshot(repo: DemoRepository): GitRemoteSnapshotDto {
  const url = repo.originFor();
  const upstream = repo.branchUpstreams.get(repo.branch);
  return {
    repoPath: repo.activeRepo,
    branch: repo.branch,
    upstream: url && upstream ? { remote: upstream.slice(0, upstream.indexOf('/')), branch: upstream.slice(upstream.indexOf('/') + 1) } : null,
    defaultPushRemote: url ? 'origin' : null,
    remotes: url ? [{ name: 'origin', fetchUrls: [url], pushUrls: [url] }] : [],
    supportsPushUrlIsolation: true,
  };
}
