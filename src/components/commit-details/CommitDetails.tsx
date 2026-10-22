import React, { useLayoutEffect, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { useI18n } from '@/i18n';
import { useCommitDetailsData } from './useCommitDetailsData';
import { CommitFileTree } from './CommitFileTree';
import { CommitFileDetails } from './CommitFileDetails';
import './commitDetails.css';

interface CommitDetailsProps {
  repoPath: string | null;
  hash: string;
  onSelectCommit?: (hash: string) => void;
  onOpenDiff?: (request: DiffRequest) => void;
  activeDiffRequest?: DiffRequest | null;
  refreshTrigger?: number;
}

export { extractCommitDescription } from './useCommitDetailsData';

export const CommitDetails: React.FC<CommitDetailsProps> = ({ repoPath, hash, onSelectCommit, onOpenDiff, activeDiffRequest, refreshTrigger }) => {
  const { t } = useI18n();
  const details = useCommitDetailsData({ repoPath, hash, onOpenDiff, onSelectCommit, activeDiffRequest, refreshTrigger });
  const { commitDescription, files, filesError, filesSourceHint, isMergeCommit, loadingFiles, normalizedHash, selectedFile } = details;
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());
  useLayoutEffect(() => setCollapsedPaths(new Set()), [repoPath, normalizedHash]);

  return (
    <div className="commit-details-panel">
      <h4 className="commit-details-heading">
        {t('generated.components.commitdetails.commit_details_7b1df325')}:{' '}
        {normalizedHash ? normalizedHash.substring(0, 8) : t('generated.components.commitdetails.invalid_4296db6c')}
      </h4>
      {normalizedHash && commitDescription && !loadingFiles && (
        <div className="commit-details-description">
          <div className="commit-details-description__label">{t('generated.components.commitdetails.description_3f0f0c88')}</div>
          <div>{commitDescription}</div>
        </div>
      )}
      {!normalizedHash ? (
        <div className="commit-details-error">{t('generated.components.commitdetails.invalid_commit_id_904257c3')}</div>
      ) : loadingFiles ? (
        <p className="commit-details-loading">{t('generated.components.commitdetails.loading_details_477a7987')}</p>
      ) : filesError ? (
        <div className="commit-details-error">{filesError}</div>
      ) : (
        <div className={`commit-details-content${selectedFile ? ' has-selection' : ''}`}>
          <CommitFileDetails
            repoPath={repoPath}
            details={details}
            onSelectCommit={onSelectCommit ? details.selectFileCommit : undefined}
            onClose={() => {
              details.setSelectedFilePath(null);
              details.setSelectedFileCommitHash(null);
            }}
          />
          <div className="commit-details-files">
            {filesSourceHint && <div className="commit-details-source-hint">{filesSourceHint}</div>}
            {files.length > 0 ? (
              <CommitFileTree
                key={JSON.stringify([repoPath, normalizedHash])}
                repoPath={repoPath}
                files={files}
                collapsedPaths={collapsedPaths}
                selectedFilePath={selectedFile?.path}
                revealFilePath={details.revealFilePath}
                onToggleDirectory={(path) =>
                  setCollapsedPaths((current) => {
                    const next = new Set(current);
                    if (next.has(path)) next.delete(path);
                    else next.add(path);
                    return next;
                  })
                }
                onSelectFile={details.selectFile}
              />
            ) : (
              <span className="commit-details-loading">
                {isMergeCommit
                  ? t('generated.components.commitdetails.no_effective_file_changes_against_parent_1_found_d2dd4215')
                  : t('generated.components.commitdetails.no_files_changed_b34a415f')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
