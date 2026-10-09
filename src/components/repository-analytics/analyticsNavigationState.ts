import { create } from 'zustand';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export type AnalyticsTab = 'overview' | 'hotspots' | 'contributions' | 'churn' | 'coupling' | 'comparison';

export function analyticsSections(tr: (de: string, en: string) => string): { id: AnalyticsTab; label: string }[] {
  return [
    { id: 'overview', label: tr('Überblick', 'Overview') },
    { id: 'hotspots', label: tr('Änderungsschwerpunkte', 'Change hotspots') },
    { id: 'contributions', label: tr('Beiträge', 'Contributions') },
    { id: 'churn', label: 'Code Churn' },
    { id: 'coupling', label: tr('Dateikopplung', 'File coupling') },
    { id: 'comparison', label: tr('Release-Vergleich', 'Release comparison') },
  ];
}

// Sidebar selections and in-report drilldowns share a session-local, repository-bound route.
// A former line-attribution selection opens Contributions for the remainder of that session.
export const useAnalyticsNavigation = create<{ sections: Record<string, AnalyticsTab | 'ownership'> }>(() => ({ sections: {} }));

export function useAnalyticsTab(repoPath: string | null) {
  const key = repoPath ? normalizeRepoPathKey(repoPath) : '';
  return useAnalyticsNavigation((state) => {
    const tab = state.sections[key] ?? 'overview';
    return tab === 'ownership' ? 'contributions' : tab;
  });
}

export function selectAnalyticsTab(repoPath: string | null, tab: AnalyticsTab) {
  if (!repoPath) return;
  const key = normalizeRepoPathKey(repoPath);
  useAnalyticsNavigation.setState((state) => (state.sections[key] === tab ? state : { sections: { ...state.sections, [key]: tab } }));
}
