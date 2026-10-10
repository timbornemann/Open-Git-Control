import { useId, useState } from 'react';
import { GitCommitHorizontal, X } from 'lucide-react';
import { Button, IconButton, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';

type Props = {
  label: string;
  value: string;
  source: RepositoryAnalyticsSnapshot | null;
  automatic?: boolean;
  onChange: (value: string) => void;
};
const CUSTOM = '__analytics_custom_revision__';
export function AnalyticsVersionSelect({ label, value, source, automatic = false, onChange }: Props) {
  const { tr, locale } = useI18n();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const { ref, tag, selected, autoTag, oid, date } = versionChoice(value, source);
  const apply = () => {
    if (!draft.trim()) return;
    onChange(draft.trim());
    setEditing(false);
  };
  return (
    <div className="analytics-version-select">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="ui-field"
        value={editing ? CUSTOM : selected}
        onChange={(event) => {
          if (event.target.value === CUSTOM) {
            setDraft(value);
            setEditing(true);
          } else {
            setEditing(false);
            onChange(event.target.value);
          }
        }}
      >
        {automatic && <option value="">{tr('Neuestes erreichbares Release', 'Latest reachable release')}</option>}
        <option value="HEAD">{tr('HEAD · Aktueller Commit', 'HEAD · Current commit')}</option>
        {!!value && value !== 'HEAD' && !ref && !tag && <option value={value}>{value}</option>}
        {!!source?.tags.length && (
          <optgroup label={tr('Lokale Tags', 'Local tags')}>
            {source.tags.map((tag) => (
              <option key={tag.name} value={`refs/tags/${tag.name}`}>
                {tag.name}
              </option>
            ))}
          </optgroup>
        )}
        {!!source?.refs.length && (
          <optgroup label={tr('Branches', 'Branches')}>
            {source.refs.map((ref) => (
              <option key={ref.name} value={ref.name}>
                {ref.name.replace(/^refs\/(heads|remotes)\//, '')}
              </option>
            ))}
          </optgroup>
        )}
        <option value={CUSTOM}>{tr('Andere Revision…', 'Other revision…')}</option>
      </select>
      {editing ? (
        <div className="analytics-version-custom">
          <TextField
            autoFocus
            aria-label={`${label} · ${tr('Revision', 'Revision')}`}
            value={draft}
            placeholder={tr('Tag, Branch oder vollständige Commit-ID', 'Tag, branch or full commit ID')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') apply();
            }}
          />
          <Button size="xs" disabled={!draft.trim()} onClick={apply}>
            {tr('Übernehmen', 'Apply')}
          </Button>
          <IconButton size="xs" icon={<X size={13} />} aria-label={tr('Abbrechen', 'Cancel')} onClick={() => setEditing(false)} />
        </div>
      ) : (
        <div className="analytics-version-meta">
          {oid && (
            <>
              <GitCommitHorizontal size={13} aria-hidden="true" />
              <code title={oid}>{oid.slice(0, 8)}</code>
            </>
          )}
          {autoTag && <span>{autoTag.name}</span>}
          {!!date && <time dateTime={new Date(date).toISOString()}>{new Date(date).toLocaleDateString(locale)}</time>}
        </div>
      )}
    </div>
  );
}

function versionChoice(value: string, source: Props['source']) {
  const ref = source?.refs.find((ref) => ref.name === value || ref.name.replace(/^refs\/(heads|remotes)\//, '') === value);
  const tag = source?.tags.find((tag) => tag.name === value || `refs/tags/${tag.name}` === value);
  const selected = value === 'HEAD' ? value : (ref?.name ?? (tag ? `refs/tags/${tag.name}` : value));
  const autoTag = !value && !source?.filters.compareFrom ? source?.tags.find((tag) => tag.name === source.comparison?.from) : undefined;
  const oid = value === 'HEAD' ? source?.head : (ref?.oid ?? tag?.oid ?? autoTag?.oid ?? (/^[a-f0-9]{40,64}$/.test(value) ? value : ''));
  return { ref, tag, selected, autoTag, oid, date: tag?.date ?? autoTag?.date };
}
