import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ConflictSidePreview } from './ConflictEditorParts';
import type { ConflictBlock, ConflictResolutionChoice } from './types';

type ConflictStructuredViewProps = {
  conflictBlocksCount: number;
  selectedConflictBlock: ConflictBlock;
  safeSelectedConflictBlockIndex: number;
  isSaving: boolean;
  applyConflictChoiceToSelected: (choice: ConflictResolutionChoice) => void;
};

export const ConflictStructuredView = ({
  conflictBlocksCount,
  selectedConflictBlock,
  safeSelectedConflictBlockIndex,
  isSaving,
  applyConflictChoiceToSelected,
}: ConflictStructuredViewProps) => {
  const { t, tr } = useI18n();

  return (
    <div className="conflict-structured-view">
      <div className="conflict-block-header">
        <div className="conflict-block-header-meta">
          <span className="conflict-block-header-title">
            {tr(
              `Konfliktblock ${safeSelectedConflictBlockIndex + 1} von ${conflictBlocksCount}`,
              `Conflict block ${safeSelectedConflictBlockIndex + 1} of ${conflictBlocksCount}`,
            )}
          </span>
          <span className="conflict-block-header-range">
            {tr(
              `Zeile ${selectedConflictBlock.startLine} - ${selectedConflictBlock.endLine}`,
              `Line ${selectedConflictBlock.startLine} - ${selectedConflictBlock.endLine}`,
            )}
          </span>
        </div>
      </div>

      <div className="conflict-split-compare">
        <div className="conflict-version-panel">
          <div className="conflict-version-header conflict-version-header--ours">
            <span className="conflict-version-title conflict-version-title--ours">
              {t('generated.components.staging_area.conflictresolverpanel.current_version_5aeac7d3')}{' '}
              {selectedConflictBlock.oursLabel ? `(${selectedConflictBlock.oursLabel})` : ''}
            </span>
            <Button
              className="conflict-version-apply--ours"
              size="xs"
              variant="secondary"
              onClick={() => applyConflictChoiceToSelected('ours')}
              disabled={isSaving}
            >
              {t('generated.components.staging_area.conflictresolverpanel.apply_f47d6702')}
            </Button>
          </div>
          <div
            className="conflict-side-preview-scroll"
            title={t('generated.components.staging_area.conflictresolverpanel.line_numbers_only_for_this_conflict_block_current_versio_2fbd64b0')}
          >
            <ConflictSidePreview text={selectedConflictBlock.ours} variant="ours" />
          </div>
        </div>

        <div className="conflict-version-panel">
          <div className="conflict-version-header conflict-version-header--theirs">
            <span className="conflict-version-title conflict-version-title--theirs">
              {t('generated.components.staging_area.conflictresolverpanel.incoming_version_321cfa46')}{' '}
              {selectedConflictBlock.theirsLabel ? `(${selectedConflictBlock.theirsLabel})` : ''}
            </span>
            <Button
              className="conflict-version-apply--theirs"
              size="xs"
              variant="secondary"
              onClick={() => applyConflictChoiceToSelected('theirs')}
              disabled={isSaving}
            >
              {t('generated.components.staging_area.conflictresolverpanel.apply_f47d6702')}
            </Button>
          </div>
          <div
            className="conflict-side-preview-scroll"
            title={t('generated.components.staging_area.conflictresolverpanel.line_numbers_only_for_this_conflict_block_incoming_versi_0981bfb2')}
          >
            <ConflictSidePreview text={selectedConflictBlock.theirs} variant="theirs" />
          </div>
        </div>
      </div>

      <div className="conflict-take-both-row">
        <Button variant="secondary" onClick={() => applyConflictChoiceToSelected('both')} disabled={isSaving}>
          {t('generated.components.staging_area.conflictresolverpanel.take_both_versions_current_first_03b23e50')}
        </Button>
      </div>
    </div>
  );
};
