import React from 'react';
import { useI18n } from '@/i18n';
import type { GitFileBlameLineDto } from '@/types/git';
import './fileDetailsPanels.css';

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
  const { t, tr } = useI18n();
  const isDetailed = variant === 'detailed';

  return (
    <div className={`file-blame-panel${isDetailed ? ' file-blame-panel--detailed' : ''}`}>
      {intro && <p className="file-detail-panel__intro">{intro}</p>}
      {loading && lines.length === 0 && (
        <p className="file-detail-panel__state" role="status">
          {t('generated.components.commitdetails.loading_blame_9947698c')}
        </p>
      )}
      {error && (
        <p className="file-detail-panel__state file-detail-panel__state--error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && lines.length === 0 && (
        <p className="file-detail-panel__state">{t('generated.components.commitdetails.no_blame_data_found_e996f81f')}</p>
      )}
      {lines.length > 0 && (
        <div className="file-blame-panel__frame">
          <div className="file-blame-panel__lines">
            {lines.map((line) => (
              <div
                key={`${line.lineNumber}-${line.commitHash}`}
                className="file-blame-line"
                title={isDetailed ? `${line.author} - ${line.summary}` : undefined}
              >
                <span className="file-blame-line__number" aria-label={tr(`Zeile ${line.lineNumber}`, `Line ${line.lineNumber}`)}>
                  {line.lineNumber}
                </span>
                <span className="file-blame-line__metadata">
                  <button
                    type="button"
                    className="file-blame-line__commit"
                    onClick={() => onSelectCommit?.(line.commitHash)}
                    disabled={!onSelectCommit}
                    title={tr(`Commit ${line.abbrevHash} öffnen`, `Open commit ${line.abbrevHash}`)}
                    aria-label={tr(`Commit ${line.abbrevHash} öffnen`, `Open commit ${line.abbrevHash}`)}
                  >
                    {line.abbrevHash}
                  </button>
                  {isDetailed && (
                    <>
                      <span className="file-blame-line__author">{line.author || '-'}</span>
                      <span className="file-blame-line__date">{formatBlameDate?.(line.authorTime) || '-'}</span>
                    </>
                  )}
                </span>
                <code className="file-blame-line__content">{line.content || ' '}</code>
              </div>
            ))}
          </div>
          {hasMore && (
            <button type="button" className="staging-tool-btn file-blame-panel__more" onClick={() => void onLoadMore()} disabled={loading}>
              {t('generated.components.commitdetails.load_500_more_lines_16c0eb75')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
