import { useI18n } from '@/i18n';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { percent, percentWidth, periodInterval } from './AnalyticsCharts';
import { AnalyticsChurnChart } from './AnalyticsChurnChart';
import './analyticsChurn.css';

type ChurnSnapshot = Pick<RepositoryAnalyticsSnapshot, 'additions' | 'deletions' | 'filteredCommits' | 'periods' | 'filters' | 'totals'>;
export function AnalyticsChurn({ snapshot, onPeriod }: { snapshot: ChurnSnapshot; onPeriod: (date: string) => void }) {
  const { tr, locale } = useI18n();
  const format = new Intl.NumberFormat(locale);
  const total = snapshot.additions + snapshot.deletions;
  const net = snapshot.additions - snapshot.deletions;
  const addedShare = total ? snapshot.additions / total : 0;
  const deletedShare = total ? snapshot.deletions / total : 0;
  const metrics = [
    { label: tr('Hinzugefügt', 'Added'), value: `+${format.format(snapshot.additions)}`, color: 'analytics-added' },
    { label: tr('Gelöscht', 'Deleted'), value: `−${format.format(snapshot.deletions)}`, color: 'analytics-deleted' },
    { label: tr('Änderungsmenge', 'Total changes'), value: format.format(total), color: '' },
    {
      label: tr('Nettoveränderung', 'Net change'),
      value: `${net ? (net > 0 ? '+' : '−') : ''}${format.format(Math.abs(net))}`,
      color: net ? (net > 0 ? 'analytics-added' : 'analytics-deleted') : '',
    },
  ];
  return (
    <section className="analytics-section analytics-churn">
      <div className="analytics-churn-heading">
        <h3>Code Churn</h3>
        <span>
          {format.format(snapshot.filteredCommits)} {tr('Commits im Filter', 'commits in filter')}
        </span>
      </div>
      <dl className="analytics-churn-metrics">
        {metrics.map(({ label, value, color }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={color}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="analytics-churn-balance">
        <div className="analytics-churn-balance-labels">
          <span className="analytics-added">
            + {tr('Hinzugefügt', 'Added')} · {percent(addedShare, locale)}
          </span>
          <span className="analytics-deleted">
            − {tr('Gelöscht', 'Deleted')} · {percent(deletedShare, locale)}
          </span>
        </div>
        <div
          className="analytics-churn-balance-track"
          role="img"
          aria-label={`${percent(addedShare, locale)} ${tr('hinzugefügt', 'added')}, ${percent(deletedShare, locale)} ${tr('gelöscht', 'deleted')}`}
        >
          <span className="analytics-churn-balance-added" style={{ width: percentWidth(addedShare) }} />
          <span className="analytics-churn-balance-deleted" style={{ width: percentWidth(deletedShare) }} />
        </div>
      </div>
      <AnalyticsChurnChart periods={snapshot.periods} interval={periodInterval(snapshot)} onSelect={onPeriod} />
      <p className="analytics-churn-note">
        {tr(
          'Zeilenänderungen ohne Merge-Diffs. Binärdateien und LFS-Pointer liefern keine Textzeilenzahlen.',
          'Line changes exclude merge diffs. Binary files and LFS pointers do not contribute text line counts.',
        )}
      </p>
    </section>
  );
}
