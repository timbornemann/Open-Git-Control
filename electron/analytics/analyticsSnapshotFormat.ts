import type { RepositoryAnalyticsSnapshot } from '../../src/shared/ipc/repositoryAnalytics';

export function isAnalyticsSnapshot(value: unknown, repoPath?: string): value is RepositoryAnalyticsSnapshot {
  if (!value || typeof value !== 'object' || 'version' in value) return false;
  const snapshot = value as RepositoryAnalyticsSnapshot;
  return Boolean(
    typeof snapshot.id === 'string' &&
    typeof snapshot.repoPath === 'string' &&
    (repoPath === undefined || snapshot.repoPath === repoPath) &&
    snapshot.filters &&
    typeof snapshot.filters === 'object' &&
    !Array.isArray(snapshot.filters) &&
    Array.isArray(snapshot.hotspots) &&
    Array.isArray(snapshot.warnings) &&
    Array.isArray(snapshot.contributors) &&
    Array.isArray(snapshot.authors) &&
    Array.isArray(snapshot.refs) &&
    Array.isArray(snapshot.tags) &&
    Array.isArray(snapshot.periods) &&
    Array.isArray(snapshot.calendar) &&
    Array.isArray(snapshot.coupling) &&
    Array.isArray(snapshot.directories) &&
    Array.isArray(snapshot.sections) &&
    Number.isFinite(snapshot.totals?.commits) &&
    Array.isArray(snapshot.project?.languages) &&
    Array.isArray(snapshot.project?.ownership) &&
    Number.isFinite(snapshot.savedAt),
  );
}
