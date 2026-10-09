import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';
import type { AnalyticsChanges } from '@/shared/ipc/repositoryAnalytics';
import { count, dateLabel } from './AnalyticsCharts';

export function AnalyticsHotspotTooltip({ id, anchor, row, directory }: { id: string; anchor: HTMLElement; row: AnalyticsChanges; directory: boolean }) {
  const { tr } = useI18n();
  const tooltip = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = tooltip.current!;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
      const above = rect.top - height - 10;
      const top = Math.max(12, above >= 12 ? above : Math.min(window.innerHeight - height - 12, rect.bottom + 10));
      setPosition((previous) => (previous.left === left && previous.top === top ? previous : { left, top }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    observer.observe(tooltip.current!);
    return () => observer.disconnect();
  }, [anchor, row]);
  return createPortal(
    <div ref={tooltip} id={id} role="tooltip" className="analytics-heatmap-tooltip" style={position}>
      <strong>{directory && row.path === '.' ? tr('Repository-Wurzel', 'Repository root') : row.path.split('/').at(-1)}</strong>
      <span className="analytics-heatmap-tooltip-path">{row.path}</span>
      {row.oldPath && (
        <span className="analytics-heatmap-tooltip-path">
          {tr('Zuvor', 'Previously')}: {row.oldPath}
        </span>
      )}
      <dl>
        <div>
          <dt>{tr('Änderungen', 'Changes')}</dt>
          <dd>{count(row.changes)}</dd>
        </div>
        <div>
          <dt>{tr('Personen', 'People')}</dt>
          <dd>{count(row.authors)}</dd>
        </div>
        <div>
          <dt>{tr('Zeilen', 'Lines')}</dt>
          <dd>
            {row.binary && !row.additions && !row.deletions ? (
              tr('Binär / LFS', 'Binary / LFS')
            ) : (
              <>
                <span className="analytics-added">+{count(row.additions)}</span> / <span className="analytics-deleted">−{count(row.deletions)}</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>{tr('Letzte Änderung', 'Last change')}</dt>
          <dd>{dateLabel(row.lastChanged)}</dd>
        </div>
      </dl>
      <span className="analytics-heatmap-tooltip-hint">
        {directory
          ? tr('Klicken, um das Verzeichnis auszuwerten', 'Click to analyze directory')
          : tr('Klicken, um die Dateiversion zu öffnen', 'Click to open file version')}
      </span>
    </div>,
    document.body,
  );
}
