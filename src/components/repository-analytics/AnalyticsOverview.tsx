import { useI18n } from '@/i18n';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsTable, PeriodChart, count, dateLabel, percent, periodInterval } from './AnalyticsCharts';

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
    <dl className="analytics-metrics">
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
  const project = snapshot.project;
  return (
    <>
      <section className="analytics-section">
        <h3>{tr('Aktivität', 'Activity')}</h3>
        <p className="analytics-description">
          {dateLabel(snapshot.totals.firstActivity)} → {dateLabel(snapshot.totals.lastActivity)} · {count(snapshot.filteredCommits)}{' '}
          {tr('Commits im Filter', 'commits in filter')} · {count(snapshot.totals.merges)} {tr('Merge-Commits in der Historie', 'merge commits in history')}
        </p>
        <PeriodChart periods={snapshot.periods} interval={periodInterval(snapshot)} onSelect={onPeriod} />
      </section>
      <div className="analytics-columns">
        <section className="analytics-section">
          <h3>{tr('Sprachen & Dateitypen', 'Languages & file types')}</h3>
          <p className="analytics-description">
            {tr(
              'Versionierte Dateien des Projektstands; Textzeilen einschließlich Leerzeilen und Kommentaren.',
              'Committed files of the project tree; text lines include blank lines and comments.',
            )}
          </p>
          <AnalyticsTable headings={[tr('Sprache / Typ', 'Language / type'), tr('Dateien', 'Files'), tr('Zeilen', 'Lines'), tr('Anteil', 'Share')]}>
            {project.languages.map((language) => (
              <tr key={language.language}>
                <td>{language.language}</td>
                <td>{count(language.files)}</td>
                <td>{count(language.lines)}</td>
                <td>
                  <span className="analytics-share">
                    <span style={{ width: percent(project.lines ? language.lines / project.lines : 0) }} />
                  </span>
                  {percent(project.lines ? language.lines / project.lines : 0)}
                </td>
              </tr>
            ))}
            {[
              [tr('Binärdateien', 'Binary files'), project.binaryFiles],
              ['LFS', project.lfsFiles],
              [tr('Symlinks', 'Symlinks'), project.symlinks],
              [tr('Submodule', 'Submodules'), project.submodules],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{value}</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              ))}
          </AnalyticsTable>
        </section>
        <section className="analytics-section">
          <h3>{tr('Änderungsschwerpunkte', 'Change hotspots')}</h3>
          <p className="analytics-description">
            {tr('Häufige Änderungen sind keine Messung der Code-Komplexität.', 'Frequent changes do not measure code complexity.')}
          </p>
          <AnalyticsTable headings={[tr('Datei', 'File'), tr('Änderungen', 'Changes'), tr('Aktionen', 'Actions')]}>
            {snapshot.hotspots.slice(0, 8).map((row) => (
              <tr key={row.path}>
                <td title={row.path}>
                  <button className="analytics-link" onClick={() => onFile(row.path, row.hash)}>
                    {row.path}
                  </button>
                </td>
                <td>{count(row.changes)}</td>
                <td>
                  <button className="analytics-link" onClick={() => onPath(row.path)}>
                    {tr('Verlauf', 'History')}
                  </button>
                </td>
              </tr>
            ))}
          </AnalyticsTable>
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
