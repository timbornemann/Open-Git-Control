import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { DiffRequest, DiffSource } from '@/types/diff';
import { useI18n } from '@/i18n';
import { useFileHistory } from './file-viewer/useFileHistory';
import { useFileBlame } from './file-viewer/useFileBlame';
import { BlamePanel } from './file-details/BlamePanel';
import { FileHistoryPanel } from './file-details/FileHistoryPanel';

type DetailsTab = 'history' | 'blame' | 'patch';

interface WorkingTreeFileDetailsProps {
  repoPath: string;
  path: string;
  source: Extract<DiffSource, 'staged' | 'unstaged'>;
  onSelectCommit?: (hash: string) => void;
  onOpenDiff?: (request: DiffRequest) => void;
}

export const WorkingTreeFileDetails: React.FC<WorkingTreeFileDetailsProps> = ({ repoPath, path, source, onSelectCommit, onOpenDiff }) => {
  const [activeTab, setActiveTab] = useState<DetailsTab>('history');
  const context = useMemo(() => ({ repoPath, path, source }), [repoPath, path, source]);
  const history = useFileHistory(context, activeTab === 'history');
  const blame = useFileBlame(context, activeTab === 'blame');

  const { t, locale } = useI18n();

  const sourceLabel = useMemo(
    () =>
      source === 'staged'
        ? t('generated.components.workingtreefiledetails.staged_changes_2b2e99a1')
        : t('generated.components.workingtreefiledetails.unstaged_changes_898c9c1d'),
    [source, t],
  );

  useLayoutEffect(() => {
    setActiveTab('history');
  }, [path, repoPath, source]);

  useEffect(() => {
    if (activeTab !== 'patch' || !path) return;

    onOpenDiff?.({
      source,
      path,
      title: t('generated.components.workingtreefiledetails.working_tree_diff_c7f9bda9'),
    });
  }, [activeTab, onOpenDiff, path, source, t]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="commit-details-panel" style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{t('generated.components.layout.main.maininspectorpane.file_inspector_57b931aa')}</h4>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{sourceLabel}</span>
        <code
          style={{
            fontSize: '0.76rem',
            color: 'var(--text-primary)',
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            padding: '6px 8px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {path}
        </code>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {(['history', 'blame', 'patch'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              fontSize: '0.78rem',
              padding: '5px 8px',
              borderRadius: '5px',
              border: '1px solid var(--border-color)',
              backgroundColor: activeTab === tab ? 'var(--accent-primary)' : 'var(--bg-panel)',
              color: activeTab === tab ? 'var(--on-accent)' : 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            {tab === 'history' ? t('generated.components.commitdetails.history_83156612') : tab === 'blame' ? 'Blame' : 'Patch'}
          </button>
        ))}
      </div>

      {activeTab === 'history' && (
        <FileHistoryPanel entries={history.entries} loading={history.loading} error={history.error} formatDate={formatDate} onSelectCommit={onSelectCommit} />
      )}

      {activeTab === 'blame' && (
        <BlamePanel
          lines={blame.lines}
          loading={blame.loading}
          error={blame.error}
          hasMore={blame.hasMore}
          onLoadMore={blame.loadMore}
          onSelectCommit={onSelectCommit}
        />
      )}

      {activeTab === 'patch' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            {t('generated.components.commitdetails.diff_opened_in_the_main_window_use_unified_side_by_side_87e4a2ac')}
          </span>
          <button
            className="staging-tool-btn"
            onClick={() => onOpenDiff?.({ source, path, title: t('generated.components.workingtreefiledetails.working_tree_diff_c7f9bda9') })}
          >
            {t('generated.components.commitdetails.show_diff_again_in_main_window_d9b0309b')}
          </button>
        </div>
      )}
    </div>
  );
};
