import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from '@/types/git';
import type { DiffRequest, DiffSource } from '@/types/diff';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { BlamePanel } from './file-details/BlamePanel';
import { FileHistoryPanel } from './file-details/FileHistoryPanel';
import { BLAME_LOOKAHEAD_COUNT, splitBlamePage } from './file-details/blamePagination';

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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<GitFileHistoryEntryDto[]>([]);

  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const [blameLines, setBlameLines] = useState<GitFileBlameLineDto[]>([]);
  const [blameHasMore, setBlameHasMore] = useState(false);
  const requestGenerationRef = useRef(0);

  const { t, locale } = useI18n();

  const sourceLabel = useMemo(
    () =>
      source === 'staged'
        ? t('generated.components.workingtreefiledetails.staged_changes_2b2e99a1')
        : t('generated.components.workingtreefiledetails.unstaged_changes_898c9c1d'),
    [source, t],
  );

  useLayoutEffect(() => {
    requestGenerationRef.current += 1;
    setActiveTab('history');
    setHistoryLoading(false);
    setHistoryError(null);
    setHistoryEntries([]);
    setBlameError(null);
    setBlameLoading(false);
    setBlameLines([]);
    setBlameHasMore(false);
  }, [path, repoPath, source]);

  useEffect(() => {
    if (activeTab !== 'history' || !path || !gitClient.isAvailable()) return;
    const generation = requestGenerationRef.current;
    const isCurrent = () => requestGenerationRef.current === generation;

    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await gitClient.getFileHistory(path, undefined, 80, repoPath);
        if (!isCurrent()) return;
        if (result.success) {
          setHistoryEntries(result.data || []);
        } else {
          setHistoryEntries([]);
          setHistoryError(result.error || t('generated.components.commitdetails.could_not_load_file_history_4fb3f0d4'));
        }
      } catch (fetchError) {
        if (!isCurrent()) return;
        console.error(fetchError);
        setHistoryEntries([]);
        setHistoryError(t('generated.components.commitdetails.could_not_load_file_history_4fb3f0d4'));
      } finally {
        if (isCurrent()) setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [activeTab, path, repoPath, t]);

  useEffect(() => {
    if (activeTab !== 'blame' || !path || !gitClient.isAvailable()) return;
    const generation = requestGenerationRef.current;
    const isCurrent = () => requestGenerationRef.current === generation;

    const fetchBlame = async () => {
      setBlameLoading(true);
      setBlameError(null);
      try {
        const result = await gitClient.getFileBlameRange(path, undefined, 1, BLAME_LOOKAHEAD_COUNT, repoPath, source);
        if (!isCurrent()) return;
        if (result.success) {
          const page = splitBlamePage(result.data || []);
          setBlameLines(page.lines);
          setBlameHasMore(page.hasMore);
        } else {
          setBlameLines([]);
          setBlameError(result.error || t('generated.components.commitdetails.could_not_load_blame_data_b29c2d37'));
        }
      } catch (fetchError) {
        if (!isCurrent()) return;
        console.error(fetchError);
        setBlameLines([]);
        setBlameError(t('generated.components.commitdetails.could_not_load_blame_data_b29c2d37'));
      } finally {
        if (isCurrent()) setBlameLoading(false);
      }
    };

    fetchBlame();
  }, [activeTab, path, repoPath, source, t]);

  const loadMoreBlame = async () => {
    if (blameLoading || !blameHasMore || !gitClient.isAvailable()) return;
    const generation = requestGenerationRef.current;
    const pathAtStart = path;
    setBlameLoading(true);
    try {
      const result = await gitClient.getFileBlameRange(pathAtStart, undefined, blameLines.length + 1, BLAME_LOOKAHEAD_COUNT, repoPath, source);
      if (requestGenerationRef.current !== generation) return;
      if (!result.success) {
        setBlameError(result.error);
        return;
      }
      const page = splitBlamePage(result.data);
      setBlameLines((current) => [...current, ...page.lines]);
      setBlameHasMore(page.hasMore);
    } finally {
      if (requestGenerationRef.current === generation) setBlameLoading(false);
    }
  };

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
        <FileHistoryPanel entries={historyEntries} loading={historyLoading} error={historyError} formatDate={formatDate} onSelectCommit={onSelectCommit} />
      )}

      {activeTab === 'blame' && (
        <BlamePanel
          lines={blameLines}
          loading={blameLoading}
          error={blameError}
          hasMore={blameHasMore}
          onLoadMore={loadMoreBlame}
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
