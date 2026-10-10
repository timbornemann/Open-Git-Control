import { useLayoutEffect, useMemo, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { AnalyticsCoupling } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty, count, percent } from './AnalyticsCharts';
import { couplingLabelLayout, couplingPairKey } from './analyticsCouplingLayout';
import type { CouplingScene } from './analyticsCouplingScene';
import { useAnalyticsSize } from './useAnalyticsSize';
import { useCouplingViewport } from './useCouplingViewport';
import './analyticsCouplingViewport.css';

type Props = {
  scene: CouplingScene;
  rows: AnalyticsCoupling[];
  file: string;
  selected?: AnalyticsCoupling;
  max: number;
  loading: boolean;
  onSelectFile: (path: string) => void;
  onSelectPair: (pair: AnalyticsCoupling) => void;
  onInteract: () => void;
};

export function AnalyticsCouplingNetwork({ scene, rows, file, selected, max, loading, onSelectFile, onSelectPair, onInteract }: Props) {
  const { tr, locale } = useI18n();
  const { ref, width, height } = useAnalyticsSize(700, 440);
  const viewport = useCouplingViewport(scene, width, height, loading, ref, onInteract);
  const { camera } = viewport;
  const [hovered, setHovered] = useState(''),
    [focused, setFocused] = useState('');
  const byPath = new Map(scene.nodes.map((node) => [node.path, node]));
  const activeFile = byPath.has(hovered) ? hovered : byPath.has(focused) ? focused : file;
  const related = new Set(
    activeFile ? rows.filter((pair) => pair.first === activeFile || pair.second === activeFile).flatMap((pair) => [pair.first, pair.second]) : [],
  );
  const preferred = activeFile ? [activeFile] : selected ? [selected.first, selected.second] : [];
  const preference = JSON.stringify(preferred);
  const labels = useMemo(() => {
    const paths = JSON.parse(preference) as string[];
    const visible = scene.nodes
      .map((node) => ({ ...node, x: node.x * camera.scale + camera.x, y: node.y * camera.scale + camera.y }))
      .filter((node) => node.x >= 0 && node.x <= width && node.y >= 0 && node.y <= height);
    const budget = camera.scale < 0.3 ? 6 : camera.scale < 0.8 ? 12 : 60;
    return couplingLabelLayout(visible, width, height, paths, Math.max(paths.length, Math.min(budget, Math.floor((width * height) / 9000))), visible);
  }, [scene, preference, camera, width, height]);
  const edgeOpacity = Math.max(0.035, Math.min(0.23, 0.4 / Math.sqrt(Math.max(1, (rows.length * 2) / Math.max(1, scene.nodes.length)))));
  const selectedNode = byPath.get(file);
  const reveal = viewport.reveal;
  const selectedX = selectedNode?.x,
    selectedY = selectedNode?.y;
  useLayoutEffect(() => {
    if (selectedX !== undefined && selectedY !== undefined) reveal({ x: selectedX, y: selectedY });
  }, [file, selectedX, selectedY, reveal]);
  const nodeKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      onSelectFile('');
      setFocused('');
      setHovered('');
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('.analytics-coupling-node')];
    const index = buttons.indexOf(event.currentTarget);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus({ preventScroll: true });
    event.preventDefault();
  };
  return (
    <div className="analytics-coupling-visual">
      <div
        ref={ref}
        className={`analytics-coupling-network${viewport.dragging ? ' is-dragging' : ''}`}
        role="group"
        tabIndex={0}
        aria-label={tr('Netz gemeinsam geänderter Dateien', 'Network of files changed together')}
        aria-busy={loading}
        style={{ '--coupling-edge-opacity': edgeOpacity } as React.CSSProperties}
        {...viewport.interaction}
      >
        <div
          className="analytics-coupling-scene"
          style={{ width: scene.width, height: scene.height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}
        >
          <svg
            viewBox={`${scene.left ?? 0} ${scene.top ?? 0} ${scene.width} ${scene.height}`}
            style={{ left: scene.left ?? 0, top: scene.top ?? 0 }}
            className="analytics-coupling-lines"
            aria-hidden="true"
          >
            {rows.map((pair) => {
              const first = byPath.get(pair.first)!,
                second = byPath.get(pair.second)!;
              const key = couplingPairKey(pair);
              const active = activeFile ? pair.first === activeFile || pair.second === activeFile : !!selected && key === couplingPairKey(selected);
              return (
                <g key={key} className={`analytics-coupling-edge${active ? ' is-active' : ''}${activeFile && !active ? ' is-muted' : ''}`}>
                  <line
                    x1={first.x}
                    y1={first.y}
                    x2={second.x}
                    y2={second.y}
                    strokeWidth={(0.6 + Math.sqrt(pair.commits / max) * (active ? 2 : 1.2)) / camera.scale}
                  />
                  <line
                    className="analytics-coupling-edge-hit"
                    x1={first.x}
                    y1={first.y}
                    x2={second.x}
                    y2={second.y}
                    style={{ strokeWidth: 12 / camera.scale }}
                    onClick={() => onSelectPair(pair)}
                  >
                    <title>{`${pair.first} ↔ ${pair.second}\n${count(pair.commits)} ${tr('gemeinsame Commits', 'shared commits')} · ${percent(pair.share, locale)}`}</title>
                  </line>
                </g>
              );
            })}
          </svg>
          {scene.nodes.map((node) => {
            const active = activeFile ? related.has(node.path) : selected?.first === node.path || selected?.second === node.path;
            return (
              <button
                key={node.path}
                type="button"
                className={`analytics-coupling-node${active ? ' is-active' : ''}${activeFile && !active ? ' is-muted' : ''}`}
                data-path={node.path}
                style={
                  {
                    left: node.x,
                    top: node.y,
                    width: Math.max(12, Math.min(28, 34 * camera.scale)) / camera.scale,
                    height: Math.max(12, Math.min(28, 34 * camera.scale)) / camera.scale,
                    '--coupling-node-size': `${Math.max(3, Math.min(18, 9 + Math.log2(1 + node.connections)) * camera.scale) / camera.scale}px`,
                  } as React.CSSProperties
                }
                aria-label={`${node.path} · ${count(node.connections)} ${node.connections === 1 ? tr('Verbindung', 'connection') : tr('Verbindungen', 'connections')}`}
                aria-pressed={file === node.path}
                title={node.path}
                onClick={() => onSelectFile(node.path)}
                onMouseEnter={() => setHovered(node.path)}
                onMouseLeave={() => setHovered('')}
                onFocus={() => {
                  setFocused(node.path);
                  viewport.reveal(node);
                }}
                onBlur={() => setFocused('')}
                onKeyDown={nodeKey}
              />
            );
          })}
        </div>
        <div className="analytics-coupling-labels" aria-hidden="true">
          {[...labels].map(([path, label]) => (
            <span key={path} className={preferred.includes(path) ? 'is-active' : ''} style={{ left: label.x, top: label.y, width: label.width }}>
              {path.slice(path.lastIndexOf('/') + 1)}
            </span>
          ))}
        </div>
        {!rows.length && (
          <AnalyticsEmpty>
            {loading
              ? tr('Verbindungen werden geladen…', 'Loading connections…')
              : tr('Keine Dateien wurden in mindestens drei gemeinsamen Commits geändert.', 'No files changed together in at least three commits.')}
          </AnalyticsEmpty>
        )}
        <div className="analytics-coupling-viewport-controls" aria-label={tr('Netzansicht', 'Network view')}>
          <Button
            size="xs"
            variant="ghost"
            icon={<Minus size={14} />}
            aria-label={tr('Verkleinern', 'Zoom out')}
            title={tr('Verkleinern', 'Zoom out')}
            disabled={!rows.length}
            onClick={() => viewport.zoom(0.8)}
          />
          <span aria-label={tr('Zoom', 'Zoom')}>{percent(camera.scale, locale)}</span>
          <Button
            size="xs"
            variant="ghost"
            icon={<Plus size={14} />}
            aria-label={tr('Vergrößern', 'Zoom in')}
            title={tr('Vergrößern', 'Zoom in')}
            disabled={!rows.length}
            onClick={() => viewport.zoom(1.25)}
          />
          <Button
            size="xs"
            variant="ghost"
            icon={<Maximize2 size={14} />}
            title={tr('Gesamtes Netz anzeigen', 'Show entire network')}
            disabled={!rows.length}
            onClick={viewport.fit}
          >
            {tr('Gesamtes Netz anzeigen', 'Show entire network')}
          </Button>
        </div>
      </div>
      <div className="analytics-coupling-legend">
        <span className="analytics-coupling-line-scale" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{tr('Dickere Linien = mehr gemeinsame Commits', 'Thicker lines = more shared commits')}</span>
        <span>
          {tr(
            'Mausrad: Zoom · Ziehen: Verschieben · Tastatur: + / −, Pfeiltasten und Pos1',
            'Mouse wheel: zoom · Drag: pan · Keyboard: + / −, arrow keys and Home',
          )}
        </span>
      </div>
    </div>
  );
}
