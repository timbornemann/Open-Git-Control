import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { Button, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import './analyticsControls.css';

type Props = { filters: AnalyticsFilters; snapshot: RepositoryAnalyticsSnapshot | null; onChange: (filters: AnalyticsFilters) => void; children?: ReactNode };
export function AnalyticsFiltersBar({ filters, snapshot, onChange, children }: Props) {
  const { tr } = useI18n();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
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
  const activeFilters = [
    filters.since || filters.until ? `${filters.since || '…'} – ${filters.until || '…'}` : '',
    filters.author ? (snapshot?.authors.find((author) => author.id === filters.author)?.name ?? tr('Ausgewählte Person', 'Selected person')) : '',
    filters.path,
  ].filter(Boolean);
  return (
    <div className="analytics-filters" aria-label={tr('Analysefilter', 'Analysis filters')}>
      <div className="analytics-toolbar">
        <label className="analytics-scope-filter">
          <span>{tr('Historie', 'History')}</span>
          <select
            className="ui-field"
            aria-label={tr('Historienumfang', 'History scope')}
            value={filters.scope}
            title={filters.scope === 'all' ? tr('Alle vorhandenen Branches', 'All available branches') : filters.scope}
            onChange={(event) => update('scope', event.target.value)}
          >
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
        <label
          className="analytics-project-filter"
          title={tr('Dateien, Textzeilen und Blame stammen aus diesem versionierten Stand.', 'Files, text lines and blame come from this committed tree.')}
        >
          <span>{tr('Projektstand', 'Project tree')}</span>
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
        <Button
          size="xs"
          variant="ghost"
          className={`analytics-filter-toggle${activeFilters.length ? ' is-active' : ''}`}
          icon={<Filter size={13} />}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((value) => !value)}
        >
          {tr('Filter', 'Filters')}
          {!!activeFilters.length && <span className="analytics-filter-count">{activeFilters.length}</span>}
          <ChevronDown size={12} className={expanded ? 'is-expanded' : ''} />
        </Button>
        {!!activeFilters.length && (
          <span className="analytics-filter-summary" title={activeFilters.join(' · ')}>
            {activeFilters.join(' · ')}
          </span>
        )}
        <div className="analytics-toolbar-end">{children}</div>
      </div>
      <div id={panelId} className="analytics-filter-panel" hidden={!expanded} role="group" aria-label={tr('Weitere Filter', 'Additional filters')}>
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
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setPath('');
            setRevision(DEFAULT_ANALYTICS_FILTERS.revision);
            onChange({ ...DEFAULT_ANALYTICS_FILTERS });
          }}
        >
          {tr('Zurücksetzen', 'Reset')}
        </Button>
      </div>
      <datalist id="analytics-revisions">
        {revisions.map((revision) => (
          <option key={revision} value={revision} />
        ))}
      </datalist>
    </div>
  );
}
