import React, { useEffect, useMemo, useState } from 'react';
import type { CommitFileDetail } from '@/utils/gitParsing';
import { parseCommitDetails } from '@/utils/gitParsing';
import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from '@/types/git';
import { FileCode, FileEdit, FileMinus, FilePlus } from 'lucide-react';
import type { DiffRequest } from '@/types/diff';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { VirtualList } from './VirtualList';

type DetailsTab = 'history' | 'blame' | 'patch';

interface CommitDetailsProps {
  hash: string;
  onSelectCommit?: (hash: string) => void;
  onOpenDiff?: (request: DiffRequest) => void;
}

const fileNameFromPath = (filePath: string): string => filePath.split(/[\\/]/).pop() || filePath;

export const extractCommitDescription = (message: string): string => {
  const lines = String(message || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const bodyLines = lines.slice(1);
  while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();
  return bodyLines.join('\n');
};

export const CommitDetails: React.FC<CommitDetailsProps> = ({ hash, onSelectCommit, onOpenDiff }) => {
  const normalizedHash = useMemo(() => {
    const match = String(hash || '').match(/[0-9a-f]{7,40}/i);
    return match ? match[0] : '';
  }, [hash]);

  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesSourceHint, setFilesSourceHint] = useState<string | null>(null);
  const [isMergeCommit, setIsMergeCommit] = useState(false);
  const [files, setFiles] = useState<CommitFileDetail[]>([]);
  const [commitDescription, setCommitDescription] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileCommitHash, setSelectedFileCommitHash] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailsTab>('history');

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<GitFileHistoryEntryDto[]>([]);

  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const [blameLines, setBlameLines] = useState<GitFileBlameLineDto[]>([]);
  const [blameHasMore, setBlameHasMore] = useState(false);

  const { t, tr, locale } = useI18n();

  useEffect(() => {
    setSelectedFilePath(null);
    setSelectedFileCommitHash(null);
    setActiveTab('history');
    setHistoryEntries([]);
    setBlameLines([]);
    setBlameHasMore(false);
    setHistoryError(null);
    setBlameError(null);
  }, [normalizedHash]);

  useEffect(() => {
    if (!normalizedHash || !gitClient.isAvailable()) return;

    const fetchDetails = async () => {
      setLoadingFiles(true);
      setFilesError(null);
      setFilesSourceHint(null);
      setIsMergeCommit(false);
      setCommitDescription('');

      try {
        const parentsResult = await gitClient.runGitCommand('show', '-s', '--format=%P', normalizedHash);
        const parents = parentsResult.success
          ? String(parentsResult.data || '')
              .trim()
              .split(/\s+/)
              .filter(Boolean)
          : [];
        const mergeCommit = parents.length > 1;
        setIsMergeCommit(mergeCommit);

        const messageResult = await gitClient.runGitCommand('show', '-s', '--format=%B', normalizedHash);
        if (messageResult.success) {
          setCommitDescription(extractCommitDescription(String(messageResult.data || '')));
        }

        const detailResult = await gitClient.runGitCommand('commitDetails', normalizedHash);
        if (!detailResult.success) {
          setFiles([]);
          setFilesError(detailResult.error || t('generated.components.commitdetails.could_not_load_commit_details_cf1a30a2'));
          return;
        }

        const directFiles = parseCommitDetails(String(detailResult.data || ''));
        if (directFiles.length > 0) {
          setFiles(directFiles);
          return;
        }

        if (mergeCommit) {
          const mergeRangeResult = await gitClient.runGitCommand('diff', '--name-status', `${normalizedHash}^1`, normalizedHash);
          if (mergeRangeResult.success) {
            const mergedBranchFiles = parseCommitDetails(String(mergeRangeResult.data || ''));
            if (mergedBranchFiles.length > 0) {
              setFiles(mergedBranchFiles);
              setFilesSourceHint(t('generated.components.commitdetails.files_show_the_effective_changes_from_the_merged_branch_bd7570a6'));
              return;
            }
          }
        }

        setFiles([]);
      } catch (fetchError) {
        console.error(fetchError);
        setFiles([]);
        setFilesError(t('generated.components.commitdetails.could_not_load_commit_details_cf1a30a2'));
      } finally {
        setLoadingFiles(false);
      }
    };

    fetchDetails();
  }, [normalizedHash, tr]);

  const selectedFile = useMemo(
    () => (selectedFileCommitHash === normalizedHash ? (files.find((file) => file.path === selectedFilePath) ?? null) : null),
    [files, normalizedHash, selectedFileCommitHash, selectedFilePath],
  );
  const isDeletedFile = selectedFile?.status.startsWith('D') ?? false;

  useEffect(() => {
    if (!selectedFile || !gitClient.isAvailable()) return;

    const fetchHistory = async () => {
      if (activeTab !== 'history') return;

      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await gitClient.getFileHistory(selectedFile.path, normalizedHash, 80);
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
  }, [activeTab, normalizedHash, selectedFile, tr]);

  useEffect(() => {
    if (!selectedFile || !gitClient.isAvailable()) return;

    const fetchBlame = async () => {
      if (activeTab !== 'blame') return;

      if (isDeletedFile) {
        setBlameLines([]);
        setBlameError(t('generated.components.commitdetails.blame_is_not_available_for_deleted_files_in_this_commit_81f42d37'));
        return;
      }

      setBlameLoading(true);
      setBlameError(null);
      try {
        const result = await gitClient.getFileBlameRange(selectedFile.path, normalizedHash, 1, 500);
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
  }, [activeTab, normalizedHash, isDeletedFile, selectedFile, tr]);

  const loadMoreBlame = async () => {
    if (!selectedFile || blameLoading || !blameHasMore || !gitClient.isAvailable()) return;
    setBlameLoading(true);
    try {
      const result = await gitClient.getFileBlameRange(selectedFile.path, normalizedHash, blameLines.length + 1, 500);
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
    if (!selectedFile || activeTab !== 'patch' || !normalizedHash) return;

    onOpenDiff?.({
      source: 'commit',
      path: selectedFile.path,
      commitHash: normalizedHash,
      title: tr(`Commit Diff ${normalizedHash.slice(0, 8)}`, `Commit diff ${normalizedHash.slice(0, 8)}`),
    });
  }, [activeTab, normalizedHash, onOpenDiff, selectedFile, tr]);

  const getIconForStatus = (status: string) => {
    switch (status[0]) {
      case 'A':
        return <FilePlus size={14} color="var(--status-success)" />;
      case 'D':
        return <FileMinus size={14} color="var(--status-danger)" />;
      case 'M':
        return <FileEdit size={14} color="var(--status-warning)" />;
      default:
        return <FileCode size={14} color="var(--status-untracked)" />;
    }
  };

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

  const formatRelativeDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return '-';

    const now = Date.now();
    const diffMs = now - parsed.getTime();
    const absMs = Math.abs(diffMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (absMs < minute) return t('generated.components.commitdetails.just_now_c80ae697');
    if (absMs < hour) return tr('vor ' + Math.max(1, Math.round(absMs / minute)) + ' Min', Math.max(1, Math.round(absMs / minute)) + ' min ago');
    if (absMs < day) return tr('vor ' + Math.max(1, Math.round(absMs / hour)) + ' Std', Math.max(1, Math.round(absMs / hour)) + ' h ago');
    const days = Math.max(1, Math.round(absMs / day));
    return tr('vor ' + days + ' Tag' + (days === 1 ? '' : 'en'), days + ' day' + (days === 1 ? '' : 's') + ' ago');
  };

  const formatBlameDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleDateString(locale, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="commit-details-panel" style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
          {t('generated.components.commitdetails.commit_details_7b1df325')}:{' '}
          {normalizedHash ? normalizedHash.substring(0, 8) : t('generated.components.commitdetails.invalid_4296db6c')}
        </h4>
        {selectedFile && (
          <button
            className="icon-btn"
            onClick={() => {
              setSelectedFilePath(null);
              setSelectedFileCommitHash(null);
            }}
            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
          >
            {t('generated.components.commitdetails.files_f77bc482')}
          </button>
        )}
      </div>

      {normalizedHash && commitDescription && !loadingFiles && (
        <div
          style={{
            marginBottom: '10px',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '9px 10px',
            backgroundColor: 'var(--bg-panel)',
          }}
        >
          <div style={{ marginBottom: '5px', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {t('generated.components.commitdetails.description_3f0f0c88')}
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: '0.84rem', lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {commitDescription}
          </div>
        </div>
      )}

      {!normalizedHash ? (
        <div
          style={{ color: 'var(--status-danger)', fontSize: '0.84rem', border: '1px solid var(--status-danger-border)', borderRadius: 6, padding: '8px 10px' }}
        >
          {t('generated.components.commitdetails.invalid_commit_id_904257c3')}
        </div>
      ) : loadingFiles ? (
        <p style={{ color: 'var(--text-secondary)' }}>{t('generated.components.commitdetails.loading_details_477a7987')}</p>
      ) : filesError ? (
        <div
          style={{ color: 'var(--status-danger)', fontSize: '0.84rem', border: '1px solid var(--status-danger-border)', borderRadius: 6, padding: '8px 10px' }}
        >
          {filesError}
        </div>
      ) : !selectedFile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filesSourceHint && (
            <div
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.78rem',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '7px 8px',
                backgroundColor: 'var(--bg-panel)',
              }}
            >
              {filesSourceHint}
            </div>
          )}
          {files.length > 0 && (
            <VirtualList
              items={files}
              rowHeight={42}
              maxHeight={630}
              overscan={10}
              getKey={(file, index) => `${file.path}-${index}`}
              renderItem={(file) => (
                <button
                  onClick={() => {
                    setSelectedFilePath(file.path);
                    setSelectedFileCommitHash(normalizedHash);
                  }}
                  title={file.path}
                  style={{
                    width: '100%',
                    height: 38,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '7px 8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {getIconForStatus(file.status)}
                  <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fileNameFromPath(file.path)}
                  </span>
                </button>
              )}
            />
          )}
          {files.length === 0 && (
            <span style={{ color: 'var(--text-secondary)' }}>
              {isMergeCommit
                ? t('generated.components.commitdetails.no_effective_file_changes_against_parent_1_found_d2dd4215')
                : t('generated.components.commitdetails.no_files_changed_b34a415f')}
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t('generated.components.commitdetails.file_9d811416')}</div>
          <div
            title={selectedFile.path}
            style={{
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '7px 8px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {fileNameFromPath(selectedFile.path)}
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
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
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {t('generated.components.commitdetails.history_of_this_file_click_an_entry_to_open_the_full_com_c1c0d4bb')}
              </span>
              {historyLoading && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.loading_history_3ca2a3ab')}</span>
              )}
              {historyError && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{historyError}</span>}
              {!historyLoading && !historyError && historyEntries.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.no_history_found_a820bc27')}</span>
              )}
              {!historyLoading &&
                !historyError &&
                historyEntries.map((entry) => {
                  const normalizedEntryHash = (entry.hash.match(/[0-9a-f]{7,40}/i) || [''])[0];
                  const isCurrentCommit = normalizedEntryHash === normalizedHash;
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
                        cursor: onSelectCommit ? 'pointer' : 'default',
                        color: 'var(--text-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                      disabled={!normalizedEntryHash}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {entry.abbrevHash ||
                            (normalizedEntryHash ? normalizedEntryHash.slice(0, 8) : t('generated.components.commitdetails.invalid_4296db6c'))}
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
                        {entry.author || '-'} | {formatDate(entry.date)} | {formatRelativeDate(entry.date)}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}

          {activeTab === 'blame' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {t('generated.components.commitdetails.blame_shows_for_each_line_which_commit_last_touched_it_280be5ae')}
              </span>
              {blameLoading && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{t('generated.components.commitdetails.loading_blame_9947698c')}</span>
              )}
              {blameError && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{blameError}</span>}
              {!blameLoading && !blameError && blameLines.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  {t('generated.components.commitdetails.no_blame_data_found_e996f81f')}
                </span>
              )}
              {!blameLoading && !blameError && (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '56px 80px 120px 60px 1fr',
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
                  <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                    {blameLines.map((line, index) => (
                      <div
                        key={`${line.lineNumber}-${line.commitHash}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '56px 80px 120px 60px 1fr',
                          gap: '8px',
                          alignItems: 'start',
                          padding: '5px 8px',
                          borderBottom: '1px solid var(--line-subtle)',
                          fontFamily: 'monospace',
                          fontSize: '0.76rem',
                          color: 'var(--text-primary)',
                          backgroundColor: index % 2 === 0 ? 'transparent' : 'var(--accent-primary-softer)',
                        }}
                        title={`${line.author} - ${line.summary}`}
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
                            fontSize: '0.76rem',
                          }}
                        >
                          {line.abbrevHash}
                        </button>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {line.author || '-'}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>{formatBlameDate(line.authorTime)}</span>
                        <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line.content}</span>
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
                onClick={() =>
                  onOpenDiff?.({
                    source: 'commit',
                    path: selectedFile.path,
                    commitHash: normalizedHash,
                    title: tr(`Commit Diff ${normalizedHash.slice(0, 8)}`, `Commit diff ${normalizedHash.slice(0, 8)}`),
                  })
                }
              >
                {t('generated.components.commitdetails.show_diff_again_in_main_window_d9b0309b')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
