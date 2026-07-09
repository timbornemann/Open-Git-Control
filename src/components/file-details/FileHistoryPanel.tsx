import React from 'react';
import { useI18n } from '@/i18n';
import type { GitFileHistoryEntryDto } from '@/types/git';

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

const normalizeCommitHash = (value: string): string => (value.match(/[0-9a-f]{7,40}/i) || [''])[0];

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
  const { t } = useI18n();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {intro && <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{intro}</span>}
      {loading && (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.loading_history_3ca2a3ab')}</span>
      )}
      {error && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{error}</span>}
      {!loading && !error && entries.length === 0 && (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.no_history_found_a820bc27')}</span>
      )}
      {!loading &&
        !error &&
        entries.map((entry) => {
          const normalizedEntryHash = normalizeCommitHash(entry.hash);
          const isCurrentCommit = Boolean(currentHash && normalizedEntryHash === currentHash);
          return (
            <button
              key={`${entry.hash}-${entry.subject}`}
              onClick={() => normalizedEntryHash && onSelectCommit?.(normalizedEntryHash)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: isCurrentCommit ? '1px solid var(--accent-primary-border)' : '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: isCurrentCommit ? 'var(--accent-primary-soft)' : 'var(--bg-panel)',
                padding: '8px 9px',
                cursor: onSelectCommit && normalizedEntryHash ? 'pointer' : 'default',
                color: 'var(--text-primary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
              disabled={!normalizedEntryHash}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {entry.abbrevHash || (normalizedEntryHash ? normalizedEntryHash.slice(0, 8) : t('generated.components.commitdetails.invalid_4296db6c'))}
                </span>
                {isCurrentCommit && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '1px 6px',
                      borderRadius: 999,
                      backgroundColor: 'var(--accent-primary-soft)',
                      color: 'var(--text-accent)',
                    }}
                  >
                    {t('generated.components.commitdetails.current_53fe57f0')}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.84rem', color: entry.subject ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {entry.subject || t('generated.components.commitdetails.no_message_e74e94fd')}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {entry.author || '-'} | {formatDate(entry.date)}
                {formatRelativeDate ? ` | ${formatRelativeDate(entry.date)}` : ''}
              </span>
            </button>
          );
        })}
    </div>
  );
};
