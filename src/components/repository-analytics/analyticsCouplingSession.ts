import type { AnalyticsCoupling, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import type { CouplingScene } from './analyticsCouplingGeometry';

export type CouplingLoadState = {
  version: string;
  rows: AnalyticsCoupling[];
  complete: boolean;
  pending: boolean;
  loaded: number;
  total: number | null;
  error: string;
};
export type CouplingSession = {
  data?: CouplingLoadState;
  partial?: { version: string; rows: AnalyticsCoupling[]; offset: number; total: number };
  task?: { version: string; active: boolean };
  failedAttempt?: string;
  listeners: Set<() => void>;
  layout?: { structure: string; scene: CouplingScene; settled: boolean };
  selection?: { file: string; pair: string };
  viewport?: { camera: { x: number; y: number; scale: number }; width: number; height: number; automatic: boolean };
};
// Session-local LRU: tabs share work, while repositories and filters remain isolated.
const sessions = new Map<string, CouplingSession>();
export const couplingContextKey = (snapshot: Pick<RepositoryAnalyticsSnapshot, 'repoPath' | 'filters'>) =>
  JSON.stringify([normalizeRepoPathKey(snapshot.repoPath), snapshot.filters]);
export const couplingDataVersion = (snapshot: RepositoryAnalyticsSnapshot) => snapshot.couplingVersion ?? snapshot.id;

export function couplingSession(key?: string): CouplingSession | undefined {
  if (!key) return;
  const value = sessions.get(key) ?? { listeners: new Set<() => void>() };
  sessions.delete(key);
  sessions.set(key, value);
  for (const [oldKey, old] of sessions) {
    if (sessions.size <= 8) break;
    if (oldKey !== key && !old.listeners.size && !old.task?.active) sessions.delete(oldKey);
  }
  return value;
}

export function clearCouplingSessions() {
  for (const session of sessions.values()) if (session.task) session.task.active = false;
  sessions.clear();
}
