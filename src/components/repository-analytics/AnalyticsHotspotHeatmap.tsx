import { useEffect, useId, useMemo, useState } from 'react';
import { File, Folder, History } from 'lucide-react';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { AnalyticsChanges } from '@/shared/ipc/repositoryAnalytics';
import { count } from './AnalyticsCharts';
import { AnalyticsHotspotTooltip } from './AnalyticsHotspotTooltip';
import { analyticsTreemapLayout, treemapNeighbor, type TreemapRect } from './analyticsTreemapLayout';
import { useAnalyticsSize } from './useAnalyticsSize';
import './analyticsHeatmap.css';

type Target = { path: string; anchor: HTMLButtonElement };
type Props = {
  rows: AnalyticsChanges[];
  maxChanges?: number;
  directory?: boolean;
  preview?: boolean;
  onFile: (path: string, hash: string) => void;
  onPath: (path: string) => void;
};
export function AnalyticsHotspotHeatmap({ rows, maxChanges = 0, directory = false, preview = false, onFile, onPath }: Props) {
  const { tr } = useI18n();
  const { ref, width, height } = useAnalyticsSize();
  const { tiles, groups } = useMemo(() => analyticsTreemapLayout(rows, width, height), [rows, width, height]);
  const position = (rect: TreemapRect) => ({
    left: `${(rect.x / width) * 100}%`,
    top: `${(rect.y / height) * 100}%`,
    width: `${(rect.width / width) * 100}%`,
    height: `${(rect.height / height) * 100}%`,
  });
  const tooltipId = useId();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [hovered, setHovered] = useState<Target | null>(null);
  const [focused, setFocused] = useState<Target | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const target = hovered ?? focused;
  const active = target?.anchor.isConnected ? rows.find((row) => row.path === target.path) : undefined;
  const selected = active ?? rows.find((row) => row.path === selectedPath) ?? rows[0];
  const max = Math.max(1, maxChanges, ...rows.map((row) => row.changes));
  const tooltipVisible = !!active && !!target && !dismissed;
  useEffect(() => {
    if (!tooltipVisible) return;
    const dismiss = () => setDismissed(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [tooltipVisible]);
  if (!rows.length) return null;
  const pathLabel = (row: AnalyticsChanges) => (directory && row.path === '.' ? tr('Repository-Wurzel', 'Repository root') : row.path);
  const changeLabel = (row: AnalyticsChanges) => `${count(row.changes)} ${row.changes === 1 ? tr('Änderung', 'change') : tr('Änderungen', 'changes')}`;
  const open = (row: AnalyticsChanges) => {
    setDismissed(true);
    if (directory) onPath(row.path === '.' ? '' : row.path);
    else onFile(row.path, row.hash);
  };
  return (
    <div className={`analytics-heatmap${preview ? ' analytics-heatmap--preview' : ''}`}>
      <div className="analytics-heatmap-caption">
        <span
          title={tr(
            'Nach Verzeichnissen gruppiert. Fläche und Farbe zeigen Änderungshäufigkeit.',
            'Grouped by directory. Area and color show change frequency.',
          )}
        >
          {preview
            ? `${count(rows.length)} ${rows.length === 1 ? tr('Datei', 'file') : tr('Dateien', 'files')}`
            : tr('Nach Verzeichnissen gruppiert', 'Grouped by directory')}
          {' · '}
          {preview ? tr('Änderungen', 'Changes') : tr('Fläche & Farbe = Änderungen', 'Area & color = changes')}
        </span>
        <div
          className="analytics-heatmap-legend"
          aria-label={`${tr('Farbskala: Änderungshäufigkeit bis', 'Color scale: change frequency up to')} ${count(max)}`}
        >
          <span>{tr('Weniger', 'Fewer')}</span>
          <span className="analytics-heatmap-scale" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((level) => (
              <i key={level} className={`analytics-heatmap-level--${level}`} />
            ))}
          </span>
          <span>{count(max)}</span>
        </div>
      </div>
      <div
        ref={ref}
        className="analytics-heatmap-grid analytics-treemap"
        role="group"
        aria-label={tr('Baumkarte der Änderungsschwerpunkte', 'Change hotspots treemap')}
      >
        {groups.map((group) => (
          <div key={group.path} className="analytics-treemap-group" data-depth={group.depth} style={position(group)} aria-hidden="true">
            {group.label && <span>{group.path}</span>}
          </div>
        ))}
        {tiles.map((tile) => {
          const row = tile.row;
          const level = Math.max(1, Math.min(5, Math.ceil((row.changes / max) * 5)));
          return (
            <button
              key={row.path}
              type="button"
              data-path={row.path}
              style={position(tile)}
              className={`analytics-heatmap-cell analytics-heatmap-level--${level}${selected.path === row.path ? ' is-highlighted' : ''}`}
              aria-label={`${pathLabel(row)}: ${changeLabel(row)}`}
              aria-describedby={tooltipVisible && active.path === row.path ? tooltipId : undefined}
              onMouseEnter={(event) => {
                setHovered({ path: row.path, anchor: event.currentTarget });
                setSelectedPath(row.path);
                setDismissed(false);
              }}
              onMouseLeave={() => setHovered(null)}
              onFocus={(event) => {
                setHovered(null);
                setFocused({ path: row.path, anchor: event.currentTarget });
                setSelectedPath(row.path);
                setDismissed(false);
              }}
              onBlur={() => setFocused(null)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const path = event.key === 'Home' ? rows[0].path : event.key === 'End' ? rows.at(-1)!.path : treemapNeighbor(tiles, row.path, event.key);
                const buttons = event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('.analytics-heatmap-cell');
                [...buttons].find((button) => button.dataset.path === path)?.focus();
              }}
              onClick={() => open(row)}
            >
              {tile.width >= 75 && tile.height >= 42 && <small aria-hidden="true">{row.path.split('/').at(-1)}</small>}
              {tile.width >= 25 && tile.height >= 23 && <span aria-hidden="true">{count(row.changes)}</span>}
            </button>
          );
        })}
      </div>
      <div className="analytics-heatmap-selection">
        {directory ? <Folder size={14} aria-hidden="true" /> : <File size={14} aria-hidden="true" />}
        <div>
          <button className="analytics-link" onClick={() => open(selected)}>
            {pathLabel(selected)}
          </button>
          <span className="analytics-heatmap-selection-meta">
            {changeLabel(selected)} · {count(selected.authors)} {selected.authors === 1 ? tr('Person', 'person') : tr('Personen', 'people')}
          </span>
        </div>
        <Button size="xs" variant="ghost" icon={<History size={13} />} onClick={() => onPath(selected.path === '.' ? '' : selected.path)}>
          {tr('Verlauf', 'History')}
        </Button>
      </div>
      {tooltipVisible && <AnalyticsHotspotTooltip id={tooltipId} anchor={target.anchor} row={active} directory={directory} />}
    </div>
  );
}
