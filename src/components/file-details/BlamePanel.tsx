import React from 'react';
import { useI18n } from '@/i18n';
import type { GitFileBlameLineDto } from '@/types/git';

type BlamePanelProps = {
  lines: GitFileBlameLineDto[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  intro?: string;
  variant?: 'compact' | 'detailed';
  formatBlameDate?: (authorTime: string) => string;
  onLoadMore: () => void;
  onSelectCommit?: (hash: string) => void;
};

export const BlamePanel: React.FC<BlamePanelProps> = ({
  lines,
  loading,
  error,
  hasMore,
  intro,
  variant = 'compact',
  formatBlameDate,
  onLoadMore,
  onSelectCommit,
}) => {
  const { t } = useI18n();
  const isDetailed = variant === 'detailed';
  const gridTemplateColumns = isDetailed ? '56px 80px 120px 60px 1fr' : '50px 72px 1fr';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {intro && <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{intro}</span>}
      {loading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.loading_blame_9947698c')}</span>}
      {error && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{error}</span>}
      {!loading && !error && lines.length === 0 && (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.no_blame_data_found_e996f81f')}</span>
      )}
      {!loading && !error && lines.length > 0 && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
          {isDetailed && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns,
                gap: '8px',
                padding: '6px 8px',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: 'var(--accent-primary-softer)',
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              <span>{t('generated.components.commitdetails.line_84da5e3a')}</span>
              <span>{t('generated.components.commit_graph.commitgraph.commit_b9ec78bd')}</span>
              <span>{t('generated.components.commitdetails.author_7f609ec0')}</span>
              <span>{t('generated.components.commitdetails.date_c70081f3')}</span>
              <span>{t('generated.components.commitdetails.content_72b16731')}</span>
            </div>
          )}
          <div style={{ maxHeight: isDetailed ? '360px' : '420px', overflowY: 'auto' }}>
            {lines.map((line, index) => (
              <div
                key={`${line.lineNumber}-${line.commitHash}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns,
                  gap: '8px',
                  alignItems: 'start',
                  padding: '5px 8px',
                  borderBottom: '1px solid var(--line-subtle)',
                  fontFamily: 'monospace',
                  fontSize: isDetailed ? '0.76rem' : '0.75rem',
                  color: 'var(--text-primary)',
                  backgroundColor: isDetailed && index % 2 !== 0 ? 'var(--accent-primary-softer)' : 'transparent',
                }}
                title={isDetailed ? `${line.author} - ${line.summary}` : undefined}
              >
                <span style={{ color: 'var(--text-secondary)' }}>{line.lineNumber}</span>
                <button
                  onClick={() => onSelectCommit?.(line.commitHash)}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--accent-primary)',
                    textAlign: 'left',
                    cursor: onSelectCommit ? 'pointer' : 'default',
                    fontFamily: 'monospace',
                    fontSize: isDetailed ? '0.76rem' : '0.75rem',
                  }}
                >
                  {line.abbrevHash}
                </button>
                {isDetailed && (
                  <>
                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {line.author || '-'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{formatBlameDate?.(line.authorTime) || '-'}</span>
                  </>
                )}
                <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line.content}</span>
              </div>
            ))}
          </div>
          {hasMore && (
            <button className="staging-tool-btn" onClick={() => void onLoadMore()} disabled={loading} style={{ margin: 8 }}>
              {t('generated.components.commitdetails.load_500_more_lines_16c0eb75')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
