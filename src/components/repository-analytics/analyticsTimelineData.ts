import { gitClient } from '@/services/gitClient';
import type { AnalyticsFilters, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import type { FileTimelineCommit } from '@/components/file-timeline/types';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export const TIMELINE_LIMIT = 5000;
export type TimelineReport = { commits: FileTimelineCommit[]; visibleCommitHashes?: ReadonlySet<string> };
const histories = new Map<string, Promise<FileTimelineCommit[]>>();
const reports = new Map<string, Promise<TimelineReport>>();
const completedReports = new Map<string, TimelineReport>();
export function timelineFilterKey(filters: AnalyticsFilters) {
  return JSON.stringify([filters.scope, filters.revision, filters.since, filters.until, filters.author, filters.path]);
}
export const timelineContextKey = (repoPath: string, filters: AnalyticsFilters) => JSON.stringify([normalizeRepoPathKey(repoPath), timelineFilterKey(filters)]);
function remember<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const saved = cache.get(key);
  if (saved) {
    cache.delete(key);
    cache.set(key, saved);
    return saved;
  }
  const pending = load().catch((error: unknown) => {
    if (cache.get(key) === pending) cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  while (cache.size > 8) cache.delete(cache.keys().next().value!);
  return pending;
}
function reportKey(snapshot: RepositoryAnalyticsSnapshot, filters: AnalyticsFilters) {
  const filtered = !!(filters.scope !== 'all' || filters.since || filters.until || filters.author || filters.path);
  return JSON.stringify([
    normalizeRepoPathKey(snapshot.repoPath),
    snapshot.project.oid || snapshot.head,
    timelineFilterKey(filters),
    filtered ? snapshot.id : '',
  ]);
}
export function readAnalyticsTimeline(snapshot: RepositoryAnalyticsSnapshot, filters: AnalyticsFilters): TimelineReport | undefined {
  return completedReports.get(reportKey(snapshot, filters));
}
export function loadAnalyticsTimeline(snapshot: RepositoryAnalyticsSnapshot, filters: AnalyticsFilters): Promise<TimelineReport> {
  const source = snapshot.project.oid || snapshot.head;
  const historyKey = JSON.stringify([normalizeRepoPathKey(snapshot.repoPath), source]);
  const filtered = !!(filters.scope !== 'all' || filters.since || filters.until || filters.author || filters.path);
  const key = reportKey(snapshot, filters);
  return remember(reports, key, async () => {
    const commits = await remember(histories, historyKey, async () => {
      if (!source) return [];
      const result = await gitClient.getFileTimelineData(TIMELINE_LIMIT, snapshot.repoPath, source);
      if (!result.success) throw new Error(result.error ?? 'The timeline could not be read.');
      return [...result.data].reverse();
    });
    if (!filtered || !commits.length) return { commits };
    // Filter playback positions, not the changes needed to reconstruct each actual repository state.
    const targets = new Set(commits.map((commit) => commit.hash));
    const visible = new Set<string>();
    for (let offset = 0; ;) {
      const result = await gitClient.getRepositoryAnalyticsDetails({
        repoPath: snapshot.repoPath,
        snapshotId: snapshot.id,
        kind: 'commits',
        offset,
        limit: 200,
      });
      if (!result.success) throw new Error(result.error ?? 'The timeline filters could not be read.');
      for (const item of result.data.items) if ('hash' in item && targets.has(item.hash)) visible.add(item.hash);
      offset += result.data.items.length;
      if (offset >= result.data.total || visible.size === targets.size) break;
      if (!result.data.items.length) throw new Error('The timeline filter response is incomplete.');
    }
    return { commits, visibleCommitHashes: visible };
  }).then((data) => {
    completedReports.delete(key);
    completedReports.set(key, data);
    while (completedReports.size > 8) completedReports.delete(completedReports.keys().next().value!);
    return data;
  });
}
export function clearAnalyticsTimelines() {
  histories.clear();
  reports.clear();
  completedReports.clear();
}
