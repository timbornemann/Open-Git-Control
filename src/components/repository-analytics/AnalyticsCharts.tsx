import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import type { AnalyticsFilters, AnalyticsPeriod, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';

export const count = (value: number) => value.toLocaleString();
export const percent = (value: number, locale?: string) => `${(100 * value).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
export const percentWidth = (value: number) => `${100 * Math.max(0, Math.min(1, value))}%`;
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
export function moveChartFocus(event: React.KeyboardEvent<HTMLButtonElement>, verticalStride = 1) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')];
  const index = buttons.indexOf(event.currentTarget);
  const stride = ['ArrowUp', 'ArrowDown'].includes(event.key) ? verticalStride : 1;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -stride : stride);
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
function PeriodDateAxis({ start, columns, interval }: { start: string; columns: number; interval: 'day' | 'week' | 'month' }) {
  const { locale } = useI18n();
  const axisRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const axis = axisRef.current!;
    const measure = () => {
      if (axis.clientWidth) setWidth(axis.clientWidth);
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(axis);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const ticks = Math.min(columns, Math.max(2, Math.min(12, Math.floor(width / 100))));
  const formatter = new Intl.DateTimeFormat(locale, {
    month: interval === 'month' ? 'short' : '2-digit',
    ...(interval === 'month' ? {} : { day: '2-digit' as const }),
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <div ref={axisRef} className="analytics-period-axis" aria-hidden="true">
      {Array.from({ length: ticks }, (_, index) => {
        const column = ticks === 1 ? 0 : Math.round((index * (columns - 1)) / (ticks - 1));
        const date = new Date(`${start}T00:00:00Z`);
        if (interval === 'month') date.setUTCMonth(date.getUTCMonth() + column);
        else date.setUTCDate(date.getUTCDate() + column * (interval === 'week' ? 7 : 1));
        return (
          <span
            key={column}
            data-date={date.toISOString().slice(0, 10)}
            className={ticks > 1 ? (index === 0 ? 'is-first' : index === ticks - 1 ? 'is-last' : undefined) : undefined}
            style={{ left: `${((column + 0.5) / columns) * 100}%` }}
          >
            <span>{formatter.format(date)}</span>
          </span>
        );
      })}
    </div>
  );
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
  const first = ordinal(periods[0].date, interval);
  const columns = Math.round(ordinal(periods[periods.length - 1].date, interval) - first) + 1;
  const columnWidth = Math.max(28, count(max).length * 7 + 8);
  const headings = [tr('Zeitraum', 'Period'), 'Commits', tr('Merges', 'Merges'), tr('Hinzugefügt', 'Added'), tr('Gelöscht', 'Deleted')];
  return (
    <>
      <div
        className="analytics-chart"
        aria-label={churn ? tr('Code Churn über Zeit', 'Code churn over time') : tr('Beiträge über Zeit', 'Contributions over time')}
      >
        <div className="analytics-period-plot" style={churn ? undefined : { minWidth: `${columns * columnWidth}px` }}>
          <div
            className={`analytics-bars${churn ? ' analytics-bars--churn' : ' analytics-bars--activity'}`}
            style={churn ? undefined : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {periods.map((period, index) => {
              const gap = index ? Math.max(0, Math.round(ordinal(period.date, interval) - ordinal(periods[index - 1].date, interval)) - 1) : 0;
              return (
                <Fragment key={period.date}>
                  {gap > 0 && (
                    <span
                      aria-hidden="true"
                      className="analytics-period-gap"
                      style={
                        churn
                          ? { flex: `${gap} 0 ${gap * 6}px` }
                          : { gridColumn: `${Math.round(ordinal(period.date, interval) - first) - gap + 1} / span ${gap}` }
                      }
                    />
                  )}
                  <button
                    key={period.date}
                    className="analytics-bar"
                    style={churn ? undefined : { gridColumn: Math.round(ordinal(period.date, interval) - first) + 1 }}
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
                      <span className="analytics-bar-activity" style={{ height: `${Math.max(1, (period.commits / max) * 80)}%` }}>
                        <span className="analytics-bar-value" aria-hidden="true">
                          {count(period.commits)}
                        </span>
                      </span>
                    )}
                  </button>
                </Fragment>
              );
            })}
          </div>
          {churn ? (
            <div className="analytics-axis">
              <span>{periods[0].date}</span>
              <span>{periods[periods.length - 1].date}</span>
            </div>
          ) : (
            <PeriodDateAxis start={periods[0].date} columns={columns} interval={interval} />
          )}
        </div>
      </div>
      {churn && (
        <div className="analytics-legend">
          <span className="analytics-added">+ {tr('Hinzugefügt', 'Added')}</span>
          <span className="analytics-deleted">− {tr('Gelöscht', 'Deleted')}</span>
        </div>
      )}
      {churn && (
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
      )}
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
