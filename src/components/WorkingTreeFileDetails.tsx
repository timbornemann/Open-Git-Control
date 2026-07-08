import React, { useEffect, useMemo, useState } from 'react';
import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from '@/types/git';
import type { DiffRequest, DiffSource } from '@/types/diff';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';

type DetailsTab = 'history' | 'blame' | 'patch';

interface WorkingTreeFileDetailsProps {
  path: string;
  source: Extract<DiffSource, 'staged' | 'unstaged'>;
  onSelectCommit?: (hash: string) => void;
  onOpenDiff?: (request: DiffRequest) => void;
}

export const WorkingTreeFileDetails: React.FC<WorkingTreeFileDetailsProps> = ({ path, source, onSelectCommit, onOpenDiff }) => {
  const [activeTab, setActiveTab] = useState<DetailsTab>('history');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<GitFileHistoryEntryDto[]>([]);

  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const [blameLines, setBlameLines] = useState<GitFileBlameLineDto[]>([]);
  const [blameHasMore, setBlameHasMore] = useState(false);

  const { t, tr, locale } = useI18n();

  const sourceLabel = useMemo(
    () =>
      source === 'staged'
        ? t('generated.components.workingtreefiledetails.staged_changes_2b2e99a1')
        : t('generated.components.workingtreefiledetails.unstaged_changes_898c9c1d'),
    [source, tr],
  );

  useEffect(() => {
    setActiveTab('history');
    setHistoryError(null);
    setHistoryEntries([]);
    setBlameError(null);
    setBlameLines([]);
    setBlameHasMore(false);
  }, [path, source]);

  useEffect(() => {
    if (activeTab !== 'history' || !path || !gitClient.isAvailable()) return;

    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await gitClient.getFileHistory(path, 'HEAD', 80);
        if (result.success) {
          setHistoryEntries(result.data || []);
        } else {
          setHistoryEntries([]);
          setHistoryError(result.error || t('generated.components.commitdetails.could_not_load_file_history_4fb3f0d4'));
        }
      } catch (fetchError) {
        console.error(fetchError);
        setHistoryEntries([]);
        setHistoryError(t('generated.components.commitdetails.could_not_load_file_history_4fb3f0d4'));
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [activeTab, path, tr]);

  useEffect(() => {
    if (activeTab !== 'blame' || !path || !gitClient.isAvailable()) return;

    const fetchBlame = async () => {
      setBlameLoading(true);
      setBlameError(null);
      try {
        const result = await gitClient.getFileBlameRange(path, 'HEAD', 1, 500);
        if (result.success) {
          setBlameLines(result.data || []);
          setBlameHasMore((result.data || []).length === 500);
        } else {
          setBlameLines([]);
          setBlameError(result.error || t('generated.components.commitdetails.could_not_load_blame_data_b29c2d37'));
        }
      } catch (fetchError) {
        console.error(fetchError);
        setBlameLines([]);
        setBlameError(t('generated.components.commitdetails.could_not_load_blame_data_b29c2d37'));
      } finally {
        setBlameLoading(false);
      }
    };

    fetchBlame();
  }, [activeTab, path, tr]);

  const loadMoreBlame = async () => {
    if (blameLoading || !blameHasMore || !gitClient.isAvailable()) return;
    setBlameLoading(true);
    try {
      const result = await gitClient.getFileBlameRange(path, 'HEAD', blameLines.length + 1, 500);
      if (!result.success) {
        setBlameError(result.error);
        return;
      }
      setBlameLines((current) => [...current, ...result.data]);
      setBlameHasMore(result.data.length === 500);
    } finally {
      setBlameLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'patch' || !path) return;

    onOpenDiff?.({
      source,
      path,
      title: t('generated.components.workingtreefiledetails.working_tree_diff_c7f9bda9'),
    });
  }, [activeTab, onOpenDiff, path, source, tr]);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {historyLoading && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.loading_history_3ca2a3ab')}</span>
          )}
          {historyError && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{historyError}</span>}
          {!historyLoading && !historyError && historyEntries.length === 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.no_history_found_a820bc27')}</span>
          )}
          {!historyLoading &&
            !historyError &&
            historyEntries.map((entry) => (
              <button
                key={`${entry.hash}-${entry.subject}`}
                onClick={() => onSelectCommit?.(entry.hash)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-panel)',
                  padding: '8px 9px',
                  cursor: onSelectCommit ? 'pointer' : 'default',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{entry.abbrevHash}</span>
                <span style={{ fontSize: '0.84rem' }}>{entry.subject || t('generated.components.commitdetails.no_message_e74e94fd')}</span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  {entry.author || '-'} | {formatDate(entry.date)}
                </span>
              </button>
            ))}
        </div>
      )}

      {activeTab === 'blame' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {blameLoading && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.loading_blame_9947698c')}</span>
          )}
          {blameError && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{blameError}</span>}
          {!blameLoading && !blameError && blameLines.length === 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.no_blame_data_found_e996f81f')}</span>
          )}
          {!blameLoading && !blameError && blameLines.length > 0 && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                {blameLines.map((line) => (
                  <div
                    key={`${line.lineNumber}-${line.commitHash}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '50px 72px 1fr',
                      gap: '8px',
                      alignItems: 'start',
                      padding: '5px 8px',
                      borderBottom: '1px solid var(--line-subtle)',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                    }}
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
                        fontSize: '0.75rem',
                      }}
                    >
                      {line.abbrevHash}
                    </button>
                    <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>{line.content}</span>
                  </div>
                ))}
              </div>
              {blameHasMore && (
                <button className="staging-tool-btn" onClick={() => void loadMoreBlame()} disabled={blameLoading} style={{ margin: 8 }}>
                  {t('generated.components.commitdetails.load_500_more_lines_16c0eb75')}
                </button>
              )}
            </div>
          )}
        </div>
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
