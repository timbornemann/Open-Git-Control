import React from 'react';
import { ConflictManualEditor, ConflictSidePreview } from './ConflictEditorParts';
import { CONFLICT_LABELS } from './utils';
import type {
  ConflictBlock,
  ConflictEditorState,
  ConflictEntry,
  ConflictResolutionChoice,
} from './types';

type ConflictResolverPanelProps = {
  visibleConflicts: ConflictEntry[];
  isConflictOnly: boolean;
  onOpenConflictResolver?: (filePath: string) => void;
  isConflictBlockCountPending: boolean;
  totalConflictBlocksInView: number;
  mergeContinue: () => void;
  mergeAbort: () => void;
  rebaseContinue: () => void;
  rebaseAbort: () => void;
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
  mergeContinue,
  mergeAbort,
  rebaseContinue,
  rebaseAbort,
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
  if (visibleConflicts.length === 0) {
    return null;
  }

  const isNavigationBusy = isConflictEditorLoading || conflictEditor?.isSaving === true;

  return (
    <div className={`staging-section conflict-section${isConflictOnly ? ' conflict-section--resolve' : ''}`}>
      {!onOpenConflictResolver && (
        <div className="conflict-global-nav conflict-global-nav--header" role="group" aria-label="Konflikt-Navigation ueber alle Dateien">
          <button
            className="conflict-global-nav-btn conflict-global-nav-btn--prev"
            onClick={() => { void navigateToPreviousConflict(); }}
            disabled={!hasPreviousConflictTarget || isNavigationBusy}
          >
            {'<'} Zurueck
          </button>
          <div className="conflict-global-nav-meta">
            <span className="conflict-global-nav-title">Konflikt-Navigation</span>
            <span className="conflict-global-nav-state">
              {isStructuredConflictViewLocked
                ? 'Manuelle Marker-Bearbeitung erkannt - Vergleich voruebergehend pausiert'
                : (activeConflictFileIndex >= 0
                  ? `Datei ${activeConflictFileIndex + 1} von ${conflictPaths.length}`
                  : 'Datei --')}
              {!isStructuredConflictViewLocked && conflictBlocks.length > 0
                ? ` - Block ${safeSelectedConflictBlockIndex + 1} von ${conflictBlocks.length}`
                : (!isStructuredConflictViewLocked ? ' - Keine Konfliktmarker in dieser Datei' : '')}
            </span>
          </div>
          <button
            className="conflict-global-nav-btn conflict-global-nav-btn--next"
            onClick={() => { void navigateToNextConflict(); }}
            disabled={!hasNextConflictTarget || isNavigationBusy}
          >
            Weiter {'>'}
          </button>
        </div>
      )}

      <div className={`staging-section-header${!onOpenConflictResolver ? ' conflict-section-header' : ''}`}>
        <span style={{ color: 'var(--status-danger)' }}>Konflikte</span>
        <span className="staging-count" title="Konfliktbloecke (<<<<<<< ... >>>>>>>) in den sichtbaren Dateien, nicht nur Dateianzahl">
          {isConflictBlockCountPending && visibleConflicts.length > 0 ? '...' : totalConflictBlocksInView}
        </span>
        <span className="staging-stats-inline">
          {visibleConflicts.length} Datei{visibleConflicts.length !== 1 ? 'en' : ''}
        </span>
        <div style={{ flex: 1 }} />
      </div>

      {!onOpenConflictResolver && (
        <div className="conflict-global-actions">
          <span className="conflict-global-actions-summary">
            {isConflictBlockCountPending && visibleConflicts.length > 0
              ? 'Konfliktbloecke werden gezaehlt...'
              : `${totalConflictBlocksInView} Konfliktblock${totalConflictBlocksInView !== 1 ? 'e' : ''} in ${visibleConflicts.length} Datei${visibleConflicts.length !== 1 ? 'en' : ''}`}
          </span>
          <div className="conflict-global-actions-buttons">
            <button className="staging-btn-sm conflict-action-btn" onClick={mergeContinue} title="Merge abschliessen">Merge fortsetzen</button>
            <button className="staging-btn-sm danger conflict-action-btn conflict-action-btn--danger" onClick={mergeAbort} title="Merge abbrechen">Merge abbrechen</button>
            <div className="conflict-action-divider" />
            <button className="staging-btn-sm conflict-action-btn" onClick={rebaseContinue} title="Rebase fortsetzen">Rebase fortsetzen</button>
            <button className="staging-btn-sm danger conflict-action-btn conflict-action-btn--danger" onClick={rebaseAbort} title="Rebase abbrechen">Rebase abbrechen</button>
          </div>
        </div>
      )}

      {onOpenConflictResolver && (
        <div className="conflict-sidebar-list">
          {visibleConflicts.map((f) => (
            <button
              key={`sidebar-c-${f.path}`}
              className="conflict-sidebar-file"
              onClick={() => onOpenConflictResolver(f.path)}
              title={f.path}
            >
              <span className="conflict-file-code">{f.code}</span>
              <span className="conflict-file-path">{f.path}</span>
              <span className="conflict-file-label">{CONFLICT_LABELS[f.code] || 'Konflikt'}</span>
            </button>
          ))}
        </div>
      )}

      {!onOpenConflictResolver && (
        <div
          className={`conflict-layout${isConflictOnly ? ' conflict-layout--fill' : ''}`}
          style={{ borderBottom: '1px solid var(--border-color)', ...(isConflictOnly ? {} : { minHeight: '360px' }) }}
        >
          <div className="conflict-file-list" style={{ borderRight: '1px solid var(--border-color)', background: 'var(--bg-panel)', overflowY: 'auto' }}>
            {visibleConflicts.map((f) => {
              const isActive = conflictEditor?.filePath === f.path;
              const blocksForFile = blockCountForPath(f.path);
              return (
                <button
                  key={`c-${f.path}`}
                  className={`conflict-sidebar-file ${isActive ? 'active' : ''}`}
                  style={{
                    width: '100%', margin: 0, borderRadius: 0, borderTop: 'none', borderRight: 'none', borderBottom: '1px solid var(--line-subtle)',
                    backgroundColor: isActive ? 'var(--bg-dark)' : 'transparent',
                    padding: '12px 16px',
                    display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', gap: '4px 8px', alignItems: 'center',
                    borderLeft: isActive ? '3px solid var(--status-danger)' : '3px solid transparent',
                  }}
                  onClick={() => { void openConflictEditor(f.path); }}
                  title={f.path}
                >
                  <span className="conflict-file-code" style={{ gridRow: '1 / span 2', fontSize: '0.8rem' }}>{f.code}</span>
                  <span className="conflict-file-path" style={{ fontSize: '0.8rem', fontWeight: isActive ? 600 : 400 }}>{f.path}</span>
                  <span className="conflict-file-label" style={{ fontSize: '0.7rem' }}>
                    {CONFLICT_LABELS[f.code] || 'Konflikt'}
                    {blocksForFile > 0
                      ? ` - ${blocksForFile} Block${blocksForFile !== 1 ? 'e' : ''}`
                      : (isConflictBlockCountPending ? ' - ...' : '')}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="conflict-editor-panel" style={{ background: 'var(--bg-darker)' }}>
            {isConflictEditorLoading && (
              <div className="conflict-empty-state">Konfliktdatei wird geladen...</div>
            )}

            {!isConflictEditorLoading && !conflictEditor && (
              <div className="conflict-empty-state">Waehle links eine Konfliktdatei aus.</div>
            )}

            {!isConflictEditorLoading && conflictEditor && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
                <div className="conflict-editor-toolbar" style={{ padding: '16px 20px', background: 'var(--bg-dark)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }} title={conflictEditor.filePath}>{conflictEditor.filePath}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        color: conflictBlocks.length > 0 ? 'var(--status-warning)' : 'var(--status-success)',
                        background: conflictBlocks.length > 0 ? 'var(--status-warning-soft)' : 'var(--status-success-soft)',
                        border: `1px solid ${conflictBlocks.length > 0 ? 'var(--status-warning-border)' : 'var(--status-success-border)'}`,
                        padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600,
                      }}>
                        {conflictBlocks.length > 0 ? `${conflictBlocks.length} ungeloeste${conflictBlocks.length === 1 ? 'r' : ''} Block${conflictBlocks.length === 1 ? '' : 'e'}` : 'Bereit zum Speichern'}
                      </span>
                      <button className="staging-btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem', border: '1px solid var(--border-color)', background: 'var(--bg-panel)' }} onClick={reloadActiveConflictEditor} disabled={conflictEditor.isSaving}>Neu laden</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '6px 12px', background: 'var(--bg-panel)' }} onClick={() => applyConflictChoiceToAll('ours')} disabled={conflictEditor.isSaving || conflictBlocks.length === 0}>Alle: Aktueller Stand</button>
                    <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '6px 12px', background: 'var(--bg-panel)' }} onClick={() => applyConflictChoiceToAll('theirs')} disabled={conflictEditor.isSaving || conflictBlocks.length === 0}>Alle: Eingehender Stand</button>
                    <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />
                    <button className="staging-btn-sm" style={{
                      color: 'var(--on-accent)', background: 'var(--status-success)', border: 'none', padding: '6px 16px', fontWeight: 600,
                    }} onClick={() => { void markConflictResolvedAndSync(conflictEditor.filePath); }}>Als geloest markieren</button>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                  {isStructuredConflictViewLocked && (
                    <div className="conflict-editor-notice info" style={{ margin: '10px 20px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span>
                        ⚠ Unvollständige oder unbalancierte Konfliktmarker erkannt. Die Vergleichsansicht ist pausiert bis alle <code>{'<<<<<<<'}</code> / <code>{'======='}</code> / <code>{'>>>>>>>'}</code> Marker konsistent sind.
                      </span>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          className="staging-tool-btn"
                          onClick={() => { void reloadActiveConflictEditor(); }}
                          title="Datei neu einlesen und Marker-Analyse wiederholen"
                        >
                          ↺ Neu laden
                        </button>
                        <button
                          className="staging-tool-btn"
                          onClick={() => { void resetConflictEditorDraft(); }}
                          title="Alle manuellen Änderungen verwerfen und Originaldatei wiederherstellen"
                        >
                          ✕ Änderungen verwerfen
                        </button>
                      </div>
                    </div>
                  )}

                  {!isStructuredConflictViewLocked && conflictBlocks.length > 0 && selectedConflictBlock && (
                    <div className="conflict-structured-view">
                      <div className="conflict-block-header">
                        <div className="conflict-block-header-meta">
                          <span className="conflict-block-header-title">Konfliktblock {safeSelectedConflictBlockIndex + 1} von {conflictBlocks.length}</span>
                          <span className="conflict-block-header-range">Zeile {selectedConflictBlock.startLine} - {selectedConflictBlock.endLine}</span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--border-color)', gap: '1px', minHeight: 0 }}>
                        <div style={{ background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--status-warning-soft)', flexShrink: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--status-warning)' }}>Aktueller Stand {selectedConflictBlock.oursLabel ? `(${selectedConflictBlock.oursLabel})` : ''}</span>
                            <button className="staging-btn-sm" style={{ padding: '4px 12px', background: 'var(--status-warning)', color: 'var(--on-accent)', border: 'none', fontWeight: 600 }} onClick={() => applyConflictChoiceToSelected('ours')} disabled={conflictEditor.isSaving}>Uebernehmen</button>
                          </div>
                          <div className="conflict-side-preview-scroll" title="Zeilennummern nur fuer diesen Konfliktblock (Aktueller Stand)">
                            <ConflictSidePreview text={selectedConflictBlock.ours} variant="ours" />
                          </div>
                        </div>

                        <div style={{ background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--status-success-soft)', flexShrink: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--status-success)' }}>Eingehender Stand {selectedConflictBlock.theirsLabel ? `(${selectedConflictBlock.theirsLabel})` : ''}</span>
                            <button className="staging-btn-sm" style={{ padding: '4px 12px', background: 'var(--status-success)', color: 'var(--on-accent)', border: 'none', fontWeight: 600 }} onClick={() => applyConflictChoiceToSelected('theirs')} disabled={conflictEditor.isSaving}>Uebernehmen</button>
                          </div>
                          <div className="conflict-side-preview-scroll" title="Zeilennummern nur fuer diesen Konfliktblock (Eingehender Stand)">
                            <ConflictSidePreview text={selectedConflictBlock.theirs} variant="theirs" />
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: '12px 20px', background: 'var(--bg-darker)', borderTop: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'center' }}>
                        <button className="staging-btn-sm" style={{ padding: '6px 24px', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', fontWeight: 600, fontSize: '0.8rem' }} onClick={() => applyConflictChoiceToSelected('both')} disabled={conflictEditor.isSaving}>Beide Staende uebernehmen (Aktueller zuerst)</button>
                      </div>
                    </div>
                  )}

                  <div className="conflict-manual-edit-root">
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Manuelle Bearbeitung</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', maxWidth: '720px' }}>
                          Gesamte Datei mit Zeilennummern; farbig: Aktueller Stand / Eingehender Stand / Marker. Scrollen fuer Kontext ausserhalb der Konfliktmarker.
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '4px 12px', background: 'var(--bg-dark)' }} onClick={resetConflictEditorDraft} disabled={!isConflictEditorDirty || conflictEditor.isSaving}>Aenderungen verwerfen</button>
                        <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '4px 12px', background: 'var(--bg-dark)' }} onClick={() => { void saveConflictEditor(false); }} disabled={conflictEditor.isSaving || !isConflictEditorDirty}>Speichern</button>
                        <button className="staging-btn-sm" style={{ background: 'var(--status-success)', color: 'var(--on-accent)', border: 'none', padding: '4px 16px', fontWeight: 600 }} onClick={() => { void saveConflictEditor(true); }} disabled={conflictEditor.isSaving || conflictBlocks.length > 0}>Speichern + Geloest</button>
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
