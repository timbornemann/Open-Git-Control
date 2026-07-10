import { Button, cx } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { ConflictEditorState, ConflictResolutionChoice } from './types';
import { basename } from './utils';

type ConflictEditorToolbarProps = {
  conflictEditor: ConflictEditorState;
  conflictBlocksCount: number;
  hasUnresolvedConflictMarkers: boolean;
  reloadActiveConflictEditor: () => Promise<void> | void;
  applyConflictChoiceToAll: (choice: ConflictResolutionChoice) => void;
  markConflictResolvedAndSync: (filePath: string) => Promise<void> | void;
  resolveConflictByDeletion: (filePath: string) => Promise<void> | void;
};

export const ConflictEditorToolbar = ({
  conflictEditor,
  conflictBlocksCount,
  hasUnresolvedConflictMarkers,
  reloadActiveConflictEditor,
  applyConflictChoiceToAll,
  markConflictResolvedAndSync,
  resolveConflictByDeletion,
}: ConflictEditorToolbarProps) => {
  const { t, tr } = useI18n();

  return (
    <div className="conflict-editor-toolbar conflict-editor-toolbar--resolver">
      <div className="conflict-editor-title-group">
        <div className="conflict-editor-title" title={conflictEditor.filePath}>
          {basename(conflictEditor.filePath)}
        </div>
        <div className="conflict-editor-meta-row">
          <span className={cx('conflict-editor-state-badge', conflictBlocksCount > 0 && 'conflict-editor-state-badge--unresolved')}>
            {conflictBlocksCount > 0
              ? tr(
                  `${conflictBlocksCount} ungeloeste${conflictBlocksCount === 1 ? 'r' : ''} Block${conflictBlocksCount === 1 ? '' : 'e'}`,
                  `${conflictBlocksCount} unresolved block${conflictBlocksCount === 1 ? '' : 's'}`,
                )
              : t('generated.components.staging_area.conflictresolverpanel.ready_to_save_cfc68801')}
          </span>
          <Button size="xs" variant="secondary" onClick={reloadActiveConflictEditor} disabled={conflictEditor.isSaving}>
            {t('generated.components.staging_area.conflictresolverpanel.reload_e5199249')}
          </Button>
        </div>
      </div>
      <div className="conflict-editor-toolbar-actions conflict-editor-toolbar-actions--resolver">
        <Button variant="secondary" onClick={() => applyConflictChoiceToAll('ours')} disabled={conflictEditor.isSaving || conflictBlocksCount === 0}>
          {t('generated.components.staging_area.conflictresolverpanel.all_current_version_070e33f1')}
        </Button>
        <Button variant="secondary" onClick={() => applyConflictChoiceToAll('theirs')} disabled={conflictEditor.isSaving || conflictBlocksCount === 0}>
          {t('generated.components.staging_area.conflictresolverpanel.all_incoming_version_24786320')}
        </Button>
        <div className="conflict-toolbar-divider" />
        <Button
          variant="danger"
          disabled={conflictEditor.isSaving}
          onClick={() => {
            void resolveConflictByDeletion(conflictEditor.filePath);
          }}
          title={tr(
            'Loest den Konflikt, indem die Datei geloescht wird (geloeschte Seite uebernehmen).',
            'Resolves the conflict by deleting the file (take the deleted side).',
          )}
        >
          {tr('Loeschung uebernehmen', 'Take deleted side')}
        </Button>
        <Button
          variant="success"
          disabled={conflictEditor.isSaving || hasUnresolvedConflictMarkers}
          onClick={() => {
            void markConflictResolvedAndSync(conflictEditor.filePath);
          }}
        >
          {t('generated.components.staging_area.conflictresolverpanel.mark_as_resolved_da4d2394')}
        </Button>
      </div>
    </div>
  );
};
