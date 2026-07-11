import type React from 'react';
import { useI18n } from '@/i18n';
import { ConflictManualEditor } from './ConflictEditorParts';
import type { ConflictEditorState } from './types';

type ConflictManualSectionProps = {
  conflictEditor: ConflictEditorState;
  conflictBlocksCount: number;
  hasUnresolvedConflictMarkers: boolean;
  isConflictEditorDirty: boolean;
  conflictManualScrollRef: React.RefObject<HTMLDivElement>;
  resetConflictEditorDraft: () => void;
  saveConflictEditor: (markResolvedAfterSave: boolean) => Promise<void> | void;
  onConflictEditorContentChange: (filePath: string, nextContent: string) => void;
};

export const ConflictManualSection = ({
  conflictEditor,
  conflictBlocksCount,
  hasUnresolvedConflictMarkers,
  isConflictEditorDirty,
  conflictManualScrollRef,
  resetConflictEditorDraft,
  saveConflictEditor,
  onConflictEditorContentChange,
}: ConflictManualSectionProps) => {
  const { t } = useI18n();

  return (
    <div className="conflict-manual-edit-root">
      <div className="conflict-manual-action-bar">
        <span className="conflict-manual-action-title">{t('generated.components.staging_area.conflictresolverpanel.editor_actions_b004229c')}</span>
        <div className="conflict-manual-action-buttons">
          <button
            className="staging-btn-sm conflict-manual-action-btn"
            onClick={resetConflictEditorDraft}
            disabled={!isConflictEditorDirty || conflictEditor.isSaving}
          >
            {t('generated.components.staging_area.conflictresolverpanel.discard_changes_b80ac3bd')}
          </button>
          <button
            className="staging-btn-sm conflict-manual-action-btn"
            onClick={() => {
              void saveConflictEditor(false);
            }}
            disabled={conflictEditor.isSaving || !isConflictEditorDirty}
          >
            {t('generated.components.input.save_b6a0ea4a')}
          </button>
          <button
            className="staging-btn-sm conflict-manual-action-btn conflict-manual-action-btn--success"
            onClick={() => {
              void saveConflictEditor(true);
            }}
            disabled={conflictEditor.isSaving || conflictBlocksCount > 0 || hasUnresolvedConflictMarkers}
          >
            {t('generated.components.staging_area.conflictresolverpanel.save_resolved_20637e12')}
          </button>
        </div>
      </div>
      <ConflictManualEditor
        ref={conflictManualScrollRef}
        content={conflictEditor.content}
        disabled={conflictEditor.isSaving}
        onChange={(next) => onConflictEditorContentChange(conflictEditor.filePath, next)}
      />
    </div>
  );
};
