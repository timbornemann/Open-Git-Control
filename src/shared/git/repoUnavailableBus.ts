import type { RepoUnavailablePayload } from './errors';

const repoUnavailableListeners = new Set<(payload: RepoUnavailablePayload) => void>();
let lastRepoUnavailableNotifyAt = 0;

export const notifyRepoUnavailable = (payload: RepoUnavailablePayload): void => {
  const now = Date.now();
  if (now - lastRepoUnavailableNotifyAt < 1200) {
    return;
  }
  lastRepoUnavailableNotifyAt = now;
  for (const listener of repoUnavailableListeners) {
    listener(payload);
  }
};

export const onRepoUnavailable = (callback: (payload: RepoUnavailablePayload) => void): (() => void) => {
  repoUnavailableListeners.add(callback);
  return () => {
    repoUnavailableListeners.delete(callback);
  };
};
