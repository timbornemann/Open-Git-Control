import { gitClient } from '@/services/gitClient';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { queryClient, readResource } from './queryClient';
import { cancellableRead } from './ipcRead';
import { REPOSITORY_ACTIVITY_METHOD, repositoryActivityKey, type RepositoryActivityResult } from './repositoryActivityCache';
import { repositoryActivityDemand, type RepositoryActivityDemand } from './repositoryActivityDemand';

const POLL_MS = 15_000;
const FAILURE_MS = 60_000;
const MAX_POLL_MS = 300_000;
export type RepositoryActivityMetadata = Readonly<Record<string, { lastOpened: number }>>;
type Stability = { fingerprint: string; unchanged: number };

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
  private unsubscribeDemand?: () => void;
  private stability = new Map<string, Stability>();
  private recent = new Set<string>();
  private preferredRuns = 0;

  constructor(private demand: RepositoryActivityDemand = repositoryActivityDemand) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[1] !== 'git' || event.query.queryKey[3] !== REPOSITORY_ACTIVITY_METHOD || event.type !== 'updated') return;
      const key = String(event.query.queryKey[2]);
      if (event.action.type === 'success') {
        if (event.action.manual || key !== this.running) this.stability.delete(key);
        else this.recordSuccess(key, event.query.state.data as RepositoryActivityResult);
      } else if (event.action.type === 'invalidate' || event.query.state.status === 'error') this.stability.delete(key);
      this.schedule();
    });
    this.unsubscribeDemand = this.demand.subscribe(() => this.schedule());
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.schedule();
  }

  setRepositories(repositories: string[], activeRepo: string | null, ready: boolean, metadata: RepositoryActivityMetadata = {}) {
    const next = new Map(repositories.map((path) => [normalizeRepoPathKey(path), path]));
    for (const [key, path] of this.paths) {
      if (!next.has(key)) {
        this.stability.delete(key);
        queryClient.removeQueries({ queryKey: repositoryActivityKey(path), exact: true });
      }
    }
    this.paths = next;
    const activeKey = normalizeRepoPathKey(activeRepo || '');
    if (activeKey !== this.activeKey) {
      this.stability.delete(this.activeKey);
      this.stability.delete(activeKey);
    }
    this.activeKey = activeKey;
    const lastOpened = new Map<string, number>();
    for (const [path, entry] of Object.entries(metadata)) {
      const key = normalizeRepoPathKey(path);
      if (next.has(key) && key !== activeKey && Number.isFinite(entry.lastOpened) && entry.lastOpened > 0)
        lastOpened.set(key, Math.max(lastOpened.get(key) || 0, entry.lastOpened));
    }
    this.recent = new Set(
      [...lastOpened]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([key]) => key),
    );
    this.ready = ready;
    if (this.running && (!next.has(this.running) || this.running === this.activeKey || !ready)) this.cancelRunning();
    this.schedule();
  }

  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.unsubscribeDemand?.();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.cancelRunning();
    this.stability.clear();
    this.preferredRuns = 0;
  }

  private cancelRunning() {
    if (this.running) void queryClient.cancelQueries({ queryKey: repositoryActivityKey(this.running), exact: true });
  }

  private visibilityChanged = () => {
    if (document.visibilityState === 'hidden') this.cancelRunning();
    this.schedule();
  };

  private canRun() {
    return !this.stopped && this.ready && !this.running && document.visibilityState !== 'hidden' && gitClient.isAvailable();
  }

  private preferred(key: string) {
    return this.recent.has(key) || this.demand.has(key);
  }

  private recordSuccess(key: string, result: RepositoryActivityResult) {
    if (!this.ready || !this.paths.has(key) || key === this.activeKey || document.visibilityState === 'hidden') return;
    const fingerprint = result.success ? result.data.statusFingerprint : undefined;
    if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) this.stability.delete(key);
    else {
      const previous = this.stability.get(key);
      this.stability.set(key, { fingerprint, unchanged: previous?.fingerprint === fingerprint ? Math.min(5, previous.unchanged + 1) : 0 });
    }
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!this.canRun()) return;
    const ordered = [...this.paths]
      .filter(([key]) => key !== this.activeKey)
      .map(([key, path]) => {
        const state = queryClient.getQueryState(repositoryActivityKey(path));
        const failed = state?.status === 'error';
        const checkedAt = failed ? state.errorUpdatedAt : state?.dataUpdatedAt || 0;
        const preferred = this.preferred(key);
        const interval = preferred ? POLL_MS : Math.min(MAX_POLL_MS, POLL_MS * 2 ** (this.stability.get(key)?.unchanged || 0));
        return { key, path, checkedAt, preferred, due: failed ? checkedAt + FAILURE_MS : state?.isInvalidated || !checkedAt ? 0 : checkedAt + interval };
      })
      .sort((a, b) => a.due - b.due || a.checkedAt - b.checkedAt || a.key.localeCompare(b.key));
    const due = ordered.filter((entry) => entry.due <= Date.now());
    const waiting = this.preferredRuns >= 3 ? due.find((entry) => !entry.preferred) : undefined;
    const next = waiting || due.find((entry) => entry.preferred) || ordered[0];
    if (!next) return;
    this.timer = setTimeout(() => void this.check(next.key, next.path), Math.max(0, next.due - Date.now()));
  }

  private async check(key: string, path: string) {
    if (!this.canRun() || !this.paths.has(key) || key === this.activeKey) return;
    this.preferredRuns = this.preferred(key) ? Math.min(3, this.preferredRuns + 1) : 0;
    this.running = key;
    try {
      await readResource<RepositoryActivityResult>(
        repositoryActivityKey(path),
        async (signal) => {
          const result = await cancellableRead(signal, 'speculative', (request) => gitClient.getRepositoryChangeSummary(path, request));
          signal.throwIfAborted();
          if (result.success && normalizeRepoPathKey(result.data.repoPath) !== key)
            return { success: false, error: 'Repository status belongs to another repository.' };
          if (result.success && (!Number.isSafeInteger(result.data.changeCount) || result.data.changeCount < 0))
            return { success: false, error: 'Invalid repository change count.' };
          return result;
        },
        { staleTime: POLL_MS, force: true, priority: 'speculative', automaticRefresh: false },
      );
    } catch {
      if (queryClient.getQueryState(repositoryActivityKey(path))?.status === 'error') this.stability.delete(key);
      // Cancellation belongs to selection/visibility changes. Other errors are
      // retained by the query cache and receive the same bounded backoff.
    } finally {
      this.running = null;
      this.schedule();
    }
  }
}
