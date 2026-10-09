import { useMemo } from 'react';
import { create } from 'zustand';
import type { AnalyticsFilters, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { readAnalyticsFilters, saveAnalyticsFilters } from './analyticsPreferences';

type WorkspaceState = {
  filters: Record<string, AnalyticsFilters>;
  snapshots: Record<string, RepositoryAnalyticsSnapshot>;
};
export const useAnalyticsWorkspace = create<WorkspaceState>(() => ({ filters: {}, snapshots: {} }));

export function useAnalyticsFilters(repoPath: string) {
  const key = normalizeRepoPathKey(repoPath);
  const saved = useMemo(() => readAnalyticsFilters(repoPath), [repoPath]);
  return useAnalyticsWorkspace((state) => state.filters[key] ?? saved);
}
export function changeAnalyticsFilters(repoPath: string, filters: AnalyticsFilters) {
  const key = normalizeRepoPathKey(repoPath);
  const previous = useAnalyticsWorkspace.getState().filters[key] ?? readAnalyticsFilters(repoPath);
  if (JSON.stringify(previous) === JSON.stringify(filters)) return;
  saveAnalyticsFilters(repoPath, filters);
  useAnalyticsWorkspace.setState((state) => ({ filters: { ...state.filters, [key]: filters } }));
}
export function rememberAnalyticsSnapshot(snapshot: RepositoryAnalyticsSnapshot) {
  const key = normalizeRepoPathKey(snapshot.repoPath);
  const state = useAnalyticsWorkspace.getState();
  const filters = state.filters[key] ?? readAnalyticsFilters(snapshot.repoPath);
  if (JSON.stringify(snapshot.filters) !== JSON.stringify(filters) || state.snapshots[key] === snapshot) return;
  useAnalyticsWorkspace.setState({ snapshots: { ...state.snapshots, [key]: snapshot } });
}
