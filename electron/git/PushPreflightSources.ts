import type { GitRunner } from './GitRunner';
import type { RemotePreferences } from '../../src/types/remoteTransfers';
import { SECRET_SCAN_HISTORY_ENV } from './SecretScanHistoryCache';

/** Offline hints only: the foreground push independently proves each endpoint's scope. */
export async function pushPreflightSources(repo: string, git: GitRunner, preferences: RemotePreferences, signal: AbortSignal): Promise<string[]> {
  const raw = await git.run(
    repo,
    ['for-each-ref', '--format=%(objecttype)%00%(objectname)%00%(*objecttype)%00%(*objectname)%00%(refname)', 'refs/heads', 'refs/tags'],
    {
      requestedKind: 'preflight',
      signal,
      envOverrides: SECRET_SCAN_HISTORY_ENV,
    },
  );
  const refs = raw
    .split(/\r?\n/)
    .map((line) => line.split('\0'))
    .flatMap(([kind, oid, peeledKind, peeled, ref]) => {
      const commit = kind === 'commit' ? oid : peeledKind === 'commit' ? peeled : '';
      return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit) && ref ? [{ ref, oid: commit }] : [];
    });
  const profile = preferences.profiles?.find(({ id }) => id === preferences.activeProfileId);
  const preferred = new Set((profile?.tagNames ?? []).map((tag) => `refs/tags/${tag}`));
  return [...new Set([...refs.filter(({ ref }) => preferred.has(ref)), ...refs].map(({ oid }) => oid))].slice(0, 127);
}
