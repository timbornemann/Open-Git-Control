import { useI18n } from '@/i18n';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty, PeriodChart, count, dateLabel, periodInterval } from './AnalyticsCharts';
import { AnalyticsHotspotHeatmap } from './AnalyticsHotspotHeatmap';
import { AnalyticsLanguages } from './AnalyticsLanguages';

export function AnalyticsMetrics({ snapshot }: { snapshot: RepositoryAnalyticsSnapshot }) {
  const { tr } = useI18n();
  const project = snapshot.sections.includes('project');
  const rows = [
    ['Commits', count(snapshot.totals.commits)],
    [tr('Mitwirkende', 'Contributors'), count(snapshot.totals.contributors)],
    [tr('Lokale Branches', 'Local branches'), count(snapshot.refs.filter((ref) => !ref.remote).length)],
    [tr('Remote-Branches', 'Remote branches'), count(snapshot.refs.filter((ref) => ref.remote).length)],
    ['Tags', count(snapshot.tags.length)],
    [tr('Dateien', 'Files'), project ? count(snapshot.project.files) : '…'],
    [tr('Textzeilen', 'Text lines'), project ? count(snapshot.project.lines) : '…'],
  ];
  return (
    <dl className="analytics-metrics analytics-metrics--cards">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
type Props = {
  snapshot: RepositoryAnalyticsSnapshot;
  onPeriod: (date: string) => void;
  onPath: (path: string) => void;
  onVersion: (tag: string) => void;
  onFile: (path: string, hash: string) => void;
};
export function AnalyticsOverview({ snapshot, onPeriod, onPath, onVersion, onFile }: Props) {
  const { tr } = useI18n();
  return (
    <>
      <AnalyticsMetrics snapshot={snapshot} />
      <section className="analytics-section">
        <h3>{tr('Aktivität', 'Activity')}</h3>
        <p className="analytics-description">
          {dateLabel(snapshot.totals.firstActivity)} → {dateLabel(snapshot.totals.lastActivity)} · {count(snapshot.filteredCommits)}{' '}
          {tr('Commits im Filter', 'commits in filter')} · {count(snapshot.totals.merges)} {tr('Merge-Commits in der Historie', 'merge commits in history')}
        </p>
        <PeriodChart periods={snapshot.periods} interval={periodInterval(snapshot)} onSelect={onPeriod} />
      </section>
      <div className="analytics-columns">
        <AnalyticsLanguages snapshot={snapshot} />
        <section className="analytics-section">
          <h3>{tr('Änderungsschwerpunkte', 'Change hotspots')}</h3>
          <p className="analytics-description">
            {tr('Häufige Änderungen sind keine Messung der Code-Komplexität.', 'Frequent changes do not measure code complexity.')}
          </p>
          <AnalyticsHotspotHeatmap rows={snapshot.hotspots.slice(0, 48)} preview onFile={onFile} onPath={onPath} />
          {!snapshot.hotspots.length && <AnalyticsEmpty>{tr('Keine Einträge für diese Auswahl.', 'No entries for this selection.')}</AnalyticsEmpty>}
        </section>
      </div>
      <section className="analytics-section">
        <h3>{tr('Versionen', 'Versions')}</h3>
        <div className="analytics-versions">
          {snapshot.tags
            .filter((tag) => tag.version)
            .slice(0, 20)
            .map((tag) => (
              <button key={tag.name} className="analytics-link" title={`${tag.name} · ${tag.oid.slice(0, 8)}`} onClick={() => onVersion(tag.name)}>
                {tag.name}
              </button>
            ))}
          {!snapshot.tags.some((tag) => tag.version) && <span>{tr('Keine lokalen Versionstags vorhanden.', 'No local version tags available.')}</span>}
        </div>
      </section>
    </>
  );
}
