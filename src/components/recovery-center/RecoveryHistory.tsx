import { Archive, GitBranch, GitCommitHorizontal, GitMerge, History, Search, X } from 'lucide-react';
import { Button, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { formatDate, formatTime } from '@/utils/dateTime';
import {
  formatRecoveryDate,
  getRecoveryActionLabel,
  getRecoveryEntryKey,
  getRecoveryEntryKind,
  getRecoveryLoadViewState,
  getRecoveryDescription,
  type RecoveryEntryFilter,
} from './recoveryCenterUtils';
import type { RecoveryCenterState } from './useRecoveryCenter';
import { RecoveryNotice } from './RecoveryNotice';

export function RecoveryHistory({ state }: { state: RecoveryCenterState }) {
  const { locale, tr } = useI18n();
  const { entries, filtered, selectedKey, setSelectedKey, filter, setFilter, source, setSource, isLoading, loadIssue, isBusy, loadReflog } = state;
  const { isInitialLoading, showLoadError, noResults } = getRecoveryLoadViewState(isLoading, entries.length, Boolean(loadIssue), filtered.length);
  const hasBackups = entries.some((entry) => getRecoveryEntryKind(entry) === 'backup');
  const clearFilter = () => {
    setFilter('');
    setSource('all');
  };
  return (
    <aside className="recovery-center__history" aria-labelledby="recovery-history-title">
      <div className="recovery-center__history-toolbar">
        <div className="recovery-center__section-heading">
          <h2 id="recovery-history-title">
            <span className="recovery-center__step">1</span>
            {tr('Stand auswählen', 'Choose a restore point')}
          </h2>
          <span>{tr(`${filtered.length} Einträge`, `${filtered.length} entries`)}</span>
        </div>
        <div className="recovery-center__search">
          <Search size={14} aria-hidden="true" />
          <TextField
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            disabled={isBusy}
            aria-label={tr('Wiederherstellungspunkte durchsuchen', 'Search recovery points')}
            placeholder={tr('Nachricht, Commit oder Datum suchen…', 'Search message, commit or date…')}
          />
          {filter && (
            <button className="recovery-center__clear-search" onClick={() => setFilter('')} disabled={isBusy} aria-label={tr('Suche leeren', 'Clear search')}>
              <X size={13} />
            </button>
          )}
        </div>
        {hasBackups && (
          <select
            className="ui-field"
            aria-label={tr('Art der Wiederherstellungspunkte', 'Recovery point source')}
            value={source}
            disabled={isBusy}
            onChange={(event) => setSource(event.target.value as RecoveryEntryFilter)}
          >
            <option value="all">{tr('Alle Wiederherstellungspunkte', 'All recovery points')}</option>
            <option value="history">{tr('Lokaler Git-Verlauf', 'Local Git history')}</option>
            <option value="backup">{tr('Sicherungen vor Nachrichtenänderungen', 'Backups before message edits')}</option>
          </select>
        )}
      </div>
      <div
        className="recovery-center__history-list"
        aria-busy={isLoading}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !(event.target instanceof HTMLButtonElement)) return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.recovery-center__history-item:not(:disabled)'));
          const current = buttons.indexOf(event.target);
          if (current < 0) return;
          event.preventDefault();
          const index =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
          buttons[index]?.focus();
          buttons[index]?.click();
        }}
      >
        {isInitialLoading ? (
          <div className="recovery-center__loading" aria-label={tr('Wiederherstellungspunkte werden geladen', 'Loading recovery points')}>
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="recovery-center__skeleton">
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : showLoadError ? (
          <RecoveryNotice issue={loadIssue} onRetry={() => void loadReflog()} busy={isLoading || isBusy} />
        ) : noResults ? (
          <div className="recovery-center__empty">
            <History size={24} aria-hidden="true" />
            <strong>
              {entries.length ? tr('Keine passenden Einträge', 'No matching entries') : tr('Noch keine gespeicherten Zustände', 'No restore points yet')}
            </strong>
            <p>
              {entries.length
                ? tr('Versuche einen anderen Suchbegriff oder zeige alle Einträge.', 'Try another search or show all entries.')
                : tr('Nach Commits und Branch-Wechseln findest du hier frühere Zustände.', 'Earlier states appear here after commits and branch switches.')}
            </p>
            {(filter || source !== 'all') && (
              <Button size="sm" onClick={clearFilter}>
                {tr('Alle Einträge anzeigen', 'Show all entries')}
              </Button>
            )}
          </div>
        ) : (
          filtered.map((entry, index) => {
            const key = getRecoveryEntryKey(entry);
            const kind = getRecoveryEntryKind(entry);
            const label = getRecoveryActionLabel(entry, tr);
            const description = getRecoveryDescription(entry, tr);
            const day = formatDate(entry.date, locale, { day: 'numeric', month: 'long', year: 'numeric' });
            const previousDay = index ? formatDate(filtered[index - 1].date, locale, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
            const Icon =
              kind === 'backup' ? Archive : kind === 'commit' ? GitCommitHorizontal : kind === 'merge' ? GitMerge : kind === 'checkout' ? GitBranch : History;
            return (
              <div key={key}>
                {day !== previousDay && <div className="recovery-center__history-day">{day}</div>}
                <button
                  className={`recovery-center__history-item${key === selectedKey ? ' is-selected' : ''}`}
                  disabled={isBusy}
                  aria-pressed={key === selectedKey}
                  onClick={() => setSelectedKey(key)}
                >
                  <span className="recovery-center__history-type">
                    <Icon size={13} aria-hidden="true" />
                    <span>{label}</span>
                    <time dateTime={entry.date} title={formatRecoveryDate(entry.date, locale)}>
                      {formatTime(entry.date, locale, { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </span>
                  <span className="recovery-center__history-subject" title={description}>
                    {description}
                  </span>
                  <code>{entry.abbrevHash}</code>
                </button>
              </div>
            );
          })
        )}
      </div>
      <p className="recovery-center__history-footnote">
        {tr('Lokal gespeicherter Verlauf · neueste Einträge zuerst', 'Locally recorded history · newest first')}
      </p>
    </aside>
  );
}
