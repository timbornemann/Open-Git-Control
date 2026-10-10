import { useI18n } from '@/i18n';
import type { AnalyticsComparison } from '@/shared/ipc/repositoryAnalytics';
import { count, percent, percentWidth } from './AnalyticsCharts';

export function ComparisonLineChanges({ comparison }: { comparison: AnalyticsComparison }) {
  const { tr, locale } = useI18n();
  const total = comparison.additions + comparison.deletions;
  const added = total ? comparison.additions / total : 0;
  const deleted = total ? comparison.deletions / total : 0;
  const rows = [
    { label: tr('Hinzugefügt', 'Added'), value: comparison.additions, share: added, className: 'is-added', sign: '+' },
    { label: tr('Gelöscht', 'Deleted'), value: comparison.deletions, share: deleted, className: 'is-deleted', sign: '−' },
  ];
  return (
    <section className="analytics-comparison-panel">
      <h4>{tr('Zeilenänderungen', 'Line changes')}</h4>
      <p>{tr('Nettoänderungen der versionierten Textdateien.', 'Net changes to committed text files.')}</p>
      <div className="analytics-comparison-lines">
        <div
          className="analytics-comparison-ring"
          role="img"
          aria-label={`${count(comparison.additions)} ${tr('hinzugefügte', 'added')}, ${count(comparison.deletions)} ${tr('gelöschte Zeilen', 'deleted lines')}`}
        >
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="64" className="analytics-comparison-ring-track" />
            <circle cx="80" cy="80" r="64" pathLength="100" className="is-added" strokeDasharray={`${added * 100} 100`} />
            <circle cx="80" cy="80" r="64" pathLength="100" className="is-deleted" strokeDasharray={`${deleted * 100} 100`} strokeDashoffset={-added * 100} />
          </svg>
          <div>
            <strong title={count(total)}>{count(total)}</strong>
            <span>{tr('geänderte Zeilen', 'changed lines')}</span>
          </div>
        </div>
        <dl className="analytics-comparison-line-legend">
          {rows.map((row) => (
            <div key={row.className} className={row.className}>
              <dt>
                <i aria-hidden="true" />
                {row.label}
              </dt>
              <dd>
                <strong>
                  {row.sign}
                  {count(row.value)}
                </strong>
                <span>{percent(row.share, locale)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {!total && <p>{tr('Keine Textzeilen verändert.', 'No text line changes.')}</p>}
    </section>
  );
}

export function ComparisonFileChanges({ comparison }: { comparison: AnalyticsComparison }) {
  const { tr, locale } = useI18n();
  const summary = comparison.summary!;
  const rows = [
    { label: tr('Neu', 'Added'), value: summary.fileChanges.added, className: 'is-added' },
    { label: tr('Geändert', 'Modified'), value: summary.fileChanges.modified, className: 'is-modified' },
    { label: tr('Gelöscht', 'Deleted'), value: summary.fileChanges.deleted, className: 'is-deleted' },
    { label: tr('Umbenannt', 'Renamed'), value: summary.fileChanges.renamed, className: 'is-renamed' },
  ];
  return (
    <section className="analytics-comparison-panel">
      <h4>{tr('Dateiänderungen', 'File changes')}</h4>
      <p>{tr('Änderungsarten zwischen den beiden Projektständen.', 'Types of changes between the two project trees.')}</p>
      <ul className="analytics-comparison-file-bars">
        {rows.map((row) => {
          const share = comparison.files ? row.value / comparison.files : 0;
          return (
            <li key={row.className} className={row.className}>
              <div>
                <span>{row.label}</span>
                <strong>{count(row.value)}</strong>
                <small>{percent(share, locale)}</small>
              </div>
              <div className="analytics-comparison-track" aria-hidden="true">
                <span style={{ width: percentWidth(share) }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="analytics-comparison-content-types">
        <span>
          {count(summary.textFiles)} {tr('Textdateien', 'text files')}
        </span>
        <span
          title={tr(
            'Binärdateien, LFS-Inhalte, Symlinks und Submodule liefern keine Textzeilenzahlen.',
            'Binary files, LFS content, symlinks and submodules do not contribute text line counts.',
          )}
        >
          {count(summary.nonTextFiles)} {tr('weitere Einträge', 'other entries')}
        </span>
      </p>
    </section>
  );
}

export function ComparisonAreas({ comparison }: { comparison: AnalyticsComparison }) {
  const { tr, locale } = useI18n();
  const areas = comparison.summary!.areas;
  const rows = areas.slice(0, 5);
  if (areas.length > 5)
    rows.push(
      areas
        .slice(5)
        .reduce(
          (sum, row) => ({ path: '', files: sum.files + row.files, additions: sum.additions + row.additions, deletions: sum.deletions + row.deletions }),
          { path: '', files: 0, additions: 0, deletions: 0 },
        ),
    );
  return (
    <section className="analytics-comparison-panel analytics-comparison-areas">
      <h4>{tr('Betroffene Projektbereiche', 'Affected project areas')}</h4>
      <p>{tr('Verteilung der geänderten Dateien nach oberstem Verzeichnis.', 'Changed files grouped by top-level directory.')}</p>
      {!rows.length && <p>{tr('Beide Projektstände enthalten dieselben Dateien und Inhalte.', 'Both project trees contain the same files and content.')}</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.path}>
            <div className="analytics-comparison-area-heading">
              <strong>{row.path === '.' ? tr('Projektwurzel', 'Project root') : row.path || tr('Weitere Bereiche', 'Other areas')}</strong>
              <span>
                {count(row.files)} {tr('Dateien', 'files')} · {percent(comparison.files ? row.files / comparison.files : 0, locale)}
              </span>
              <span className="analytics-comparison-area-lines">
                <span className="analytics-added">+{count(row.additions)}</span>
                <span className="analytics-deleted">−{count(row.deletions)}</span>
              </span>
            </div>
            <div className="analytics-comparison-track" aria-hidden="true">
              <span style={{ width: percentWidth(comparison.files ? row.files / comparison.files : 0) }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
