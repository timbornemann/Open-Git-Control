import React from 'react';
import { GitMerge } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button, Toolbar, cx } from '@/components/ui';
import { ConflictManualEditor, ConflictSidePreview } from './ConflictEditorParts';
import { CONFLICT_LABELS, basename } from './utils';
import type { ConflictBlock, ConflictEditorState, ConflictEntry, ConflictResolutionChoice } from './types';
import { VirtualList } from '@/components/VirtualList';

type ConflictResolverPanelProps = {
  visibleConflicts: ConflictEntry[];
  isConflictOnly: boolean;
  onOpenConflictResolver?: (filePath: string) => void;
  isConflictBlockCountPending: boolean;
  totalConflictBlocksInView: number;
  conflictEditor: ConflictEditorState | null;
  isConflictEditorLoading: boolean;
  blockCountForPath: (path: string) => number;
  openConflictEditor: (filePath: string, initialBlockIndex?: number) => Promise<void> | void;
  reloadActiveConflictEditor: () => Promise<void> | void;
  applyConflictChoiceToAll: (choice: ConflictResolutionChoice) => void;
  markConflictResolvedAndSync: (filePath: string) => Promise<void> | void;
  hasPreviousConflictTarget: boolean;
  hasNextConflictTarget: boolean;
  navigateToPreviousConflict: () => Promise<void> | void;
  navigateToNextConflict: () => Promise<void> | void;
  isStructuredConflictViewLocked: boolean;
  activeConflictFileIndex: number;
  conflictPaths: string[];
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

export const ConflictResolverPanel: React.FC<ConflictResolverPanelProps> = ({
  visibleConflicts,
  isConflictOnly,
  onOpenConflictResolver,
  isConflictBlockCountPending,
  totalConflictBlocksInView,
  conflictEditor,
  isConflictEditorLoading,
  blockCountForPath,
  openConflictEditor,
  reloadActiveConflictEditor,
  applyConflictChoiceToAll,
  markConflictResolvedAndSync,
  hasPreviousConflictTarget,
  hasNextConflictTarget,
  navigateToPreviousConflict,
  navigateToNextConflict,
  isStructuredConflictViewLocked,
  activeConflictFileIndex,
  conflictPaths,
  conflictBlocks,
  selectedConflictBlock,
  safeSelectedConflictBlockIndex,
  applyConflictChoiceToSelected,
  resetConflictEditorDraft,
  saveConflictEditor,
  isConflictEditorDirty,
  conflictManualScrollRef,
  onConflictEditorContentChange,
}) => {
  const { t, tr } = useI18n();

  if (visibleConflicts.length === 0) {
    return null;
  }

  const isNavigationBusy = isConflictEditorLoading || conflictEditor?.isSaving === true;
  const conflictCountTitle = t('generated.components.staging_area.conflictresolverpanel.conflict_blocks_in_visible_files_not_only_file_count_47a797f8');
  const visibleFilesLabel = tr(
    `${visibleConflicts.length} Datei${visibleConflicts.length !== 1 ? 'en' : ''}`,
    `${visibleConflicts.length} file${visibleConflicts.length !== 1 ? 's' : ''}`,
  );
  const conflictLabelForCode = (code: string) => {
    if (code === 'UU') return t('generated.components.staging_area.conflictresolverpanel.both_modified_8049c5d2');
    if (code === 'AA') return t('generated.components.staging_area.conflictresolverpanel.both_added_3f407adb');
    if (code === 'DD') return t('generated.components.staging_area.conflictresolverpanel.both_deleted_93a3b84e');
    if (code === 'AU') return t('generated.components.staging_area.conflictresolverpanel.added_by_us_3a2b61da');
    if (code === 'UA') return t('generated.components.staging_area.conflictresolverpanel.added_by_them_89aa7951');
    if (code === 'DU') return t('generated.components.staging_area.conflictresolverpanel.deleted_by_us_b5e00b54');
    if (code === 'UD') return t('generated.components.staging_area.conflictresolverpanel.deleted_by_them_4bf23bbf');
    return CONFLICT_LABELS[code] || t('generated.components.staging_area.conflictresolverpanel.conflict_4f6ad783');
  };

  const isCompactConflictSummary = Boolean(onOpenConflictResolver);

  return (
    <div
      className={`staging-section conflict-section${isConflictOnly ? ' conflict-section--resolve' : ''}${isCompactConflictSummary ? ' conflict-section--compact' : ''}`}
    >
      {!onOpenConflictResolver ? (
        <div className="conflict-resolver-header-shell">
          <div
            className="conflict-global-nav conflict-global-nav--header"
            role="group"
            aria-label={t('generated.components.staging_area.conflictresolverpanel.conflict_navigation_across_all_files_cfe632bc')}
          >
            <button
              className="conflict-global-nav-btn conflict-global-nav-btn--prev"
              onClick={() => {
                void navigateToPreviousConflict();
              }}
              disabled={!hasPreviousConflictTarget || isNavigationBusy}
            >
              {'<'} {t('generated.components.layout.main.maininspectorpane.back_c5e2bc76')}
            </button>
            <div className="conflict-global-nav-meta">
              <span className="conflict-global-nav-title">{t('generated.components.staging_area.conflictresolverpanel.conflict_navigation_515daa8f')}</span>
              <span className="conflict-global-nav-state">
                {isStructuredConflictViewLocked
                  ? t('generated.components.staging_area.conflictresolverpanel.manual_marker_editing_detected_comparison_temporarily_pa_e67c6165')
                  : activeConflictFileIndex >= 0
                    ? tr(`Datei ${activeConflictFileIndex + 1} von ${conflictPaths.length}`, `File ${activeConflictFileIndex + 1} of ${conflictPaths.length}`)
                    : t('generated.components.staging_area.conflictresolverpanel.file_968af4e2')}
                {!isStructuredConflictViewLocked && conflictBlocks.length > 0
                  ? tr(
                      ` - Block ${safeSelectedConflictBlockIndex + 1} von ${conflictBlocks.length}`,
                      ` - Block ${safeSelectedConflictBlockIndex + 1} of ${conflictBlocks.length}`,
                    )
                  : !isStructuredConflictViewLocked
                    ? t('generated.components.staging_area.conflictresolverpanel.no_conflict_markers_in_this_file_58c4dc70')
                    : ''}
              </span>
            </div>
            <button
              className="conflict-global-nav-btn conflict-global-nav-btn--next"
              onClick={() => {
                void navigateToNextConflict();
              }}
              disabled={!hasNextConflictTarget || isNavigationBusy}
            >
              {t('generated.components.staging_area.conflictresolverpanel.next_b53e1a35')} {'>'}
            </button>
          </div>

          <div className="staging-section-header conflict-section-header">
            <span className="conflict-section-label-danger">{t('generated.components.staging_area.conflictresolverpanel.conflicts_676ac762')}</span>
            <span className="staging-count" title={conflictCountTitle}>
              {isConflictBlockCountPending && visibleConflicts.length > 0 ? '...' : totalConflictBlocksInView}
            </span>
            <span className="staging-stats-inline">{visibleFilesLabel}</span>
            <div className="conflict-header-spacer" />
          </div>
        </div>
      ) : (
        <div className="staging-section-header conflict-summary-header">
          <span className="conflict-section-label-danger">{t('generated.components.staging_area.conflictresolverpanel.conflicts_676ac762')}</span>
          <span className="staging-count" title={conflictCountTitle}>
            {isConflictBlockCountPending && visibleConflicts.length > 0 ? '...' : totalConflictBlocksInView}
          </span>
          <span className="staging-stats-inline">{visibleFilesLabel}</span>
          <div className="conflict-header-spacer" />
        </div>
      )}

      {onOpenConflictResolver && (
        <div className="conflict-summary-list">
          {visibleConflicts.map((file) => {
            const blocksForFile = blockCountForPath(file.path);
            return (
              <button
                key={`summary-c-${file.path}`}
                className="conflict-summary-file"
                onClick={() => onOpenConflictResolver(file.path)}
                title={`${file.path} - ${conflictLabelForCode(file.code)} (${file.code})`}
              >
                <span className="conflict-file-icon" title={`Git status: ${file.code}`} aria-hidden="true">
                  <GitMerge size={15} strokeWidth={2.2} />
                </span>
                <span className="conflict-file-path">{basename(file.path)}</span>
                <span className="conflict-file-label">
                  {conflictLabelForCode(file.code)}
                  {blocksForFile > 0
                    ? tr(` - ${blocksForFile} Block${blocksForFile !== 1 ? 'e' : ''}`, ` - ${blocksForFile} block${blocksForFile !== 1 ? 's' : ''}`)
                    : isConflictBlockCountPending
                      ? ' - ...'
                      : ''}
                </span>
                <span className="conflict-summary-action">{t('generated.components.staging_area.conflictresolverpanel.resolve_b2151049')}</span>
              </button>
            );
          })}
        </div>
      )}

      {!onOpenConflictResolver && (
        <div
          className={cx(
            'conflict-layout conflict-layout--embedded',
            isConflictOnly && 'conflict-layout--fill',
            !isConflictOnly && 'conflict-layout--with-min-height',
          )}
        >
          <div className="conflict-file-list conflict-file-list--resolver">
            <VirtualList
              items={visibleConflicts}
              rowHeight={62}
              maxHeight={isConflictOnly ? 744 : 372}
              overscan={8}
              getKey={(file) => `c-${file.path}`}
              renderItem={(file) => {
                const isActive = conflictEditor?.filePath === file.path;
                const blocksForFile = blockCountForPath(file.path);
                return (
                  <button
                    className={cx('conflict-sidebar-file conflict-sidebar-file--resolver', isActive && 'active')}
                    onClick={() => {
                      void openConflictEditor(file.path);
                    }}
                    title={file.path}
                  >
                    <span className="conflict-file-icon" title={`Git status: ${file.code}`} aria-hidden="true">
                      <GitMerge size={15} strokeWidth={2.2} />
                    </span>
                    <span className="conflict-file-path">{basename(file.path)}</span>
                    <span className="conflict-file-label">
                      {conflictLabelForCode(file.code)}
                      {blocksForFile > 0
                        ? tr(` - ${blocksForFile} Block${blocksForFile !== 1 ? 'e' : ''}`, ` - ${blocksForFile} block${blocksForFile !== 1 ? 's' : ''}`)
                        : isConflictBlockCountPending
                          ? ' - ...'
                          : ''}
                    </span>
                  </button>
                );
              }}
            />
          </div>

          <div className="conflict-editor-panel">
            {isConflictEditorLoading && (
              <div className="conflict-empty-state">{t('generated.components.staging_area.conflictresolverpanel.loading_conflict_file_38c6fa8f')}</div>
            )}

            {!isConflictEditorLoading && !conflictEditor && (
              <div className="conflict-empty-state">
                {t('generated.components.staging_area.conflictresolverpanel.select_a_conflict_file_on_the_left_e2f52cfd')}
              </div>
            )}

            {!isConflictEditorLoading && conflictEditor && (
              <div className="conflict-editor-shell">
                <div className="conflict-editor-toolbar conflict-editor-toolbar--resolver">
                  <div className="conflict-editor-title-group">
                    <div className="conflict-editor-title" title={conflictEditor.filePath}>
                      {basename(conflictEditor.filePath)}
                    </div>
                    <div className="conflict-editor-meta-row">
                      <span className={cx('conflict-editor-state-badge', conflictBlocks.length > 0 && 'conflict-editor-state-badge--unresolved')}>
                        {conflictBlocks.length > 0
                          ? tr(
                              `${conflictBlocks.length} ungeloeste${conflictBlocks.length === 1 ? 'r' : ''} Block${conflictBlocks.length === 1 ? '' : 'e'}`,
                              `${conflictBlocks.length} unresolved block${conflictBlocks.length === 1 ? '' : 's'}`,
                            )
                          : t('generated.components.staging_area.conflictresolverpanel.ready_to_save_cfc68801')}
                      </span>
                      <Button size="xs" variant="secondary" onClick={reloadActiveConflictEditor} disabled={conflictEditor.isSaving}>
                        {t('generated.components.staging_area.conflictresolverpanel.reload_e5199249')}
                      </Button>
                    </div>
                  </div>
                  <div className="conflict-editor-toolbar-actions conflict-editor-toolbar-actions--resolver">
                    <Button
                      variant="secondary"
                      onClick={() => applyConflictChoiceToAll('ours')}
                      disabled={conflictEditor.isSaving || conflictBlocks.length === 0}
                    >
                      {t('generated.components.staging_area.conflictresolverpanel.all_current_version_070e33f1')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => applyConflictChoiceToAll('theirs')}
                      disabled={conflictEditor.isSaving || conflictBlocks.length === 0}
                    >
                      {t('generated.components.staging_area.conflictresolverpanel.all_incoming_version_24786320')}
                    </Button>
                    <div className="conflict-toolbar-divider" />
                    <Button
                      variant="success"
                      onClick={() => {
                        void markConflictResolvedAndSync(conflictEditor.filePath);
                      }}
                    >
                      {t('generated.components.staging_area.conflictresolverpanel.mark_as_resolved_da4d2394')}
                    </Button>
                  </div>
                </div>

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
                    <div className="conflict-structured-view">
                      <div className="conflict-block-header">
                        <div className="conflict-block-header-meta">
                          <span className="conflict-block-header-title">
                            {tr(
                              `Konfliktblock ${safeSelectedConflictBlockIndex + 1} von ${conflictBlocks.length}`,
                              `Conflict block ${safeSelectedConflictBlockIndex + 1} of ${conflictBlocks.length}`,
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
                              disabled={conflictEditor.isSaving}
                            >
                              {t('generated.components.staging_area.conflictresolverpanel.apply_f47d6702')}
                            </Button>
                          </div>
                          <div
                            className="conflict-side-preview-scroll"
                            title={t(
                              'generated.components.staging_area.conflictresolverpanel.line_numbers_only_for_this_conflict_block_current_versio_2fbd64b0',
                            )}
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
                              disabled={conflictEditor.isSaving}
                            >
                              {t('generated.components.staging_area.conflictresolverpanel.apply_f47d6702')}
                            </Button>
                          </div>
                          <div
                            className="conflict-side-preview-scroll"
                            title={t(
                              'generated.components.staging_area.conflictresolverpanel.line_numbers_only_for_this_conflict_block_incoming_versi_0981bfb2',
                            )}
                          >
                            <ConflictSidePreview text={selectedConflictBlock.theirs} variant="theirs" />
                          </div>
                        </div>
                      </div>

                      <div className="conflict-take-both-row">
                        <Button variant="secondary" onClick={() => applyConflictChoiceToSelected('both')} disabled={conflictEditor.isSaving}>
                          {t('generated.components.staging_area.conflictresolverpanel.take_both_versions_current_first_03b23e50')}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="conflict-manual-edit-root">
                    <div className="conflict-manual-action-bar">
                      <span className="conflict-manual-action-title">
                        {t('generated.components.staging_area.conflictresolverpanel.editor_actions_b004229c')}
                      </span>
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
                          disabled={conflictEditor.isSaving || conflictBlocks.length > 0}
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
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
