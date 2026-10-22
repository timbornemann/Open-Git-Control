import { useLayoutEffect, useRef } from 'react';
import { Copy, ExternalLink, FileCode, FolderOpen, History, List, X } from 'lucide-react';
import { BlamePanel } from '@/components/file-details/BlamePanel';
import { FileHistoryPanel } from '@/components/file-details/FileHistoryPanel';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { RepositoryPathOpenActionDto } from '@/shared/ipc/contracts/git';
import { copyTextToClipboard } from '@/utils/clipboard';
import type { useCommitDetailsData } from './useCommitDetailsData';

type Props = {
  repoPath: string | null;
  details: ReturnType<typeof useCommitDetailsData>;
  onSelectCommit?: (hash: string) => void;
  onClose: () => void;
};

export function CommitFileDetails({ repoPath, details, onSelectCommit, onClose }: Props) {
  const { t, tr } = useI18n();
  const showToast = useAppToast();
  const { selectedFile, activeTab, setActiveTab } = details;
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [repoPath, details.normalizedHash, selectedFile?.path, activeTab]);
  if (!selectedFile) return null;

  const lastSlash = selectedFile.path.lastIndexOf('/');
  const fileName = selectedFile.path.slice(lastSlash + 1);
  const directory = lastSlash >= 0 ? selectedFile.path.slice(0, lastSlash) : tr('Repository-Stamm', 'Repository root');
  const status = selectedFile.status[0];
  const statusLabels: Record<string, string> = {
    A: tr('Hinzugefügt', 'Added'),
    M: tr('Geändert', 'Modified'),
    D: tr('Gelöscht', 'Deleted'),
    R: tr('Umbenannt', 'Renamed'),
    C: tr('Kopiert', 'Copied'),
    T: tr('Dateityp geändert', 'File type changed'),
  };
  const statusColor = status === 'A' ? 'success' : status === 'D' ? 'danger' : status === 'M' ? 'warning' : 'untracked';
  const historyLabel = t('generated.components.commitdetails.history_83156612');

  const copyPath = async () => {
    const copied = await copyTextToClipboard(selectedFile.path);
    showToast(copied ? tr('Dateipfad kopiert.', 'File path copied.') : tr('Dateipfad konnte nicht kopiert werden.', 'Could not copy the file path.'), !copied);
  };

  const handleRepositoryPathAction = async (action: RepositoryPathOpenActionDto) => {
    if (!repoPath || !gitClient.isAvailable()) return;
    try {
      const result = await gitClient.openRepositoryPath({ path: selectedFile.path, action, repoPath });
      if (!result.success) showToast(result.error || tr('Der Dateipfad konnte nicht geöffnet werden.', 'The file path could not be opened.'), true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : tr('Der Dateipfad konnte nicht geöffnet werden.', 'The file path could not be opened.'), true);
    }
  };

  return (
    <section className="commit-file-details" aria-label={tr('Dateidetails', 'File details')}>
      <div className="commit-file-details__summary">
        <div className="commit-file-details__header">
          <div className="commit-file-details__identity" title={selectedFile.path}>
            <FileCode size={18} className="commit-file-details__file-icon" aria-hidden="true" />
            <div className="commit-file-details__location">
              <h5 className="commit-file-details__name">{fileName}</h5>
              <div className="commit-file-details__path">{directory}</div>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void copyPath()}
            title={tr('Dateipfad kopieren', 'Copy file path')}
            aria-label={tr('Dateipfad kopieren', 'Copy file path')}
          >
            <Copy size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title={tr('Dateidetails schließen', 'Close file details')}
            aria-label={tr('Dateidetails schließen', 'Close file details')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="commit-file-details__metadata">
          <span className="commit-file-details__status" style={{ color: `var(--status-${statusColor})` }}>
            {statusLabels[status] || tr('Geändert', 'Modified')}
          </span>
          <span className="commit-file-details__revision" title={details.normalizedHash}>
            Commit {details.normalizedHash.slice(0, 8)}
          </span>
        </div>
        {selectedFile.oldPath && (
          <div className="commit-file-details__previous-path">
            <span>{tr('Zuvor:', 'Previously:')}</span> <code title={selectedFile.oldPath}>{selectedFile.oldPath}</code>
          </div>
        )}
        <div className="commit-file-details__actions" role="group" aria-label={tr('Dateiaktionen', 'File actions')}>
          <button
            type="button"
            className="staging-tool-btn"
            onClick={() => void handleRepositoryPathAction('reveal')}
            title={tr('Aktuelle Datei im Dateimanager anzeigen', 'Show the current file in the file manager')}
          >
            <FolderOpen size={13} aria-hidden="true" />
            {tr('Im Ordner anzeigen', 'Show in folder')}
          </button>
          <button
            type="button"
            className="staging-tool-btn"
            onClick={() => void handleRepositoryPathAction('open')}
            title={tr('Aktuelle Datei mit der Standardanwendung öffnen', 'Open the current file in the default application')}
          >
            <ExternalLink size={13} aria-hidden="true" />
            {tr('Öffnen', 'Open')}
          </button>
          <button
            type="button"
            className="staging-tool-btn"
            onClick={() => void handleRepositoryPathAction('openWith')}
            title={tr('Anwendung zum Öffnen der aktuellen Datei auswählen', 'Choose an application to open the current file')}
          >
            {tr('Öffnen mit …', 'Open with…')}
          </button>
        </div>
        <div className="commit-file-details__tabs" role="group" aria-label={tr('Ansicht der Dateidetails', 'File details view')}>
          <button
            type="button"
            className={`commit-file-details__tab${activeTab === 'history' ? ' is-active' : ''}`}
            aria-pressed={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
          >
            <History size={14} aria-hidden="true" />
            {historyLabel}
          </button>
          <button
            type="button"
            className={`commit-file-details__tab${activeTab === 'blame' ? ' is-active' : ''}`}
            aria-pressed={activeTab === 'blame'}
            onClick={() => setActiveTab('blame')}
          >
            <List size={14} aria-hidden="true" />
            Blame
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="commit-file-details__content" role="region" aria-label={activeTab === 'history' ? historyLabel : 'Blame'} tabIndex={0}>
        {activeTab === 'history' && (
          <FileHistoryPanel
            entries={details.historyEntries}
            loading={details.historyLoading}
            error={details.historyError}
            formatDate={details.formatDate}
            formatRelativeDate={details.formatRelativeDate}
            intro={tr(
              'Änderungen bis zu diesem Commit. Eintrag anklicken, um den Commit zu öffnen.',
              'Changes up to this commit. Select an entry to open the commit.',
            )}
            currentHash={details.normalizedHash}
            onSelectCommit={onSelectCommit}
          />
        )}
        {activeTab === 'blame' && (
          <BlamePanel
            lines={details.blameLines}
            loading={details.blameLoading}
            error={details.blameError}
            hasMore={details.blameHasMore}
            intro={tr('Letzte Änderung je Zeile in diesem Dateistand.', 'Last change to each line in this revision.')}
            variant="detailed"
            formatBlameDate={details.formatBlameDate}
            onLoadMore={details.loadMoreBlame}
            onSelectCommit={onSelectCommit}
          />
        )}
      </div>
    </section>
  );
}
