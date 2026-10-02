import { gitClient } from '@/services/gitClient';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { queryClient, readResource } from './queryClient';
import { cancellableRead } from './ipcRead';
import { REPOSITORY_ACTIVITY_METHOD, repositoryActivityKey, type RepositoryActivityResult } from './repositoryActivityCache';

const POLL_MS = 15_000;
const FAILURE_MS = 60_000;

/** A single lane for inactive repositories. The active workspace keeps its
 * existing snapshot owner; cache observers never start their own polling. */
export class RepositoryActivityCoordinator {
  private paths = new Map<string, string>();
  private activeKey = '';
  private ready = false;
  private stopped = true;
  private running: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe?: () => void;

  start() {
    this.stopped = false;
    this.unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[3] === REPOSITORY_ACTIVITY_METHOD && event.type === 'updated') this.schedule();
    });
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.schedule();
  }

  setRepositories(repositories: string[], activeRepo: string | null, ready: boolean) {
    const next = new Map(repositories.map((path) => [normalizeRepoPathKey(path), path]));
    for (const [key, path] of this.paths) {
      if (!next.has(key)) queryClient.removeQueries({ queryKey: repositoryActivityKey(path), exact: true });
    }
    this.paths = next;
    this.activeKey = normalizeRepoPathKey(activeRepo || '');
    this.ready = ready;
    if (this.running && (!next.has(this.running) || this.running === this.activeKey || !ready)) this.cancelRunning();
    this.schedule();
  }

  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.cancelRunning();
  }

  private cancelRunning() {
    if (this.running) void queryClient.cancelQueries({ queryKey: repositoryActivityKey(this.running), exact: true });
  }

  private visibilityChanged = () => {
    if (document.visibilityState === 'hidden') this.cancelRunning();
    this.schedule();
  };

  private schedule() {
    clearTimeout(this.timer);
    if (this.stopped || !this.ready || this.running || document.visibilityState === 'hidden' || !gitClient.isAvailable()) return;
    const next = [...this.paths]
      .filter(([key]) => key !== this.activeKey)
      .map(([key, path]) => {
        const state = queryClient.getQueryState(repositoryActivityKey(path));
        const failed = state?.status === 'error';
        const checkedAt = failed ? state.errorUpdatedAt : state?.dataUpdatedAt || 0;
        return { key, path, checkedAt, due: failed ? checkedAt + FAILURE_MS : state?.isInvalidated || !checkedAt ? 0 : checkedAt + POLL_MS };
      })
      .sort((a, b) => a.due - b.due || a.checkedAt - b.checkedAt || a.key.localeCompare(b.key))[0];
    if (!next) return;
    this.timer = setTimeout(() => void this.check(next.key, next.path), Math.max(0, next.due - Date.now()));
  }

  private async check(key: string, path: string) {
    if (this.stopped || !this.ready || this.running || !this.paths.has(key) || key === this.activeKey || document.visibilityState === 'hidden') return;
    this.running = key;
    try {
      await readResource<RepositoryActivityResult>(
        repositoryActivityKey(path),
        async (signal) => {
          const result = await cancellableRead(signal, 'speculative', (request) => gitClient.getRepositoryChangeSummary(path, request));
          signal.throwIfAborted();
          if (result.success && normalizeRepoPathKey(result.data.repoPath) !== key)
            return { success: false, error: 'Repository status belongs to another repository.' };
          return result;
        },
        { staleTime: POLL_MS, force: true, priority: 'speculative', automaticRefresh: false },
      );
    } catch {
      // Cancellation belongs to selection/visibility changes. Other errors are
      // retained by the query cache and receive the same bounded backoff.
    } finally {
      this.running = null;
      this.schedule();
    }
  }
}
