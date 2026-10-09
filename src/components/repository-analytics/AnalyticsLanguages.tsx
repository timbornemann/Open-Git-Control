import type { CSSProperties } from 'react';
import { useI18n } from '@/i18n';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty, percent, percentWidth } from './AnalyticsCharts';
import './analyticsLanguages.css';

const languageColors: Record<string, string> = {
  TypeScript: 'var(--accent-secondary)',
  JavaScript: 'var(--status-warning)',
  CSS: 'var(--accent-primary)',
  HTML: 'var(--accent-hover)',
  JSON: 'var(--accent-complement)',
  Markdown: 'var(--status-merged)',
  YAML: 'var(--status-success)',
};
const colorFor = (language: string) => languageColors[language] ?? 'var(--status-untracked)';

export function AnalyticsLanguages({ snapshot }: { snapshot: Pick<RepositoryAnalyticsSnapshot, 'project' | 'sections'> }) {
  const { tr, locale } = useI18n();
  const project = snapshot.project;
  const ready = snapshot.sections.includes('project');
  const rows = project.languages.map((language) => ({
    ...language,
    share: project.lines ? language.lines / project.lines : 0,
    color: colorFor(language.language),
  }));
  const shareLabel = (share: number) => (share > 0 && share < 0.001 ? `<${percent(0.001, locale)}` : percent(share, locale));
  const fileKinds = [
    [tr('Binärdateien', 'Binary files'), project.binaryFiles],
    ['LFS', project.lfsFiles],
    [tr('Symlinks', 'Symlinks'), project.symlinks],
    [tr('Submodule', 'Submodules'), project.submodules],
  ] as const;
  return (
    <section className="analytics-section analytics-languages">
      <h3>{tr('Sprachen & Dateitypen', 'Languages & file types')}</h3>
      <p className="analytics-description">
        {tr(
          'Anteile an den versionierten Textzeilen des Projektstands, einschließlich Leerzeilen und Kommentaren.',
          'Share of committed text lines in the project tree, including blank lines and comments.',
        )}
      </p>
      {ready && !!project.lines && (
        <div className="analytics-language-distribution" aria-hidden="true">
          {rows.map((row) => (
            <span key={row.language} style={{ width: percentWidth(row.share), background: row.color }} title={`${row.language} · ${shareLabel(row.share)}`} />
          ))}
        </div>
      )}
      <ul className="analytics-language-list" aria-label={tr('Sprachenverteilung', 'Language distribution')}>
        {rows.map((row) => (
          <li key={row.language} className="analytics-language-item" style={{ '--analytics-language-color': row.color } as CSSProperties}>
            <div className="analytics-language-info">
              <span className="analytics-language-name">
                <span className="analytics-language-swatch" aria-hidden="true" />
                {row.language}
              </span>
              <span className="analytics-language-details">
                {row.files.toLocaleString(locale)} {row.files === 1 ? tr('Datei', 'file') : tr('Dateien', 'files')} · {row.lines.toLocaleString(locale)}{' '}
                {row.lines === 1 ? tr('Zeile', 'line') : tr('Zeilen', 'lines')}
              </span>
            </div>
            <span className="analytics-language-bar" aria-hidden="true">
              <span style={{ width: percentWidth(row.share) }} />
            </span>
            <span className="analytics-language-percent">{shareLabel(row.share)}</span>
          </li>
        ))}
      </ul>
      {!ready ? (
        <AnalyticsEmpty>{tr('Sprachen und Dateitypen werden noch ermittelt…', 'Languages and file types are still being calculated…')}</AnalyticsEmpty>
      ) : !rows.length ? (
        <AnalyticsEmpty>{tr('Keine Textdateien im gewählten Projektstand.', 'No text files in the selected project tree.')}</AnalyticsEmpty>
      ) : null}
      {ready && fileKinds.some(([, files]) => files > 0) && (
        <div className="analytics-file-kinds">
          <h4>{tr('Weitere versionierte Dateien', 'Other committed files')}</h4>
          <dl>
            {fileKinds
              .filter(([, files]) => files > 0)
              .map(([label, files]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{files.toLocaleString(locale)}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </section>
  );
}
