import { FileDetailsView } from '@/components/file-details/FileDetailsView';
import { useI18n } from '@/i18n';
import type { useCommitDetailsData } from './useCommitDetailsData';

type Props = {
  repoPath: string | null;
  details: ReturnType<typeof useCommitDetailsData>;
  onSelectCommit?: (hash: string, path?: string) => void;
  onClose: () => void;
};

export function CommitFileDetails({ repoPath, details, onSelectCommit, onClose }: Props) {
  const { tr } = useI18n();
  if (!details.selectedFile) return null;
  return (
    <FileDetailsView
      repoPath={repoPath}
      file={details.selectedFile}
      identity={details.normalizedHash}
      revision={`Commit ${details.normalizedHash.slice(0, 8)}`}
      revisionTitle={details.normalizedHash}
      activeTab={details.activeTab}
      setActiveTab={details.setActiveTab}
      onSelectCommit={onSelectCommit}
      onClose={onClose}
      history={{
        entries: details.historyEntries,
        loading: details.historyLoading,
        error: details.historyError,
        hasMore: details.historyHasMore,
        onLoadMore: details.loadMoreHistory,
        formatDate: details.formatDate,
        formatRelativeDate: details.formatRelativeDate,
        intro: tr(
          'Dateiverlauf inklusive neuerer Commits. Eintrag anklicken, um die Änderung zu öffnen.',
          'File history including newer commits. Select an entry to open the change.',
        ),
        currentHash: details.normalizedHash,
      }}
      blame={{
        lines: details.blameLines,
        loading: details.blameLoading,
        error: details.blameError,
        hasMore: details.blameHasMore,
        intro: tr('Letzte Änderung je Zeile in diesem Dateistand.', 'Last change to each line in this revision.'),
        variant: 'detailed',
        formatBlameDate: details.formatBlameDate,
        onLoadMore: details.loadMoreBlame,
      }}
    />
  );
}
