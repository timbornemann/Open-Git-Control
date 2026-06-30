import React from 'react';
import { GitMerge } from 'lucide-react';
import { useI18n } from '../../i18n';
import { ConflictManualEditor, ConflictSidePreview } from './ConflictEditorParts';
import { CONFLICT_LABELS, basename } from './utils';
import type {
  ConflictBlock,
  ConflictEditorState,
  ConflictEntry,
  ConflictResolutionChoice,
} from './types';
import { VirtualList } from '../VirtualList';

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
  const { tr } = useI18n();

  if (visibleConflicts.length === 0) {
    return null;
  }

  const isNavigationBusy = isConflictEditorLoading || conflictEditor?.isSaving === true;
  const conflictCountTitle = tr(
    'Konfliktbloecke (<<<<<<< ... >>>>>>>) in den sichtbaren Dateien, nicht nur Dateianzahl',
    'Conflict blocks (<<<<<<< ... >>>>>>>) in visible files, not only file count',
  );
  const visibleFilesLabel = tr(
    `${visibleConflicts.length} Datei${visibleConflicts.length !== 1 ? 'en' : ''}`,
    `${visibleConflicts.length} file${visibleConflicts.length !== 1 ? 's' : ''}`,
  );
  const conflictLabelForCode = (code: string) => {
    if (code === 'UU') return tr('Beide geaendert', 'Both modified');
    if (code === 'AA') return tr('Beide hinzugefuegt', 'Both added');
    if (code === 'DD') return tr('Beide geloescht', 'Both deleted');
    if (code === 'AU') return tr('Von uns hinzugefuegt', 'Added by us');
    if (code === 'UA') return tr('Von ihnen hinzugefuegt', 'Added by them');
    if (code === 'DU') return tr('Von uns geloescht', 'Deleted by us');
    if (code === 'UD') return tr('Von ihnen geloescht', 'Deleted by them');
    return CONFLICT_LABELS[code] || tr('Konflikt', 'Conflict');
  };

  const isCompactConflictSummary = Boolean(onOpenConflictResolver);

  return (
    <div className={`staging-section conflict-section${isConflictOnly ? ' conflict-section--resolve' : ''}${isCompactConflictSummary ? ' conflict-section--compact' : ''}`}>
      {!onOpenConflictResolver ? (
        <div className="conflict-resolver-header-shell">
          <div className="conflict-global-nav conflict-global-nav--header" role="group" aria-label={tr('Konflikt-Navigation ueber alle Dateien', 'Conflict navigation across all files')}>
            <button
              className="conflict-global-nav-btn conflict-global-nav-btn--prev"
              onClick={() => { void navigateToPreviousConflict(); }}
              disabled={!hasPreviousConflictTarget || isNavigationBusy}
            >
              {'<'} {tr('Zurueck', 'Back')}
            </button>
            <div className="conflict-global-nav-meta">
              <span className="conflict-global-nav-title">{tr('Konflikt-Navigation', 'Conflict navigation')}</span>
              <span className="conflict-global-nav-state">
                {isStructuredConflictViewLocked
                  ? tr('Manuelle Marker-Bearbeitung erkannt - Vergleich voruebergehend pausiert', 'Manual marker editing detected - comparison temporarily paused')
                  : (activeConflictFileIndex >= 0
                    ? tr(`Datei ${activeConflictFileIndex + 1} von ${conflictPaths.length}`, `File ${activeConflictFileIndex + 1} of ${conflictPaths.length}`)
                    : tr('Datei --', 'File --'))}
                {!isStructuredConflictViewLocked && conflictBlocks.length > 0
                  ? tr(` - Block ${safeSelectedConflictBlockIndex + 1} von ${conflictBlocks.length}`, ` - Block ${safeSelectedConflictBlockIndex + 1} of ${conflictBlocks.length}`)
                  : (!isStructuredConflictViewLocked ? tr(' - Keine Konfliktmarker in dieser Datei', ' - No conflict markers in this file') : '')}
              </span>
            </div>
            <button
              className="conflict-global-nav-btn conflict-global-nav-btn--next"
              onClick={() => { void navigateToNextConflict(); }}
              disabled={!hasNextConflictTarget || isNavigationBusy}
            >
              {tr('Weiter', 'Next')} {'>'}
            </button>
          </div>

          <div className="staging-section-header conflict-section-header">
            <span style={{ color: 'var(--status-danger)' }}>{tr('Konflikte', 'Conflicts')}</span>
            <span className="staging-count" title={conflictCountTitle}>
              {isConflictBlockCountPending && visibleConflicts.length > 0 ? '...' : totalConflictBlocksInView}
            </span>
            <span className="staging-stats-inline">{visibleFilesLabel}</span>
            <div style={{ flex: 1 }} />
          </div>
        </div>
      ) : (
        <div className="staging-section-header conflict-summary-header">
          <span style={{ color: 'var(--status-danger)' }}>{tr('Konflikte', 'Conflicts')}</span>
          <span className="staging-count" title={conflictCountTitle}>
            {isConflictBlockCountPending && visibleConflicts.length > 0 ? '...' : totalConflictBlocksInView}
          </span>
          <span className="staging-stats-inline">{visibleFilesLabel}</span>
          <div style={{ flex: 1 }} />
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
                    : (isConflictBlockCountPending ? ' - ...' : '')}
                </span>
                <span className="conflict-summary-action">{tr('Aufloesen', 'Resolve')}</span>
              </button>
            );
          })}
        </div>
      )}

      {!onOpenConflictResolver && (
        <div
          className={`conflict-layout${isConflictOnly ? ' conflict-layout--fill' : ''}`}
          style={{ borderBottom: '1px solid var(--border-color)', ...(isConflictOnly ? {} : { minHeight: '360px' }) }}
        >
          <div className="conflict-file-list" style={{ borderRight: '1px solid var(--border-color)', background: 'var(--bg-panel)', overflowY: 'auto' }}>
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
                  className={`conflict-sidebar-file ${isActive ? 'active' : ''}`}
                  style={{
                    width: '100%',
                    margin: 0,
                    borderRadius: 0,
                    borderTop: 'none',
                    borderRight: 'none',
                    borderBottom: '1px solid var(--line-subtle)',
                    backgroundColor: isActive ? 'var(--bg-dark)' : 'transparent',
                    padding: '12px 16px',
                    display: 'grid',
                    gridTemplateColumns: '30px minmax(0, 1fr)',
                    gap: '4px 8px',
                    alignItems: 'center',
                    borderLeft: isActive ? '3px solid var(--status-danger)' : '3px solid transparent',
                  }}
                  onClick={() => { void openConflictEditor(file.path); }}
                  title={file.path}
                >
                  <span className="conflict-file-icon" title={`Git status: ${file.code}`} aria-hidden="true">
                    <GitMerge size={15} strokeWidth={2.2} />
                  </span>
                  <span className="conflict-file-path" style={{ fontSize: '0.8rem', fontWeight: isActive ? 600 : 400 }}>{basename(file.path)}</span>
                  <span className="conflict-file-label" style={{ fontSize: '0.7rem' }}>
                    {conflictLabelForCode(file.code)}
                    {blocksForFile > 0
                      ? tr(` - ${blocksForFile} Block${blocksForFile !== 1 ? 'e' : ''}`, ` - ${blocksForFile} block${blocksForFile !== 1 ? 's' : ''}`)
                      : (isConflictBlockCountPending ? ' - ...' : '')}
                  </span>
                </button>
                );
              }}
            />
          </div>

          <div className="conflict-editor-panel" style={{ background: 'var(--bg-darker)' }}>
            {isConflictEditorLoading && (
              <div className="conflict-empty-state">{tr('Konfliktdatei wird geladen...', 'Loading conflict file...')}</div>
            )}

            {!isConflictEditorLoading && !conflictEditor && (
              <div className="conflict-empty-state">{tr('Waehle links eine Konfliktdatei aus.', 'Select a conflict file on the left.')}</div>
            )}

            {!isConflictEditorLoading && conflictEditor && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
                <div className="conflict-editor-toolbar" style={{ padding: '16px 20px', background: 'var(--bg-dark)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }} title={conflictEditor.filePath}>{basename(conflictEditor.filePath)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          color: conflictBlocks.length > 0 ? 'var(--conflict-code-current-text)' : 'var(--conflict-code-incoming-text)',
                          background: conflictBlocks.length > 0 ? 'var(--conflict-code-current-surface)' : 'var(--conflict-code-incoming-surface)',
                          border: `1px solid ${conflictBlocks.length > 0 ? 'var(--conflict-code-current-border)' : 'var(--conflict-code-incoming-border)'}`,
                          padding: '2px 8px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                        }}
                      >
                        {conflictBlocks.length > 0
                          ? tr(`${conflictBlocks.length} ungeloeste${conflictBlocks.length === 1 ? 'r' : ''} Block${conflictBlocks.length === 1 ? '' : 'e'}`, `${conflictBlocks.length} unresolved block${conflictBlocks.length === 1 ? '' : 's'}`)
                          : tr('Bereit zum Speichern', 'Ready to save')}
                      </span>
                      <button
                        className="staging-btn-sm"
                        style={{ padding: '2px 8px', fontSize: '0.7rem', border: '1px solid var(--border-color)', background: 'var(--bg-panel)' }}
                        onClick={reloadActiveConflictEditor}
                        disabled={conflictEditor.isSaving}
                      >
                        {tr('Neu laden', 'Reload')}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      className="staging-btn-sm"
                      style={{ border: '1px solid var(--border-color)', padding: '6px 12px', background: 'var(--bg-panel)' }}
                      onClick={() => applyConflictChoiceToAll('ours')}
                      disabled={conflictEditor.isSaving || conflictBlocks.length === 0}
                    >
                      {tr('Alle: Aktueller Stand', 'All: current version')}
                    </button>
                    <button
                      className="staging-btn-sm"
                      style={{ border: '1px solid var(--border-color)', padding: '6px 12px', background: 'var(--bg-panel)' }}
                      onClick={() => applyConflictChoiceToAll('theirs')}
                      disabled={conflictEditor.isSaving || conflictBlocks.length === 0}
                    >
                      {tr('Alle: Eingehender Stand', 'All: incoming version')}
                    </button>
                    <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />
                    <button
                      className="staging-btn-sm"
                      style={{ color: 'var(--on-accent)', background: 'var(--status-success)', border: 'none', padding: '6px 16px', fontWeight: 600 }}
                      onClick={() => { void markConflictResolvedAndSync(conflictEditor.filePath); }}
                    >
                      {tr('Als geloest markieren', 'Mark as resolved')}
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                  {isStructuredConflictViewLocked && (
                    <div className="conflict-editor-notice info" style={{ margin: '10px 20px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span>
                        {tr(
                          'Warnung: Unvollstaendige oder unbalancierte Konfliktmarker erkannt. Die Vergleichsansicht ist pausiert bis alle',
                          'Warning: Incomplete or unbalanced conflict markers detected. Comparison view is paused until all',
                        )}{' '}
                        <code>{'<<<<<<<'}</code> / <code>{'======='}</code> / <code>{'>>>>>>>'}</code>{' '}
                        {tr('Marker konsistent sind.', 'markers are consistent.')}
                      </span>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          className="staging-tool-btn"
                          onClick={() => { void reloadActiveConflictEditor(); }}
                          title={tr('Datei neu einlesen und Marker-Analyse wiederholen', 'Reload file and rerun marker analysis')}
                        >
                          {tr('Neu laden', 'Reload')}
                        </button>
                        <button
                          className="staging-tool-btn"
                          onClick={() => { void resetConflictEditorDraft(); }}
                          title={tr('Alle manuellen Aenderungen verwerfen und Originaldatei wiederherstellen', 'Discard all manual edits and restore original file')}
                        >
                          {tr('Aenderungen verwerfen', 'Discard changes')}
                        </button>
                      </div>
                    </div>
                  )}

                  {!isStructuredConflictViewLocked && conflictBlocks.length > 0 && selectedConflictBlock && (
                    <div className="conflict-structured-view">
                      <div className="conflict-block-header">
                        <div className="conflict-block-header-meta">
                          <span className="conflict-block-header-title">
                            {tr(`Konfliktblock ${safeSelectedConflictBlockIndex + 1} von ${conflictBlocks.length}`, `Conflict block ${safeSelectedConflictBlockIndex + 1} of ${conflictBlocks.length}`)}
                          </span>
                          <span className="conflict-block-header-range">
                            {tr(`Zeile ${selectedConflictBlock.startLine} - ${selectedConflictBlock.endLine}`, `Line ${selectedConflictBlock.startLine} - ${selectedConflictBlock.endLine}`)}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--border-color)', gap: '1px', minHeight: 0 }}>
                        <div style={{ background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--conflict-version-current-surface)', flexShrink: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--conflict-version-current-text)' }}>
                              {tr('Aktueller Stand', 'Current version')} {selectedConflictBlock.oursLabel ? `(${selectedConflictBlock.oursLabel})` : ''}
                            </span>
                            <button
                              className="staging-btn-sm"
                              style={{ padding: '4px 12px', background: 'var(--conflict-version-current-surface-strong)', color: 'var(--conflict-version-current-text)', border: '1px solid var(--conflict-version-current-border)', fontWeight: 600 }}
                              onClick={() => applyConflictChoiceToSelected('ours')}
                              disabled={conflictEditor.isSaving}
                            >
                              {tr('Uebernehmen', 'Apply')}
                            </button>
                          </div>
                          <div className="conflict-side-preview-scroll" title={tr('Zeilennummern nur fuer diesen Konfliktblock (Aktueller Stand)', 'Line numbers only for this conflict block (current version)')}>
                            <ConflictSidePreview text={selectedConflictBlock.ours} variant="ours" />
                          </div>
                        </div>

                        <div style={{ background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--conflict-version-incoming-surface)', flexShrink: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--conflict-version-incoming-text)' }}>
                              {tr('Eingehender Stand', 'Incoming version')} {selectedConflictBlock.theirsLabel ? `(${selectedConflictBlock.theirsLabel})` : ''}
                            </span>
                            <button
                              className="staging-btn-sm"
                              style={{ padding: '4px 12px', background: 'var(--conflict-version-incoming-surface-strong)', color: 'var(--conflict-version-incoming-text)', border: '1px solid var(--conflict-version-incoming-border)', fontWeight: 600 }}
                              onClick={() => applyConflictChoiceToSelected('theirs')}
                              disabled={conflictEditor.isSaving}
                            >
                              {tr('Uebernehmen', 'Apply')}
                            </button>
                          </div>
                          <div className="conflict-side-preview-scroll" title={tr('Zeilennummern nur fuer diesen Konfliktblock (Eingehender Stand)', 'Line numbers only for this conflict block (incoming version)')}>
                            <ConflictSidePreview text={selectedConflictBlock.theirs} variant="theirs" />
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: '12px 20px', background: 'var(--bg-darker)', borderTop: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'center' }}>
                        <button
                          className="staging-btn-sm"
                          style={{ padding: '6px 24px', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', fontWeight: 600, fontSize: '0.8rem' }}
                          onClick={() => applyConflictChoiceToSelected('both')}
                          disabled={conflictEditor.isSaving}
                        >
                          {tr('Beide Staende uebernehmen (Aktueller zuerst)', 'Take both versions (current first)')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="conflict-manual-edit-root">
                    <div className="conflict-manual-action-bar">
                      <span className="conflict-manual-action-title">{tr('Editor-Aktionen', 'Editor actions')}</span>
                      <div className="conflict-manual-action-buttons">
                        <button
                          className="staging-btn-sm conflict-manual-action-btn"
                          onClick={resetConflictEditorDraft}
                          disabled={!isConflictEditorDirty || conflictEditor.isSaving}
                        >
                          {tr('Aenderungen verwerfen', 'Discard changes')}
                        </button>
                        <button
                          className="staging-btn-sm conflict-manual-action-btn"
                          onClick={() => { void saveConflictEditor(false); }}
                          disabled={conflictEditor.isSaving || !isConflictEditorDirty}
                        >
                          {tr('Speichern', 'Save')}
                        </button>
                        <button
                          className="staging-btn-sm conflict-manual-action-btn conflict-manual-action-btn--success"
                          onClick={() => { void saveConflictEditor(true); }}
                          disabled={conflictEditor.isSaving || conflictBlocks.length > 0}
                        >
                          {tr('Speichern + Geloest', 'Save + resolved')}
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
