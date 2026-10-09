import { create } from 'zustand';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export type AnalyticsTab = 'overview' | 'hotspots' | 'contributions' | 'ownership' | 'churn' | 'coupling' | 'comparison' | 'commits';

export function analyticsSections(tr: (de: string, en: string) => string): { id: AnalyticsTab; label: string }[] {
  return [
    { id: 'overview', label: tr('Überblick', 'Overview') },
    { id: 'hotspots', label: tr('Änderungsschwerpunkte', 'Change hotspots') },
    { id: 'contributions', label: tr('Beiträge', 'Contributions') },
    { id: 'ownership', label: tr('Zuletzt geänderte Zeilen', 'Last changed lines') },
    { id: 'churn', label: 'Code Churn' },
    { id: 'coupling', label: tr('Dateikopplung', 'File coupling') },
    { id: 'comparison', label: tr('Release-Vergleich', 'Release comparison') },
    { id: 'commits', label: 'Commits' },
  ];
}

// Sidebar selections and in-report drilldowns share a session-local, repository-bound route.
export const useAnalyticsNavigation = create<{ sections: Record<string, AnalyticsTab> }>(() => ({ sections: {} }));

export function useAnalyticsTab(repoPath: string | null) {
  const key = repoPath ? normalizeRepoPathKey(repoPath) : '';
  return useAnalyticsNavigation((state) => state.sections[key] ?? 'overview');
}

export function selectAnalyticsTab(repoPath: string | null, tab: AnalyticsTab) {
  if (!repoPath) return;
  const key = normalizeRepoPathKey(repoPath);
  useAnalyticsNavigation.setState((state) => (state.sections[key] === tab ? state : { sections: { ...state.sections, [key]: tab } }));
}
