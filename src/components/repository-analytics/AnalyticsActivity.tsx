import { useI18n } from '@/i18n';
import type { AnalyticsFilters, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { ActivityCalendar, PeriodChart, periodInterval } from './AnalyticsCharts';
import { AnalyticsContributors } from './AnalyticsContributors';

type Props = { snapshot: RepositoryAnalyticsSnapshot; onPerson: (id: string) => void; onPeriod: (date: string) => void; onDay?: (date: string) => void };
export function AnalyticsContributions({ snapshot, onPerson, onPeriod, onDay = onPeriod }: Props) {
  const { tr } = useI18n();
  return (
    <>
      <section className="analytics-section">
        <ActivityCalendar periods={snapshot.calendar} onSelect={onDay} />
      </section>
      <section className="analytics-section">
        <h3>{tr('Beiträge über Zeit', 'Contributions over time')}</h3>
        <PeriodChart periods={snapshot.periods} interval={periodInterval(snapshot)} onSelect={onPeriod} />
      </section>
      <AnalyticsContributors snapshot={snapshot} onPerson={onPerson} />
    </>
  );
}
export function periodRange(date: string, snapshot: RepositoryAnalyticsSnapshot, aggregation: AnalyticsFilters['aggregation']) {
  const span = snapshot.totals.lastActivity - snapshot.totals.firstActivity;
  const effective = aggregation === 'auto' ? (span > 365 * 86400000 ? 'month' : span > 90 * 86400000 ? 'week' : 'day') : aggregation;
  const end = new Date(`${date}T12:00:00`);
  if (effective === 'month') end.setMonth(end.getMonth() + 1, 0);
  if (effective === 'week') end.setDate(end.getDate() + 6);
  return { since: date, until: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` };
}
