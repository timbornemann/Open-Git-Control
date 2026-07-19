import React from 'react';
import { FileCode, FileEdit, FileMinus, FilePlus } from 'lucide-react';
import type { DiffRequest } from '@/types/diff';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { useAppToast } from '@/hooks/useAppToast';
import type { RepositoryPathOpenActionDto } from '@/shared/ipc/contracts/git';
import { fileNameFromPath, useCommitDetailsData } from '@/components/commit-details/useCommitDetailsData';
import { VirtualList } from '@/components/VirtualList';
import { BlamePanel } from '@/components/file-details/BlamePanel';
import { FileHistoryPanel } from '@/components/file-details/FileHistoryPanel';

interface CommitDetailsProps {
  repoPath: string | null;
  hash: string;
  onSelectCommit?: (hash: string) => void;
  onOpenDiff?: (request: DiffRequest) => void;
}

export { extractCommitDescription } from '@/components/commit-details/useCommitDetailsData';

export const CommitDetails: React.FC<CommitDetailsProps> = ({ repoPath, hash, onSelectCommit, onOpenDiff }) => {
  const { t, tr } = useI18n();
  const showToast = useAppToast();
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
  } = useCommitDetailsData({ repoPath, hash, onOpenDiff });

  const handleRepositoryPathAction = async (action: RepositoryPathOpenActionDto) => {
    if (!repoPath || !selectedFile || !gitClient.isAvailable()) return;
    try {
      const result = await gitClient.openRepositoryPath({ path: selectedFile.path, action, repoPath });
      if (!result.success) {
        showToast(
          result.error || tr('Der Dateipfad konnte nicht im Dateisystem geoeffnet werden.', 'The file path could not be opened in the file system.'),
          true,
        );
      }
    } catch (openError: unknown) {
      showToast(
        openError instanceof Error
          ? openError.message
          : tr('Der Dateipfad konnte nicht im Dateisystem geoeffnet werden.', 'The file path could not be opened in the file system.'),
        true,
      );
    }
  };

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
    <div
      className="commit-details-panel"
      style={
        selectedFile
          ? { padding: '12px', height: '100%', boxSizing: 'border-box', overflowY: 'auto' }
          : { padding: '12px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexShrink: 0 }}>
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
            flexShrink: 0,
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
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '6px', minHeight: 0 }}>
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
              className="commit-details-file-list"
              items={files}
              rowHeight={42}
              fillAvailableHeight
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

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button className="staging-tool-btn" onClick={() => void handleRepositoryPathAction('reveal')}>
              {tr('Im Dateimanager anzeigen', 'Show in file manager')}
            </button>
            <button className="staging-tool-btn" onClick={() => void handleRepositoryPathAction('open')}>
              {tr('Datei oeffnen', 'Open file')}
            </button>
            <button className="staging-tool-btn" onClick={() => void handleRepositoryPathAction('openWith')}>
              {tr('Oeffnen mit...', 'Open with...')}
            </button>
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
            <FileHistoryPanel
              entries={historyEntries}
              loading={historyLoading}
              error={historyError}
              formatDate={formatDate}
              formatRelativeDate={formatRelativeDate}
              intro={t('generated.components.commitdetails.history_of_this_file_click_an_entry_to_open_the_full_com_c1c0d4bb')}
              currentHash={normalizedHash}
              onSelectCommit={onSelectCommit}
            />
          )}

          {activeTab === 'blame' && (
            <BlamePanel
              lines={blameLines}
              loading={blameLoading}
              error={blameError}
              hasMore={blameHasMore}
              intro={t('generated.components.commitdetails.blame_shows_for_each_line_which_commit_last_touched_it_280be5ae')}
              variant="detailed"
              formatBlameDate={formatBlameDate}
              onLoadMore={loadMoreBlame}
              onSelectCommit={onSelectCommit}
            />
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
