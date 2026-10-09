import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters } from '@/shared/ipc/repositoryAnalytics';
import { normalizeRepoPathKey } from '@/utils/repoPath';

const key = (repoPath: string) => `repository-analytics:v1:${normalizeRepoPathKey(repoPath)}`;
export function readAnalyticsFilters(repoPath: string): AnalyticsFilters {
  try {
    const value = JSON.parse(localStorage.getItem(key(repoPath)) ?? '{}');
    const filters = { ...DEFAULT_ANALYTICS_FILTERS };
    for (const field of Object.keys(filters) as (keyof AnalyticsFilters)[]) {
      if (typeof value[field] === 'string' && value[field].length <= 4096) Object.assign(filters, { [field]: value[field] });
    }
    if (!['auto', 'day', 'week', 'month'].includes(filters.aggregation)) filters.aggregation = 'auto';
    return filters;
  } catch {
    return { ...DEFAULT_ANALYTICS_FILTERS };
  }
}
export function saveAnalyticsFilters(repoPath: string, filters: AnalyticsFilters): void {
  try {
    localStorage.setItem(key(repoPath), JSON.stringify(filters));
  } catch {
    /* Analysis also works when local storage is unavailable. */
  }
}
