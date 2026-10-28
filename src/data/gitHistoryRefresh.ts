import { normalizeRepoPathKey } from '@/utils/repoPath';

const versions = new Map<string, number>();
const listeners = new Set<() => void>();
let globalVersion = 0;
let notificationPending = false;

/** Unlike a history rewrite, ref movement refreshes the graph without clearing
 * its usable layout or scroll position. Versions also reject older async reads. */
export const gitHistoryVersion = (repoPath: string) => globalVersion + (versions.get(normalizeRepoPathKey(repoPath)) ?? 0);

export function subscribeGitHistoryRefresh(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyGitHistoryRefresh(repoPath?: string) {
  if (repoPath) {
    const key = normalizeRepoPathKey(repoPath);
    versions.set(key, (versions.get(key) ?? 0) + 1);
  } else globalVersion++;
  // A workflow may invalidate data and request a UI refresh in the same turn.
  // Publish the version immediately for guards, then coalesce notifications.
  if (notificationPending) return;
  notificationPending = true;
  queueMicrotask(() => {
    notificationPending = false;
    for (const listener of listeners) listener();
  });
}
