import { AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { AnalyticsFilters, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { useAnalyticsWorkspace } from './analyticsWorkspaceState';
import { AnalyticsVersionSelect } from './AnalyticsVersionSelect';
import { ComparisonAreas, ComparisonFileChanges, ComparisonLineChanges } from './AnalyticsComparisonCharts';
import { count, AnalyticsEmpty } from './AnalyticsCharts';
import './analyticsComparison.css';

type Props = {
  repoPath: string;
  snapshot: RepositoryAnalyticsSnapshot | null;
  filters: AnalyticsFilters;
  loading: boolean;
  onChange: (value: AnalyticsFilters) => void;
};
export function AnalyticsReleaseComparison({ repoPath, snapshot, filters, loading, onChange }: Props) {
  const { tr } = useI18n();
  const saved = useAnalyticsWorkspace((state) => state.snapshots[normalizeRepoPathKey(repoPath)]);
  const source = snapshot ?? saved ?? null;
  const comparison = snapshot?.comparison;
  const net = comparison ? comparison.additions - comparison.deletions : 0;
  const automaticTag = source?.tags.find((tag) => tag.name === source.comparison?.from);
  const from = filters.compareFrom || (automaticTag ? `refs/tags/${automaticTag.name}` : source?.comparison?.from) || '';
  const metrics = comparison
    ? [
        { label: tr('Neue Commits', 'New commits'), value: count(comparison.commits), className: '' },
        { label: tr('Mitwirkende', 'Contributors'), value: count(comparison.contributors), className: '' },
        { label: tr('Geänderte Dateien', 'Changed files'), value: count(comparison.files), className: '' },
        {
          label: tr('Nettozeilen', 'Net lines'),
          value: `${net ? (net > 0 ? '+' : '−') : ''}${count(Math.abs(net))}`,
          className: net > 0 ? 'analytics-added' : net < 0 ? 'analytics-deleted' : '',
        },
      ]
    : [];
  return (
    <section className="analytics-section analytics-release-comparison">
      <div className="analytics-comparison-heading">
        <h3>{tr('Release-Vergleich', 'Release comparison')}</h3>
        <p>{tr('Neue Commits und Nettoänderungen zwischen zwei versionierten Ständen.', 'New commits and net changes between two committed versions.')}</p>
      </div>
      <div className="analytics-comparison-picker">
        <AnalyticsVersionSelect
          label={tr('Von Version', 'From version')}
          automatic
          value={filters.compareFrom}
          source={source}
          onChange={(compareFrom) => onChange({ ...filters, compareFrom })}
        />
        <IconButton
          className="analytics-comparison-swap"
          icon={<ArrowLeftRight size={17} />}
          aria-label={tr('Versionen tauschen', 'Swap versions')}
          disabled={!comparison || !from}
          onClick={() => onChange({ ...filters, compareFrom: filters.compareTo || 'HEAD', compareTo: from })}
        />
        <AnalyticsVersionSelect
          label={tr('Bis Version', 'To version')}
          value={filters.compareTo || 'HEAD'}
          source={source}
          onChange={(compareTo) => onChange({ ...filters, compareTo })}
        />
      </div>
      {comparison ? (
        <div className="analytics-comparison-results">
          {!comparison.ancestor && (
            <p className="analytics-comparison-warning" role="note">
              <AlertTriangle size={15} aria-hidden="true" />
              {tr(
                'Die Zielversion baut nicht auf der Ausgangsversion auf. Neue Commits und Nettoänderungen beschreiben unterschiedliche Teile der Historie.',
                'The target version does not build on the base version. New commits and net changes describe different parts of the history.',
              )}
            </p>
          )}
          <dl className="analytics-comparison-metrics">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd className={metric.className}>{metric.value}</dd>
              </div>
            ))}
          </dl>
          <div className="analytics-comparison-charts">
            <ComparisonLineChanges comparison={comparison} />
            {comparison.summary && <ComparisonFileChanges comparison={comparison} />}
          </div>
          {comparison.summary && <ComparisonAreas comparison={comparison} />}
        </div>
      ) : (
        <div className="analytics-comparison-placeholder" role="status" aria-busy={loading}>
          <AnalyticsEmpty>
            {loading
              ? tr('Versionen werden verglichen…', 'Comparing versions…')
              : tr('Wähle zwei lokale Tags, Branches oder Commit-IDs für den Vergleich.', 'Choose two local tags, branches or commit IDs to compare.')}
          </AnalyticsEmpty>
        </div>
      )}
    </section>
  );
}
