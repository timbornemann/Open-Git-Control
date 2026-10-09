import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters } from '@/shared/ipc/repositoryAnalytics';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { changeAnalyticsFilters, useAnalyticsFilters, useAnalyticsWorkspace } from './analyticsWorkspaceState';
import './analyticsControls.css';

export function RepositoryAnalyticsFilters({ repoPath }: { repoPath: string }) {
  const { tr } = useI18n();
  const filters = useAnalyticsFilters(repoPath);
  const snapshot = useAnalyticsWorkspace((state) => state.snapshots[normalizeRepoPathKey(repoPath)]);
  const onChange = useCallback((value: AnalyticsFilters) => changeAnalyticsFilters(repoPath, value), [repoPath]);
  const [path, setPath] = useState(filters.path);
  const [revision, setRevision] = useState(filters.revision);
  useEffect(() => setPath(filters.path), [filters.path]);
  useEffect(() => setRevision(filters.revision), [filters.revision]);
  useEffect(() => {
    if (path === filters.path) return;
    const timer = setTimeout(() => onChange({ ...filters, path }), 400);
    return () => clearTimeout(timer);
  }, [path, filters, onChange]);
  const revisions = [...new Set([...(snapshot?.refs.map((ref) => ref.name) ?? []), ...(snapshot?.tags.map((tag) => tag.name) ?? [])])];
  const update = (field: keyof AnalyticsFilters, value: string) => onChange({ ...filters, [field]: value });
  return (
    <section className="analytics-filters" aria-label={tr('Analysefilter', 'Analysis filters')}>
      <div className="analytics-filters-heading">
        <h3>{tr('Filter', 'Filters')}</h3>
        <Button
          size="xs"
          variant="ghost"
          icon={<RotateCcw size={12} />}
          aria-label={tr('Filter zurücksetzen', 'Reset filters')}
          onClick={() => {
            setPath('');
            setRevision(DEFAULT_ANALYTICS_FILTERS.revision);
            onChange({ ...DEFAULT_ANALYTICS_FILTERS });
          }}
        >
          {tr('Zurücksetzen', 'Reset')}
        </Button>
      </div>
      <div className="analytics-filter-panel">
        <label>
          {tr('Historienumfang', 'History scope')}
          <select className="ui-field" value={filters.scope} onChange={(event) => update('scope', event.target.value)}>
            <option value="all">{tr('Alle Branches', 'All branches')}</option>
            <option value="HEAD">HEAD</option>
            {!['all', 'HEAD'].includes(filters.scope) && !snapshot?.refs.some((ref) => ref.name === filters.scope) && (
              <option value={filters.scope}>
                {filters.scope} ({tr('nicht verfügbar', 'unavailable')})
              </option>
            )}
            {snapshot?.refs.map((ref) => (
              <option key={ref.name} value={ref.name}>
                {ref.name.replace(/^refs\/(heads|remotes)\//, '')}
              </option>
            ))}
          </select>
        </label>
        <div className="analytics-filter-dates">
          <label>
            {tr('Von', 'From')}
            <TextField type="date" value={filters.since} max={filters.until || undefined} onChange={(event) => update('since', event.target.value)} />
          </label>
          <label>
            {tr('Bis', 'Until')}
            <TextField type="date" value={filters.until} min={filters.since || undefined} onChange={(event) => update('until', event.target.value)} />
          </label>
        </div>
        <label>
          {tr('Person', 'Person')}
          <select className="ui-field" value={filters.author} onChange={(event) => update('author', event.target.value)}>
            <option value="">{tr('Alle Personen', 'All people')}</option>
            {filters.author && !snapshot?.authors.some((author) => author.id === filters.author) && (
              <option value={filters.author}>{tr('Ausgewählte Person', 'Selected person')}</option>
            )}
            {snapshot?.authors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.name} · {author.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('Pfad', 'Path')}
          <TextField value={path} placeholder={tr('Alle Dateien', 'All files')} onChange={(event) => setPath(event.target.value)} />
        </label>
        <label>
          {tr('Zeiträume', 'Periods')}
          <select className="ui-field" value={filters.aggregation} onChange={(event) => update('aggregation', event.target.value)}>
            {[
              ['auto', tr('Automatisch', 'Automatic')],
              ['day', tr('Tage', 'Days')],
              ['week', tr('Wochen', 'Weeks')],
              ['month', tr('Monate', 'Months')],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="analytics-project-filter"
          title={tr('Dateien, Textzeilen und Blame stammen aus diesem versionierten Stand.', 'Files, text lines and blame come from this committed tree.')}
        >
          {tr('Projektstand', 'Project tree')}
          <TextField
            list="analytics-revisions"
            value={revision}
            onBlur={(event) => {
              const value = event.target.value.trim() || 'HEAD';
              setRevision(value);
              if (value !== filters.revision) update('revision', value);
            }}
            onChange={(event) => setRevision(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
      </div>
      <datalist id="analytics-revisions">
        {revisions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </section>
  );
}
