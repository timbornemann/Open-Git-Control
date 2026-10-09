import { useMemo } from 'react';
import { useI18n } from '@/i18n';
import type { AnalyticsPeriod } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty, PeriodDateAxis, moveChartFocus, periodOrdinal } from './AnalyticsCharts';
import { useAnalyticsSize } from './useAnalyticsSize';

type ChartProps = { periods: AnalyticsPeriod[]; interval: 'day' | 'week' | 'month'; onSelect: (date: string) => void };

function placeValueLabels(periods: AnalyticsPeriod[], positions: number[], columns: number, width: number, format: Intl.NumberFormat) {
  const labels = periods.map((period, index) => {
    const center = ((positions[index] - 0.5) / columns) * width;
    const half = (Math.max(format.format(period.additions).length, format.format(period.deletions).length) * 7 + 20) / 2;
    const labelCenter = width >= half * 2 ? Math.max(half, Math.min(width - half, center)) : width / 2;
    return { index, shift: labelCenter - center, left: labelCenter - half, right: labelCenter + half, visible: false };
  });
  const occupied: typeof labels = [];
  // Keep the largest changes labeled first, then fill the remaining space without overlapping text.
  const priority = [...labels].sort(
    (a, b) => Math.max(periods[b.index].additions, periods[b.index].deletions) - Math.max(periods[a.index].additions, periods[a.index].deletions),
  );
  for (const label of priority) {
    if (width <= 0 || label.right - label.left > width || occupied.some((other) => label.left < other.right + 8 && label.right + 8 > other.left)) continue;
    label.visible = true;
    occupied.push(label);
  }
  return labels;
}

export function AnalyticsChurnChart(props: ChartProps) {
  const { tr } = useI18n();
  const { periods } = props;
  const maximum = periods.reduce((max, period) => Math.max(max, period.additions, period.deletions), 0);
  if (!maximum)
    return (
      <div className="analytics-churn-empty">
        <AnalyticsEmpty>{tr('Keine Textzeilenänderungen für diese Auswahl.', 'No text line changes for this selection.')}</AnalyticsEmpty>
      </div>
    );
  return <ChurnPlot {...props} maximum={maximum} />;
}

function ChurnPlot({ periods, interval, onSelect, maximum }: ChartProps & { maximum: number }) {
  const { tr, locale } = useI18n();
  const { ref, width } = useAnalyticsSize(0, 0);
  const format = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const increment = Math.max(2, magnitude / 5);
  const extent = Math.ceil(maximum / increment) * increment;
  const ticks = [extent, extent / 2, 0, -extent / 2, -extent];
  const first = periodOrdinal(periods[0].date, interval);
  const columns = Math.round(periodOrdinal(periods[periods.length - 1].date, interval) - first) + 1;
  const scaleWidth = Math.max(72, format.format(extent).length * 7 + 24);
  const positions = useMemo(() => periods.map((period) => Math.round(periodOrdinal(period.date, interval) - first) + 1), [periods, interval, first]);
  const labels = useMemo(() => placeValueLabels(periods, positions, columns, width, format), [periods, positions, columns, width, format]);
  const label = {
    day: tr('Zeilenänderungen pro Tag', 'Line changes per day'),
    week: tr('Zeilenänderungen pro Woche', 'Line changes per week'),
    month: tr('Zeilenänderungen pro Monat', 'Line changes per month'),
  }[interval];
  return (
    <div className="analytics-churn-chart">
      <h4>{label}</h4>
      <div className="analytics-churn-viewport" role="region" aria-label={tr('Code Churn über Zeit', 'Code churn over time')} tabIndex={0}>
        <div className="analytics-churn-plot" style={{ gridTemplateColumns: `${scaleWidth}px minmax(0, 1fr)` }}>
          <div className="analytics-churn-scale" aria-hidden="true">
            {ticks.map((value, index) => (
              <span key={value} style={{ top: `${index * 25}%` }}>
                {value === 0 ? '0' : `${value > 0 ? '+' : '−'}${format.format(Math.abs(value))}`}
              </span>
            ))}
          </div>
          <div ref={ref} className="analytics-churn-canvas">
            <div className="analytics-churn-guides" aria-hidden="true">
              {ticks.map((value, index) => (
                <span key={value} className={value === 0 ? 'is-zero' : ''} style={{ top: `${index * 25}%` }} />
              ))}
            </div>
            <div className="analytics-churn-bars" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {periods.map((period, index) => (
                <button
                  key={period.date}
                  className={`analytics-churn-bar${labels[index].visible ? '' : ' is-compact'}`}
                  style={{ gridColumn: positions[index], '--label-shift': `${labels[index].shift}px` } as React.CSSProperties}
                  onClick={() => onSelect(period.date)}
                  onKeyDown={moveChartFocus}
                  title={`${period.date} · +${format.format(period.additions)} ${tr('hinzugefügt', 'added')} · −${format.format(period.deletions)} ${tr('gelöscht', 'deleted')} · ${format.format(period.commits)} commits`}
                  aria-label={`${period.date}: +${format.format(period.additions)} ${tr('hinzugefügt', 'added')}, −${format.format(period.deletions)} ${tr('gelöscht', 'deleted')}, ${format.format(period.commits)} commits`}
                >
                  {period.additions > 0 && (
                    <span className="analytics-churn-added" style={{ height: `${(period.additions / extent) * 50}%` }}>
                      <span className="analytics-churn-value" aria-hidden="true">
                        +{format.format(period.additions)}
                      </span>
                    </span>
                  )}
                  {period.deletions > 0 && (
                    <span className="analytics-churn-deleted" style={{ height: `${(period.deletions / extent) * 50}%` }}>
                      <span className="analytics-churn-value" aria-hidden="true">
                        −{format.format(period.deletions)}
                      </span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <PeriodDateAxis start={periods[0].date} columns={columns} interval={interval} fit />
        </div>
      </div>
    </div>
  );
}
