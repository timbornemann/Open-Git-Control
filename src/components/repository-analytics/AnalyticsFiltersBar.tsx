import { useEffect, useState } from 'react';
import { Button, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';

type Props = { filters: AnalyticsFilters; snapshot: RepositoryAnalyticsSnapshot | null; onChange: (filters: AnalyticsFilters) => void };
export function AnalyticsFiltersBar({ filters, snapshot, onChange }: Props) {
  const { tr } = useI18n();
  const [path, setPath] = useState(filters.path);
  const [revision, setRevision] = useState(filters.revision);
  useEffect(() => {
    setPath(filters.path);
  }, [filters.path]);
  useEffect(() => {
    setRevision(filters.revision);
  }, [filters.revision]);
  useEffect(() => {
    if (path === filters.path) return;
    const timer = setTimeout(() => onChange({ ...filters, path }), 400);
    return () => clearTimeout(timer);
  }, [path, filters, onChange]);
  const revisions = [...(snapshot?.refs.map((ref) => ref.name) ?? []), ...(snapshot?.tags.map((tag) => tag.name) ?? [])];
  const update = (field: keyof AnalyticsFilters, value: string) => onChange({ ...filters, [field]: value });
  return (
    <div className="analytics-filters" aria-label={tr('Analysefilter', 'Analysis filters')}>
      <label>
        {tr('Historienumfang', 'History scope')}
        <select className="ui-field" value={filters.scope} onChange={(event) => update('scope', event.target.value)}>
          <option value="all">{tr('Alle vorhandenen Branches', 'All available branches')}</option>
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
      <label>
        {tr('Von', 'From')}
        <TextField type="date" value={filters.since} max={filters.until || undefined} onChange={(event) => update('since', event.target.value)} />
      </label>
      <label>
        {tr('Bis', 'Until')}
        <TextField type="date" value={filters.until} min={filters.since || undefined} onChange={(event) => update('until', event.target.value)} />
      </label>
      <label>
        {tr('Person', 'Person')}
        <select className="ui-field" value={filters.author} onChange={(event) => update('author', event.target.value)}>
          <option value="">{tr('Alle Personen', 'All people')}</option>
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
            if (value !== filters.revision) update('revision', value);
          }}
          onChange={(event) => setRevision(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>
      <datalist id="analytics-revisions">
        {revisions.map((revision) => (
          <option key={revision} value={revision} />
        ))}
      </datalist>
      <Button
        size="xs"
        onClick={() => {
          setPath('');
          onChange({ ...DEFAULT_ANALYTICS_FILTERS });
        }}
      >
        {tr('Zurücksetzen', 'Reset')}
      </Button>
    </div>
  );
}
