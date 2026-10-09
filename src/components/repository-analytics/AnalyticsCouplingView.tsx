import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsCoupling } from './AnalyticsCoupling';
import { count } from './AnalyticsCharts';
import { useAnalyticsCoupling } from './useAnalyticsCoupling';

export function AnalyticsCouplingView({ snapshot, onPath }: { snapshot: RepositoryAnalyticsSnapshot; onPath: (path: string) => void }) {
  const { tr } = useI18n();
  const { rows, pending, loaded, total, error, retry } = useAnalyticsCoupling(snapshot);
  return (
    <div className="analytics-coupling-host">
      <AnalyticsCoupling rows={rows} maxCommits={snapshot.coupling.reduce((max, pair) => Math.max(max, pair.commits), 0)} loading={pending} onPath={onPath} />
      {(pending || error) && (
        <div className="analytics-coupling-loading" role="status">
          {error ? (
            <>
              <span title={error}>{tr('Nicht alle Verbindungen konnten geladen werden.', 'Not all connections could be loaded.')}</span>
              <Button size="xs" onClick={retry}>
                {tr('Erneut laden', 'Retry loading')}
              </Button>
            </>
          ) : (
            <span>
              {tr('Verbindungen werden geladen…', 'Loading connections…')}
              {total !== null ? ` ${count(loaded)} / ${count(total)}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
