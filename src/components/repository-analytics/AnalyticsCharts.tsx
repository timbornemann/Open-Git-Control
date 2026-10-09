import { Fragment, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import type { AnalyticsFilters, AnalyticsPeriod, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';

export const count = (value: number) => value.toLocaleString();
export const percent = (value: number) => `${(100 * value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
export const dateLabel = (date: number) => (date ? new Date(date).toLocaleDateString() : '—');
export function AnalyticsTable({ headings, children, caption }: { headings: string[]; children: React.ReactNode; caption?: string }) {
  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function AnalyticsEmpty({ children }: { children: React.ReactNode }) {
  return <p className="analytics-empty">{children}</p>;
}
function moveChartFocus(event: React.KeyboardEvent<HTMLButtonElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')];
  const index = buttons.indexOf(event.currentTarget);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
  buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
  event.preventDefault();
}
export function periodInterval(snapshot: RepositoryAnalyticsSnapshot): Exclude<AnalyticsFilters['aggregation'], 'auto'> {
  if (snapshot.filters.aggregation !== 'auto') return snapshot.filters.aggregation;
  const span = snapshot.totals.lastActivity - snapshot.totals.firstActivity;
  return span > 365 * 86400000 ? 'month' : span > 90 * 86400000 ? 'week' : 'day';
}
function ordinal(date: string, interval: 'day' | 'week' | 'month') {
  if (interval === 'month') return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
  return Date.parse(`${date}T00:00:00Z`) / (86400000 * (interval === 'week' ? 7 : 1));
}
export function PeriodChart({
  periods,
  churn = false,
  interval = 'day',
  onSelect,
}: {
  periods: AnalyticsPeriod[];
  churn?: boolean;
  interval?: 'day' | 'week' | 'month';
  onSelect: (date: string) => void;
}) {
  const { tr } = useI18n();
  const max = Math.max(1, ...periods.map((period) => (churn ? Math.max(period.additions, period.deletions) : period.commits)));
  if (!periods.length) return <AnalyticsEmpty>{tr('Keine Aktivität im gewählten Zeitraum.', 'No activity in the selected period.')}</AnalyticsEmpty>;
  const headings = [tr('Zeitraum', 'Period'), 'Commits', tr('Merges', 'Merges'), tr('Hinzugefügt', 'Added'), tr('Gelöscht', 'Deleted')];
  return (
    <>
      <div
        className="analytics-chart"
        aria-label={churn ? tr('Code Churn über Zeit', 'Code churn over time') : tr('Beiträge über Zeit', 'Contributions over time')}
      >
        <div className={`analytics-bars${churn ? ' analytics-bars--churn' : ''}`}>
          {periods.map((period, index) => {
            const gap = index ? Math.max(0, Math.round(ordinal(period.date, interval) - ordinal(periods[index - 1].date, interval)) - 1) : 0;
            return (
              <Fragment key={period.date}>
                {gap > 0 && <span aria-hidden="true" className="analytics-period-gap" style={{ flex: `${gap} 0 ${gap * 6}px` }} />}
                <button
                  key={period.date}
                  className="analytics-bar"
                  onClick={() => onSelect(period.date)}
                  onKeyDown={moveChartFocus}
                  title={`${period.date} · ${count(period.commits)} commits · +${count(period.additions)} / −${count(period.deletions)}`}
                  aria-label={`${period.date}: ${count(period.commits)} commits, +${count(period.additions)}, −${count(period.deletions)}`}
                >
                  {churn ? (
                    <>
                      <span className="analytics-bar-added" style={{ height: `${(period.additions / max) * 45}%` }} />
                      <span className="analytics-bar-deleted" style={{ height: `${(period.deletions / max) * 45}%` }} />
                    </>
                  ) : (
                    <span className="analytics-bar-activity" style={{ height: `${Math.max(1, (period.commits / max) * 90)}%` }} />
                  )}
                </button>
              </Fragment>
            );
          })}
        </div>
        <div className="analytics-axis">
          <span>{periods[0].date}</span>
          <span>{periods[periods.length - 1].date}</span>
        </div>
      </div>
      {churn && (
        <div className="analytics-legend">
          <span className="analytics-added">+ {tr('Hinzugefügt', 'Added')}</span>
          <span className="analytics-deleted">− {tr('Gelöscht', 'Deleted')}</span>
        </div>
      )}
      <details className="analytics-data">
        <summary>{tr('Diagrammdaten als Tabelle', 'Chart data as table')}</summary>
        <AnalyticsTable headings={headings}>
          {periods.map((period) => (
            <tr key={period.date}>
              <td>
                <button className="analytics-link" onClick={() => onSelect(period.date)}>
                  {period.date}
                </button>
              </td>
              <td>{count(period.commits)}</td>
              <td>{count(period.merges)}</td>
              <td>{count(period.additions)}</td>
              <td>{count(period.deletions)}</td>
            </tr>
          ))}
        </AnalyticsTable>
      </details>
    </>
  );
}
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function ActivityCalendar({ periods, onSelect }: { periods: AnalyticsPeriod[]; onSelect: (date: string) => void }) {
  const { tr } = useI18n();
  const years = [...new Set(periods.map((period) => Number(period.date.slice(0, 4))))].sort((a, b) => b - a);
  const [selected, setSelected] = useState(0);
  const year = years.includes(selected) ? selected : (years[0] ?? new Date().getFullYear());
  const days = useMemo(() => {
    const rows: { date: string; commits: number }[] = [];
    const map = new Map(periods.map((period) => [period.date, period.commits]));
    for (const date = new Date(year, 0, 1); date.getFullYear() === year; date.setDate(date.getDate() + 1))
      rows.push({ date: localDay(date), commits: map.get(localDay(date)) ?? 0 });
    return rows;
  }, [periods, year]);
  const max = Math.max(1, ...days.map((day) => day.commits));
  return (
    <>
      <div className="analytics-section-toolbar">
        <h3>{tr('Aktivitätskalender', 'Activity calendar')}</h3>
        <label>
          {tr('Jahr', 'Year')}{' '}
          <select className="ui-field" value={year} onChange={(event) => setSelected(Number(event.target.value))}>
            {(years.length ? years : [year]).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="analytics-calendar" aria-label={`${tr('Aktivität', 'Activity')} ${year}`}>
        {days.map((day, index) => (
          <button
            key={day.date}
            className={`analytics-day analytics-day--${day.commits ? Math.max(1, Math.ceil((day.commits / max) * 4)) : 0}`}
            style={index === 0 ? { gridRow: ((new Date(year, 0, 1).getDay() + 6) % 7) + 1 } : undefined}
            onKeyDown={moveChartFocus}
            onClick={() => onSelect(day.date)}
            title={`${day.date}: ${count(day.commits)} commits`}
            aria-label={`${day.date}: ${count(day.commits)} commits`}
          />
        ))}
      </div>
      <div className="analytics-axis">
        <span>{`01.01.${year}`}</span>
        <span>{`31.12.${year}`}</span>
      </div>
      <details className="analytics-data">
        <summary>{tr('Kalenderdaten als Tabelle', 'Calendar data as table')}</summary>
        <AnalyticsTable headings={[tr('Tag', 'Day'), 'Commits']}>
          {days.map((day) => (
            <tr key={day.date}>
              <td>
                <button className="analytics-link" onClick={() => onSelect(day.date)}>
                  {day.date}
                </button>
              </td>
              <td>{count(day.commits)}</td>
            </tr>
          ))}
        </AnalyticsTable>
      </details>
    </>
  );
}
