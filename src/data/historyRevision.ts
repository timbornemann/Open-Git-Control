import { normalizeRepoPathKey } from '@/utils/repoPath';

const revisions = new Map<string, { revision: number; changedAt: number }>();
const listeners = new Set<() => void>();
export const historyRevision = (repoPath: string) => revisions.get(normalizeRepoPathKey(repoPath))?.revision ?? 0;
export const historyChangedAt = (repoPath: string) => revisions.get(normalizeRepoPathKey(repoPath))?.changedAt ?? 0;
export const subscribeHistoryRevision = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function advanceHistoryRevision(repoPath: string) {
  revisions.set(normalizeRepoPathKey(repoPath), { revision: historyRevision(repoPath) + 1, changedAt: Date.now() });
  listeners.forEach((listener) => listener());
}
