import React from 'react';
import { FileCode, FileEdit, FileMinus, FilePlus } from 'lucide-react';
import type { DiffRequest } from '@/types/diff';
import { useI18n } from '@/i18n';
import { fileNameFromPath, useCommitDetailsData } from '@/components/commit-details/useCommitDetailsData';
import { VirtualList } from '@/components/VirtualList';

interface CommitDetailsProps {
  hash: string;
  onSelectCommit?: (hash: string) => void;
  onOpenDiff?: (request: DiffRequest) => void;
}

export { extractCommitDescription } from '@/components/commit-details/useCommitDetailsData';

export const CommitDetails: React.FC<CommitDetailsProps> = ({ hash, onSelectCommit, onOpenDiff }) => {
  const { t } = useI18n();
  const {
    activeTab,
    blameError,
    blameHasMore,
    blameLines,
    blameLoading,
    commitDescription,
    files,
    filesError,
    filesSourceHint,
    formatBlameDate,
    formatDate,
    formatRelativeDate,
    historyEntries,
    historyError,
    historyLoading,
    isMergeCommit,
    loadMoreBlame,
    loadingFiles,
    normalizedHash,
    openSelectedFileDiff,
    selectedFile,
    setActiveTab,
    setSelectedFileCommitHash,
    setSelectedFilePath,
  } = useCommitDetailsData({ hash, onOpenDiff });

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
              <button className="staging-tool-btn" onClick={openSelectedFileDiff}>
                {t('generated.components.commitdetails.show_diff_again_in_main_window_d9b0309b')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
