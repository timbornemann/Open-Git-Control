import { useEffect, useState } from 'react';
import { ArrowUpRight, FileCode2, Link2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { AnalyticsCoupling as Coupling } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty, count, moveChartFocus, percent, percentWidth } from './AnalyticsCharts';
import { couplingPairKey } from './analyticsCouplingLayout';
import { useCouplingScene } from './analyticsCouplingScene';
import { AnalyticsCouplingNetwork } from './AnalyticsCouplingNetwork';
import { couplingSession } from './analyticsCouplingSession';
import './analyticsCoupling.css';

type Props = { rows: Coupling[]; maxCommits: number; loading?: boolean; onPath: (path: string) => void; sessionKey?: string };
const filename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export function AnalyticsCoupling({ rows, maxCommits, loading = false, onPath, sessionKey }: Props) {
  const { tr, locale } = useI18n();
  const { scene, settling, lock } = useCouplingScene(rows, loading, sessionKey);
  const session = couplingSession(sessionKey);
  const [selectedFile, setSelectedFile] = useState(() => session?.selection?.file ?? '');
  const [selectedKey, setSelectedKey] = useState(() => session?.selection?.pair ?? '');
  useEffect(() => {
    if (session) session.selection = { file: selectedFile, pair: selectedKey };
  }, [session, selectedFile, selectedKey]);
  const file = scene.nodes.some((node) => node.path === selectedFile) ? selectedFile : '';
  const ranked = [...rows].sort((a, b) => b.commits - a.commits || couplingPairKey(a).localeCompare(couplingPairKey(b)));
  const connections = file ? ranked.filter((pair) => pair.first === file || pair.second === file) : ranked;
  const selected = connections.find((pair) => couplingPairKey(pair) === selectedKey) ?? connections[0];
  const max = rows.reduce((value, pair) => Math.max(value, pair.commits), Math.max(1, maxCommits));
  const selectFile = (path: string) => {
    lock();
    setSelectedFile(path);
    setSelectedKey('');
  };
  const selectPair = (pair: Coupling) => {
    lock();
    if (file && pair.first !== file && pair.second !== file) setSelectedFile('');
    setSelectedKey(couplingPairKey(pair));
  };
  return (
    <div className="analytics-coupling">
      <div className="analytics-coupling-toolbar">
        <span>
          {count(scene.nodes.length)} {tr('Dateien', 'files')} · {count(rows.length)} {tr('Verbindungen', 'connections')}
        </span>
        <label>
          {tr('Datei auswählen', 'Select file')}
          <select className="ui-field" value={file} onChange={(event) => selectFile(event.target.value)}>
            <option value="">{tr('Alle Verbindungen', 'All connections')}</option>
            {scene.nodes.map((node) => (
              <option key={node.path} value={node.path}>
                {node.path}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="analytics-coupling-workspace">
        <AnalyticsCouplingNetwork
          scene={scene}
          rows={rows}
          file={file}
          selected={selected}
          max={max}
          loading={loading || settling}
          onInteract={lock}
          onSelectFile={selectFile}
          onSelectPair={selectPair}
          sessionKey={sessionKey}
        />
        <aside className="analytics-coupling-details" aria-label={tr('Verbindungsdetails', 'Connection details')}>
          {selected ? (
            <>
              <div className="analytics-coupling-selection">
                <h4>
                  <Link2 size={15} aria-hidden="true" /> {tr('Gemeinsam geändert', 'Changed together')}
                </h4>
                <div className="analytics-coupling-files">
                  {[selected.first, selected.second].map((path) => (
                    <button key={path} type="button" onClick={() => onPath(path)} aria-label={`${tr('Datei analysieren', 'Analyze file')}: ${path}`}>
                      <FileCode2 size={15} aria-hidden="true" />
                      <span>{path}</span>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <dl className="analytics-coupling-metrics">
                  <div>
                    <dt>{tr('Gemeinsame Commits', 'Shared commits')}</dt>
                    <dd className="analytics-coupling-count">{count(selected.commits)}</dd>
                  </div>
                  <div>
                    <dt>{tr('Anteil gemeinsamer Änderungen', 'Share of changes together')}</dt>
                    <dd>{percent(selected.share, locale)}</dd>
                  </div>
                </dl>
                <div className="analytics-coupling-share" aria-hidden="true">
                  <span style={{ width: percentWidth(selected.share) }} />
                </div>
                <p>
                  {tr(
                    'Anteil aller Commits, die mindestens eine dieser beiden Dateien ändern.',
                    'Share of all commits that change at least one of these two files.',
                  )}
                </p>
              </div>
              <div className="analytics-coupling-connections-heading">
                <h4>{file ? tr('Mit dieser Datei geändert', 'Changed with this file') : tr('Verbindungen', 'Connections')}</h4>
                <span>{count(connections.length)}</span>
              </div>
              {file && (
                <p className="analytics-coupling-current-file" title={file}>
                  {file}
                </p>
              )}
              <div className="analytics-coupling-connections" role="group" aria-label={tr('Verbindung auswählen', 'Select connection')}>
                {connections.map((pair) => {
                  const key = couplingPairKey(pair);
                  const label = file ? (pair.first === file ? pair.second : pair.first) : `${filename(pair.first)} ↔ ${filename(pair.second)}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      className="analytics-coupling-connection"
                      aria-pressed={key === couplingPairKey(selected)}
                      title={`${pair.first} ↔ ${pair.second}`}
                      aria-label={`${pair.first} ↔ ${pair.second} · ${count(pair.commits)} ${tr('gemeinsame Commits', 'shared commits')} · ${percent(pair.share, locale)}`}
                      onClick={() => selectPair(pair)}
                      onKeyDown={moveChartFocus}
                    >
                      <span className="analytics-coupling-connection-name">{label}</span>
                      <span>
                        {count(pair.commits)} <small>{tr('Commits', 'commits')}</small>
                      </span>
                      <span className="analytics-coupling-connection-bar" aria-hidden="true">
                        <i style={{ width: percentWidth(pair.commits / max) }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <AnalyticsEmpty>{tr('Wähle eine Verbindung für Details.', 'Select a connection for details.')}</AnalyticsEmpty>
          )}
        </aside>
      </div>
    </div>
  );
}
