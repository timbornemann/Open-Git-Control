import { useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty, percent, percentWidth } from './AnalyticsCharts';
import './analyticsLanguages.css';
import { groupAnalyticsLanguages } from './analyticsLanguageGroups';
import { useAnalyticsSize } from './useAnalyticsSize';

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

export function AnalyticsLanguages({ snapshot, compact = false }: { snapshot: Pick<RepositoryAnalyticsSnapshot, 'project' | 'sections'>; compact?: boolean }) {
  const { tr, locale } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const { ref, width, height } = useAnalyticsSize(430, 250);
  const project = snapshot.project;
  const ready = snapshot.sections.includes('project');
  const rows = groupAnalyticsLanguages(project.languages, project.lines, tr('Sonstige', 'Other')).map((language) => ({
    ...language,
    share: project.lines ? language.lines / project.lines : 0,
    color: colorFor(language.language),
  }));
  const shareLabel = (share: number) => (share > 0 && share < 0.001 ? `<${percent(0.001, locale)}` : percent(share, locale));
  const columns = compact && width >= 280 && height < rows.length * 51 ? 2 : 1;
  const fitsAll = !compact || Math.ceil(rows.length / columns) * 51 <= height;
  const capacity = fitsAll ? rows.length : Math.max(0, Math.floor((height - 28) / 51)) * columns;
  const limited = rows.length > capacity;
  const other = rows.find((row) => row.members);
  const visible = limited
    ? capacity > 0
      ? [...rows.filter((row) => !row.members).slice(0, capacity - (other ? 1 : 0)), ...(other ? [other] : [])]
      : []
    : rows;
  const fileKinds = [
    [tr('Binärdateien', 'Binary files'), project.binaryFiles],
    ['LFS', project.lfsFiles],
    [tr('Symlinks', 'Symlinks'), project.symlinks],
    [tr('Submodule', 'Submodules'), project.submodules],
  ] as const;
  const languageList = (items: typeof rows, displayColumns = columns) => (
    <ul
      className={`analytics-language-list${compact && displayColumns === 2 ? ' analytics-language-list--columns' : ''}`}
      aria-label={tr('Sprachenverteilung', 'Language distribution')}
    >
      {items.map((row) => (
        <li
          key={row.members ? '__other' : row.language}
          className="analytics-language-item"
          title={row.members?.join(' · ')}
          style={{ '--analytics-language-color': row.color } as CSSProperties}
        >
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
  );
  return (
    <section className={`analytics-section analytics-languages${compact ? ' analytics-languages--compact' : ''}`}>
      <h3>{tr('Sprachen & Dateitypen', 'Languages & file types')}</h3>
      <p
        className="analytics-description"
        title={tr(
          'Anteile an den versionierten Textzeilen des Projektstands, einschließlich Leerzeilen und Kommentaren.',
          'Share of committed text lines in the project tree, including blank lines and comments.',
        )}
      >
        {compact
          ? tr('Anteile an versionierten Textzeilen', 'Share of committed text lines')
          : tr(
              'Anteile an den versionierten Textzeilen des Projektstands, einschließlich Leerzeilen und Kommentaren.',
              'Share of committed text lines in the project tree, including blank lines and comments.',
            )}
      </p>
      {ready && !!project.lines && (
        <div className="analytics-language-distribution" aria-hidden="true">
          {rows.map((row) => (
            <span
              key={row.members ? '__other' : row.language}
              style={{ width: percentWidth(row.share), background: row.color }}
              title={`${row.language} · ${shareLabel(row.share)}`}
            />
          ))}
        </div>
      )}
      <div ref={ref} className="analytics-language-body">
        {languageList(visible)}
        {limited && (
          <Button size="xs" variant="ghost" onClick={() => setShowAll(true)}>
            {tr('Alle Typen anzeigen', 'Show all types')} ({rows.length})
          </Button>
        )}
      </div>
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
      <DialogFrame
        open={showAll}
        title={tr('Sprachen & Dateitypen', 'Languages & file types')}
        onClose={() => setShowAll(false)}
        cancelLabel={tr('Schließen', 'Close')}
      >
        <div className="analytics-languages-expanded">{languageList(rows, 1)}</div>
      </DialogFrame>
    </section>
  );
}
