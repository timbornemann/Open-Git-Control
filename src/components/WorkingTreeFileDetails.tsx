import { useLayoutEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { useFileBlame } from './file-viewer/useFileBlame';
import { FileDetailsView, type FileDetailsTab } from './file-details/FileDetailsView';
import { useFileHistoryPages } from './file-details/useFileHistoryPages';
import { useFileDetailDates } from './file-details/useFileDetailDates';

interface WorkingTreeFileDetailsProps {
  repoPath: string;
  path: string;
  source: 'staged' | 'unstaged';
  status?: string;
  oldPath?: string;
  refreshTrigger?: number;
  onSelectCommit?: (hash: string, path?: string) => void;
  onClose?: () => void;
}

export function WorkingTreeFileDetails({
  repoPath,
  path,
  source,
  status = 'M',
  oldPath,
  refreshTrigger = 0,
  onSelectCommit,
  onClose,
}: WorkingTreeFileDetailsProps) {
  const { t, tr } = useI18n();
  const [activeTab, setActiveTab] = useState<FileDetailsTab>('history');
  const dates = useFileDetailDates();
  // An uncommitted rename still has its committed history under the old name.
  const historyPath = oldPath || path;
  const history = useFileHistoryPages(repoPath, historyPath, undefined, activeTab === 'history', refreshTrigger);
  const context = useMemo(() => ({ repoPath, path, source }), [repoPath, path, source]);
  const isDeleted = status.startsWith('D');
  const blame = useFileBlame(context, activeTab === 'blame' && !isDeleted, refreshTrigger);
  useLayoutEffect(() => setActiveTab('history'), [path, repoPath, source]);

  return (
    <FileDetailsView
      repoPath={repoPath}
      file={{ path, status, oldPath }}
      identity={source}
      revision={
        source === 'staged'
          ? t('generated.components.workingtreefiledetails.staged_changes_2b2e99a1')
          : t('generated.components.workingtreefiledetails.unstaged_changes_898c9c1d')
      }
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onSelectCommit={onSelectCommit ? (hash, historicalPath = historyPath) => onSelectCommit(hash, historicalPath) : undefined}
      onClose={onClose}
      history={{
        entries: history.entries,
        loading: history.loading,
        error: history.error,
        hasMore: history.hasMore,
        onLoadMore: history.loadMore,
        formatDate: dates.formatDate,
        formatRelativeDate: dates.formatRelativeDate,
        intro: tr(
          'Dateiverlauf bis zum neuesten Commit. Eintrag anklicken, um die Änderung zu öffnen.',
          'File history through the latest commit. Select an entry to open the change.',
        ),
      }}
      blame={{
        lines: isDeleted ? [] : blame.lines,
        loading: !isDeleted && blame.loading,
        error: isDeleted ? tr('Blame ist für gelöschte Dateien nicht verfügbar.', 'Blame is not available for deleted files.') : blame.error,
        hasMore: !isDeleted && blame.hasMore,
        onLoadMore: blame.loadMore,
        intro: tr('Letzte Änderung je Zeile in diesem Dateistand.', 'Last change to each line in this revision.'),
        variant: 'detailed',
        formatBlameDate: dates.formatBlameDate,
      }}
    />
  );
}
