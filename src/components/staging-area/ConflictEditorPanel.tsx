import type React from 'react';
import { Button, Toolbar } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ConflictEditorToolbar } from './ConflictEditorToolbar';
import { ConflictManualSection } from './ConflictManualSection';
import { ConflictStructuredView } from './ConflictStructuredView';
import type { ConflictBlock, ConflictEditorState, ConflictResolutionChoice } from './types';

type ConflictEditorPanelProps = {
  conflictEditor: ConflictEditorState | null;
  isConflictEditorLoading: boolean;
  reloadActiveConflictEditor: () => Promise<void> | void;
  applyConflictChoiceToAll: (choice: ConflictResolutionChoice) => void;
  markConflictResolvedAndSync: (filePath: string) => Promise<void> | void;
  resolveConflictByDeletion: (filePath: string) => Promise<void> | void;
  isStructuredConflictViewLocked: boolean;
  conflictBlocks: ConflictBlock[];
  selectedConflictBlock: ConflictBlock | null;
  safeSelectedConflictBlockIndex: number;
  applyConflictChoiceToSelected: (choice: ConflictResolutionChoice) => void;
  resetConflictEditorDraft: () => void;
  saveConflictEditor: (markResolvedAfterSave: boolean) => Promise<void> | void;
  isConflictEditorDirty: boolean;
  conflictManualScrollRef: React.RefObject<HTMLDivElement>;
  onConflictEditorContentChange: (filePath: string, nextContent: string) => void;
};

export const ConflictEditorPanel = ({
  conflictEditor,
  isConflictEditorLoading,
  reloadActiveConflictEditor,
  applyConflictChoiceToAll,
  markConflictResolvedAndSync,
  resolveConflictByDeletion,
  isStructuredConflictViewLocked,
  conflictBlocks,
  selectedConflictBlock,
  safeSelectedConflictBlockIndex,
  applyConflictChoiceToSelected,
  resetConflictEditorDraft,
  saveConflictEditor,
  isConflictEditorDirty,
  conflictManualScrollRef,
  onConflictEditorContentChange,
}: ConflictEditorPanelProps) => {
  const { t } = useI18n();

  if (isConflictEditorLoading) {
    return (
      <div className="conflict-editor-panel">
        <div className="conflict-empty-state">{t('generated.components.staging_area.conflictresolverpanel.loading_conflict_file_38c6fa8f')}</div>
      </div>
    );
  }

  if (!conflictEditor) {
    return (
      <div className="conflict-editor-panel">
        <div className="conflict-empty-state">{t('generated.components.staging_area.conflictresolverpanel.select_a_conflict_file_on_the_left_e2f52cfd')}</div>
      </div>
    );
  }

  return (
    <div className="conflict-editor-panel">
      <div className="conflict-editor-shell">
        <ConflictEditorToolbar
          conflictEditor={conflictEditor}
          conflictBlocksCount={conflictBlocks.length}
          hasUnresolvedConflictMarkers={conflictBlocks.length > 0 || isStructuredConflictViewLocked}
          reloadActiveConflictEditor={reloadActiveConflictEditor}
          applyConflictChoiceToAll={applyConflictChoiceToAll}
          markConflictResolvedAndSync={markConflictResolvedAndSync}
          resolveConflictByDeletion={resolveConflictByDeletion}
        />

        <div className="conflict-editor-content">
          {isStructuredConflictViewLocked && (
            <div className="conflict-editor-notice info conflict-editor-notice--stacked">
              <span>
                {t('generated.components.staging_area.conflictresolverpanel.warning_incomplete_or_unbalanced_conflict_markers_detect_4ff40db4')}{' '}
                <code>{'<<<<<<<'}</code> / <code>{'======='}</code> / <code>{'>>>>>>>'}</code>{' '}
                {t('generated.components.staging_area.conflictresolverpanel.markers_are_consistent_deda7181')}
              </span>
              <Toolbar gap="md">
                <Button
                  variant="secondary"
                  onClick={() => {
                    void reloadActiveConflictEditor();
                  }}
                  title={t('generated.components.staging_area.conflictresolverpanel.reload_file_and_rerun_marker_analysis_d1995005')}
                >
                  {t('generated.components.staging_area.conflictresolverpanel.reload_e5199249')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void resetConflictEditorDraft();
                  }}
                  title={t('generated.components.staging_area.conflictresolverpanel.discard_all_manual_edits_and_restore_original_file_c18ae82b')}
                >
                  {t('generated.components.staging_area.conflictresolverpanel.discard_changes_b80ac3bd')}
                </Button>
              </Toolbar>
            </div>
          )}

          {!isStructuredConflictViewLocked && conflictBlocks.length > 0 && selectedConflictBlock && (
            <ConflictStructuredView
              conflictBlocksCount={conflictBlocks.length}
              selectedConflictBlock={selectedConflictBlock}
              safeSelectedConflictBlockIndex={safeSelectedConflictBlockIndex}
              isSaving={conflictEditor.isSaving}
              applyConflictChoiceToSelected={applyConflictChoiceToSelected}
            />
          )}

          <ConflictManualSection
            conflictEditor={conflictEditor}
            conflictBlocksCount={conflictBlocks.length}
            hasUnresolvedConflictMarkers={conflictBlocks.length > 0 || isStructuredConflictViewLocked}
            isConflictEditorDirty={isConflictEditorDirty}
            conflictManualScrollRef={conflictManualScrollRef}
            resetConflictEditorDraft={resetConflictEditorDraft}
            saveConflictEditor={saveConflictEditor}
            onConflictEditorContentChange={onConflictEditorContentChange}
          />
        </div>
      </div>
    </div>
  );
};
