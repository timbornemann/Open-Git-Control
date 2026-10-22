import React from 'react';
import { useI18n } from '@/i18n';
import type { GitFileHistoryEntryDto } from '@/types/git';
import { extractGitObjectId } from '@/utils/gitObjectId';
import './fileDetailsPanels.css';

type FileHistoryPanelProps = {
  entries: GitFileHistoryEntryDto[];
  loading: boolean;
  error: string | null;
  formatDate: (dateString: string) => string;
  formatRelativeDate?: (dateString: string) => string;
  intro?: string;
  currentHash?: string | null;
  onSelectCommit?: (hash: string) => void;
};

const normalizeCommitHash = (value: string): string => extractGitObjectId(value) || '';

export const FileHistoryPanel: React.FC<FileHistoryPanelProps> = ({
  entries,
  loading,
  error,
  formatDate,
  formatRelativeDate,
  intro,
  currentHash,
  onSelectCommit,
}) => {
  const { t, tr } = useI18n();

  return (
    <div className="file-history-panel">
      {intro && <p className="file-detail-panel__intro">{intro}</p>}
      {loading && entries.length === 0 && (
        <p className="file-detail-panel__state" role="status">
          {t('generated.components.commitdetails.loading_history_3ca2a3ab')}
        </p>
      )}
      {error && (
        <p className="file-detail-panel__state file-detail-panel__state--error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && entries.length === 0 && (
        <p className="file-detail-panel__state">{t('generated.components.commitdetails.no_history_found_a820bc27')}</p>
      )}
      {entries.map((entry) => {
        const normalizedEntryHash = normalizeCommitHash(entry.hash);
        const isCurrentCommit = Boolean(currentHash && normalizedEntryHash === currentHash);
        return (
          <button
            type="button"
            key={`${entry.hash}-${entry.subject}`}
            className={`file-history-entry${isCurrentCommit ? ' is-current' : ''}`}
            onClick={() => normalizedEntryHash && onSelectCommit?.(normalizedEntryHash)}
            title={
              onSelectCommit && normalizedEntryHash
                ? tr(`Commit ${normalizedEntryHash.slice(0, 8)} öffnen`, `Open commit ${normalizedEntryHash.slice(0, 8)}`)
                : undefined
            }
            aria-current={isCurrentCommit ? 'true' : undefined}
            disabled={!normalizedEntryHash || !onSelectCommit}
          >
            <span className="file-history-entry__header">
              <code className="file-history-entry__hash">
                {entry.abbrevHash || (normalizedEntryHash ? normalizedEntryHash.slice(0, 8) : t('generated.components.commitdetails.invalid_4296db6c'))}
              </code>
              {isCurrentCommit && <span className="file-history-entry__current">{tr('Ausgewählt', 'Selected')}</span>}
              <time className="file-history-entry__date" dateTime={entry.date || undefined} title={formatDate(entry.date)} aria-label={formatDate(entry.date)}>
                {formatRelativeDate ? formatRelativeDate(entry.date) : formatDate(entry.date)}
              </time>
            </span>
            <span className="file-history-entry__subject">{entry.subject || t('generated.components.commitdetails.no_message_e74e94fd')}</span>
            <span className="file-history-entry__author">{entry.author || '-'}</span>
          </button>
        );
      })}
    </div>
  );
};
