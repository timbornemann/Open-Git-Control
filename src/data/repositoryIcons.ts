import type { ResourceKey } from '@/shared/cache/resource';
import type { RepositoryIconStateDto } from '@/shared/repositoryIcons';
import { repositoryIconsClient } from '@/services/repositoryIconsClient';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { queryClient } from './queryClient';
import { loadRepositoryIconPreview } from '@/services/repositoryIconPreview';

export const repositoryIconKey = (repo: string): ResourceKey => ['resource', 'app', normalizeRepoPathKey(repo), 'getRepositoryIcon'];
type Observer = {
  repo: string;
  count: number;
  active: boolean;
  read: Promise<RepositoryIconStateDto> | null;
  resolution: Promise<void> | null;
  attemptedRevision: number;
  retry: ReturnType<typeof setTimeout> | null;
};
const observers = new Map<string, Observer>();
let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const current = (entry: Observer) => entry.active && observers.get(normalizeRepoPathKey(entry.repo)) === entry;
const stateFor = (entry: Observer) => queryClient.getQueryData<RepositoryIconStateDto>(repositoryIconKey(entry.repo));

export function publishRepositoryIcon(state: RepositoryIconStateDto) {
  const entry = observers.get(normalizeRepoPathKey(state.repoPath));
  if (!entry) return;
  const old = stateFor(entry);
  if (old && old.revision > state.revision) return;
  queryClient.setQueryData(repositoryIconKey(entry.repo), state);
  resolveIcon(entry);
}
function resolveIcon(entry: Observer) {
  const state = stateFor(entry);
  if (
    !current(entry) ||
    !state ||
    entry.resolution ||
    state.thumbnail ||
    state.mode === 'initials' ||
    state.status !== 'ready' ||
    state.revision === entry.attemptedRevision
  )
    return;
  entry.attemptedRevision = state.revision;
  const live = () => current(entry) && stateFor(entry)?.revision === state.revision;
  const paths = state.mode === 'manual' ? (state.manualPath ? [state.manualPath] : []) : state.candidates;
  entry.resolution = (async () => {
    for (const path of paths) {
      if (!live()) return;
      try {
        const preview = await loadRepositoryIconPreview(entry.repo, path);
        if (!live()) return;
        const result = await repositoryIconsClient.cache(entry.repo, {
          path,
          sourceVersion: preview.version,
          selectionVersion: state.selectionVersion,
          expectedRevision: state.revision,
          dataUrl: preview.dataUrl,
        });
        if (current(entry) && result.success) publishRepositoryIcon(result.data);
        return;
      } catch {
        /* A bad automatic candidate must not hide the next usable logo. */
      }
    }
  })().finally(() => {
    entry.resolution = null;
    if (current(entry)) resolveIcon(entry);
  });
}
async function read(entry: Observer, rescan: boolean): Promise<RepositoryIconStateDto> {
  const result = await repositoryIconsClient.get(entry.repo, rescan);
  if (!result.success) throw new Error(result.error || 'Repository logos could not be loaded.');
  if (current(entry)) {
    if (entry.retry) clearTimeout(entry.retry);
    entry.retry = null;
    publishRepositoryIcon(result.data);
  }
  return result.data;
}
export async function refreshRepositoryIcon(repo: string, rescan = false) {
  const entry = observers.get(normalizeRepoPathKey(repo));
  if (!entry) throw new Error('Repository logo is not currently displayed.');
  if (entry.read) {
    if (!rescan) return entry.read;
    await entry.read.catch(() => {});
  }
  const promise = read(entry, rescan);
  entry.read = promise;
  try {
    return await promise;
  } finally {
    if (entry.read === promise) entry.read = null;
  }
}
const refreshObserved = () => {
  if (document.visibilityState === 'hidden') return;
  for (const entry of observers.values()) void refreshRepositoryIcon(entry.repo).catch(() => {});
};
function loadInitial(entry: Observer, remaining = 2) {
  void refreshRepositoryIcon(entry.repo).catch(() => {
    if (!current(entry)) return;
    queryClient.removeQueries({ queryKey: repositoryIconKey(entry.repo), exact: true });
    // New rows can mount before workspace persistence has registered their
    // path in main. Retry briefly, without relaxing the saved-root boundary.
    if (remaining)
      entry.retry = setTimeout(() => {
        entry.retry = null;
        if (current(entry)) loadInitial(entry, remaining - 1);
      }, 750);
  });
}
export function observeRepositoryIcon(repo: string) {
  if (!repositoryIconsClient.isAvailable()) return () => {};
  const key = normalizeRepoPathKey(repo);
  let entry = observers.get(key);
  if (!entry) {
    if (!observers.size) {
      unsubscribe = repositoryIconsClient.subscribe(publishRepositoryIcon);
      window.addEventListener('focus', refreshObserved);
      document.addEventListener('visibilitychange', refreshObserved);
      timer = setInterval(refreshObserved, 60_000);
    }
    entry = { repo, count: 0, active: true, read: null, resolution: null, attemptedRevision: -1, retry: null };
    observers.set(key, entry);
    loadInitial(entry);
  }
  entry.count++;
  const observed = entry;
  return () => {
    if (--observed.count) return;
    observed.active = false;
    if (observed.retry) clearTimeout(observed.retry);
    observers.delete(key);
    // The durable cache is owned by the main process. Drop disconnected state,
    // so a removed/re-added repository cannot inherit its former generation.
    queryClient.removeQueries({ queryKey: repositoryIconKey(repo), exact: true });
    if (!observers.size) {
      unsubscribe?.();
      unsubscribe = null;
      if (timer) clearInterval(timer);
      timer = null;
      window.removeEventListener('focus', refreshObserved);
      document.removeEventListener('visibilitychange', refreshObserved);
    }
  };
}
