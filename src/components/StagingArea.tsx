import React, { useCallback, useState } from 'react';
import { FileEntry } from '../utils/gitParsing';
import { useToastQueue } from '../hooks/useToastQueue';
import { Confirm } from './Confirm';
import { DangerConfirm } from './DangerConfirm';
import { Input } from './Input';
import { ConflictResolverPanel } from './staging-area/ConflictResolverPanel';
import { StashPanel } from './staging-area/StashPanel';
import { useFileOperations } from './staging-area/useFileOperations';
import { useCommitForm } from './staging-area/useCommitForm';
import { useAiCommit } from './staging-area/useAiCommit';
import { useConflictResolver } from './staging-area/useConflictResolver';
import type {
  ConfirmDialogState,
  FileSection,
  InputDialogState,
  StagingAreaProps,
} from './staging-area/types';
import {
  dirname,
  extensionPattern,
  formatDiffStats,
  getStatusInfo,
  toGitPath,
} from './staging-area/utils';

export const StagingArea: React.FC<StagingAreaProps> = ({
  repoPath,
  onRepoChanged,
  onOpenDiff,
  onSelectFileInspect,
  onOpenConflictResolver,
  viewMode = 'default',
  initialConflictPath = null,
  settings,
}) => {
  const { toast, setToast } = useToastQueue(3000);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);

  const isConflictOnly = viewMode === 'conflictOnly';

  const closeConfirmDialog = useCallback(() => setConfirmDialog(null), []);
  const executeConfirmDialog = useCallback(async () => {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    await action();
  }, [confirmDialog]);

  const closeInputDialog = useCallback(() => setInputDialog(null), []);
  const executeInputDialog = useCallback(async (values: Record<string, string>) => {
    if (!inputDialog) return;
    const action = inputDialog.onSubmit;
    setInputDialog(null);
    await action(values);
  }, [inputDialog]);

  const fileOps = useFileOperations({ repoPath, setToast, setConfirmDialog, setInputDialog, onRepoChanged, onOpenDiff });

  const commitForm = useCommitForm({
    repoPath,
    status: fileOps.status,
    setToast,
    refresh: fileOps.refresh,
    onRepoChanged,
    settings,
  });

  const aiCommit = useAiCommit({
    status: fileOps.status,
    setToast,
    refresh: fileOps.refresh,
    onRepoChanged,
  });

  const conflicts = useConflictResolver({
    repoPath,
    status: fileOps.status,
    setToast,
    setConfirmDialog,
    git: fileOps.git,
    refresh: fileOps.refresh,
    onRepoChanged,
    initialConflictPath,
    isConflictOnly,
    onOpenConflictResolver,
  });

  const aiConfig = {
    enabled: Boolean(settings.aiAutoCommitEnabled),
  };

  if (!repoPath) return null;
  if (!fileOps.status) return <div style={{ color: 'var(--text-secondary)', padding: '16px' }}>Lade Status...</div>;

  const status = fileOps.status;
  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length + status.conflicts.length;
  const hasOpenConflicts = status.conflicts.length > 0;

  const normalizedQuery = fileOps.searchQuery.trim().toLowerCase();
  const bySearch = <T extends { path: string }>(entries: T[]) => entries
    .filter((entry) => !normalizedQuery || entry.path.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => a.path.localeCompare(b.path));

  const visibleStaged = fileOps.activeFilter === 'all' || fileOps.activeFilter === 'staged' ? bySearch(status.staged) : [];
  const visibleUnstaged = fileOps.activeFilter === 'all' || fileOps.activeFilter === 'unstaged' ? bySearch(status.unstaged) : [];
  const visibleUntracked = fileOps.activeFilter === 'all' || fileOps.activeFilter === 'untracked' ? bySearch(status.untracked) : [];
  const visibleConflicts = fileOps.activeFilter === 'all' || fileOps.activeFilter === 'conflicts' ? bySearch(status.conflicts) : [];
  const visibleTotal = visibleStaged.length + visibleUnstaged.length + visibleUntracked.length + visibleConflicts.length;

  const totalConflictBlocksInView = visibleConflicts.reduce((sum, f) => sum + conflicts.blockCountForPath(f.path), 0);
  const totalConflictBlocksAll = status.conflicts.reduce((sum, f) => sum + conflicts.blockCountForPath(f.path), 0);

  const contextEntry = fileOps.contextMenu?.entry || null;
  const contextDir = contextEntry ? dirname(contextEntry.path) : '';
  const contextTopDir = contextDir.includes('/') ? contextDir.split('/')[0] : '';
  const contextExtPattern = contextEntry ? extensionPattern(contextEntry.path) : null;

  const FileRow = ({ entry, section }: { entry: FileEntry; section: FileSection }) => {
    const statusCode = section === 'staged' ? entry.x : entry.y;
    const info = getStatusInfo(statusCode);
    const inspectSource = section === 'staged' ? 'staged' : section === 'unstaged' ? 'unstaged' : null;
    return (
      <div
        className="staging-file-row"
        onClick={() => {
          if (inspectSource) onSelectFileInspect?.(entry.path, inspectSource);
          if (section !== 'untracked') fileOps.showDiff(entry.path, section === 'staged');
        }}
        onContextMenu={(e) => fileOps.openFileContextMenu(e, entry, section)}
      >
        <span className="staging-status" style={{ color: info.color }}>{statusCode}</span>
        <span className="staging-path" title={entry.path}>{entry.path}</span>
        <div className="staging-actions">
          {section === 'staged' && (
            <button className="staging-btn" onClick={(e) => { e.stopPropagation(); fileOps.unstageFile(entry.path); }} title="Unstage">-</button>
          )}
          {section === 'unstaged' && (
            <>
              <button className="staging-btn" onClick={(e) => { e.stopPropagation(); fileOps.stageFile(entry.path); }} title="Stage">+</button>
              <button className="staging-btn danger" onClick={(e) => { e.stopPropagation(); fileOps.discardFile(entry.path); }} title="Verwerfen">x</button>
            </>
          )}
          {section === 'untracked' && (
            <>
              <button className="staging-btn" onClick={(e) => { e.stopPropagation(); fileOps.stageFile(entry.path); }} title="Stage">+</button>
              <button className="staging-btn danger" onClick={(e) => { e.stopPropagation(); fileOps.deleteUntracked(entry.path); }} title="Loeschen">x</button>
            </>
          )}
        </div>
      </div>
    );
  };

  const SectionHeader = ({ title, count, color, actions, statsText }: { title: string; count: number; color: string; actions?: React.ReactNode; statsText?: string }) => (
    <div className="staging-section-header">
      <span style={{ color }}>{title}</span>
      <span className="staging-count">{count}</span>
      {statsText && <span className="staging-stats-inline">{statsText}</span>}
      <div style={{ flex: 1 }} />
      {actions}
    </div>
  );

  return (
    <div className={`staging-container${isConflictOnly ? ' staging-container--conflict' : ''}`}>
      {!isConflictOnly && (
        <div className="staging-toolbar" style={{ flexWrap: 'wrap' }}>
          <button className="staging-tool-btn" onClick={fileOps.stashChanges} title="Stash">Stash</button>
          <button className="staging-tool-btn" onClick={fileOps.stashPop} title="Stash Pop">Pop</button>
          <input
            value={fileOps.searchQuery}
            onChange={(e) => fileOps.setSearchQuery(e.target.value)}
            placeholder="Datei suchen..."
            style={{ flex: 1, minWidth: '170px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.76rem' }}
          />
          {(['all', 'staged', 'unstaged', 'untracked', 'conflicts'] as const).map((filter) => (
            <button
              key={filter}
              className="staging-tool-btn"
              style={{
                backgroundColor: fileOps.activeFilter === filter ? 'var(--accent-primary-soft)' : undefined,
                borderColor: fileOps.activeFilter === filter ? 'var(--accent-primary-border)' : undefined,
                color: fileOps.activeFilter === filter ? 'var(--text-accent)' : undefined,
              }}
              onClick={() => fileOps.setActiveFilter(filter)}
              title={filter === 'conflicts' && totalConflictBlocksAll > 0 ? `${totalConflictBlocksAll} Konfliktblock${totalConflictBlocksAll !== 1 ? 'e' : ''}` : undefined}
            >
              {filter === 'conflicts' && totalConflictBlocksAll > 0 ? `conflicts (${totalConflictBlocksAll})` : filter}
            </button>
          ))}
          <span className="staging-stat-chip" title="Staged Diff-Statistik">
            Staged {formatDiffStats(fileOps.stagedStats)}
          </span>
          <span className="staging-stat-chip" title="Unstaged Diff-Statistik">
            Unstaged {formatDiffStats(fileOps.unstagedStats)}
          </span>
          <div style={{ flex: 1 }} />
          {visibleTotal > 0 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {visibleTotal} sichtbar
            </span>
          )}
        </div>
      )}

      <div className="staging-files">
        {totalChanges === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isConflictOnly ? 'Keine offenen Konflikte.' : 'Working Tree ist sauber.'}
          </div>
        )}

        <ConflictResolverPanel
          visibleConflicts={visibleConflicts}
          isConflictOnly={isConflictOnly}
          onOpenConflictResolver={onOpenConflictResolver}
          isConflictBlockCountPending={conflicts.isConflictBlockCountPending}
          totalConflictBlocksInView={totalConflictBlocksInView}
          mergeContinue={conflicts.mergeContinue}
          mergeAbort={conflicts.mergeAbort}
          rebaseContinue={conflicts.rebaseContinue}
          rebaseAbort={conflicts.rebaseAbort}
          conflictEditor={conflicts.conflictEditor}
          isConflictEditorLoading={conflicts.isConflictEditorLoading}
          blockCountForPath={conflicts.blockCountForPath}
          openConflictEditor={conflicts.openConflictEditor}
          reloadActiveConflictEditor={conflicts.reloadActiveConflictEditor}
          applyConflictChoiceToAll={conflicts.applyConflictChoiceToAll}
          markConflictResolvedAndSync={conflicts.markConflictResolvedAndSync}
          hasPreviousConflictTarget={conflicts.hasPreviousConflictTarget}
          hasNextConflictTarget={conflicts.hasNextConflictTarget}
          navigateToPreviousConflict={conflicts.navigateToPreviousConflict}
          navigateToNextConflict={conflicts.navigateToNextConflict}
          isStructuredConflictViewLocked={conflicts.isStructuredConflictViewLocked}
          activeConflictFileIndex={conflicts.activeConflictFileIndex}
          conflictPaths={conflicts.conflictPaths}
          conflictBlocks={conflicts.conflictBlocks}
          selectedConflictBlock={conflicts.selectedConflictBlock}
          safeSelectedConflictBlockIndex={conflicts.safeSelectedConflictBlockIndex}
          applyConflictChoiceToSelected={conflicts.applyConflictChoiceToSelected}
          resetConflictEditorDraft={conflicts.resetConflictEditorDraft}
          saveConflictEditor={conflicts.saveConflictEditor}
          isConflictEditorDirty={conflicts.isConflictEditorDirty}
          conflictManualScrollRef={conflicts.conflictManualScrollRef}
          onConflictEditorContentChange={conflicts.onConflictEditorContentChange}
        />

        {visibleStaged.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Staged Changes" count={visibleStaged.length} color="var(--status-success)" statsText={formatDiffStats(fileOps.stagedStats)}
              actions={<button className="staging-btn-sm" onClick={fileOps.unstageAll} title="Alle unstagen">- Alle</button>}
            />
            {visibleStaged.map((f) => <FileRow key={`s-${f.path}`} entry={f} section="staged" />)}
          </div>
        )}

        {visibleUnstaged.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Changes" count={visibleUnstaged.length} color="var(--status-warning)" statsText={formatDiffStats(fileOps.unstagedStats)}
              actions={
                <>
                  <button className="staging-btn-sm" onClick={fileOps.stageAll} title="Alle stagen">+ Alle</button>
                  <button className="staging-btn-sm danger" onClick={fileOps.discardAll} title="Alle verwerfen">x Alle</button>
                </>
              }
            />
            {visibleUnstaged.map((f) => <FileRow key={`u-${f.path}`} entry={f} section="unstaged" />)}
          </div>
        )}

        {visibleUntracked.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Untracked" count={visibleUntracked.length} color="var(--status-untracked)"
              actions={<button className="staging-btn-sm" onClick={fileOps.stageAllUntracked} title="Alle untracked stagen">+ Alle</button>}
            />
            {visibleUntracked.map((f) => <FileRow key={`t-${f.path}`} entry={f} section="untracked" />)}
          </div>
        )}
      </div>

      {!isConflictOnly && (
        <StashPanel
          repoPath={repoPath}
          onRepoChanged={onRepoChanged}
        />
      )}

      {!isConflictOnly && (
        <div className="staging-commit-area">
          <textarea
            className="staging-commit-input"
            placeholder={hasOpenConflicts ? 'Konflikte aufloesen, danach committen...' : 'Commit-Titel...'}
            value={commitForm.commitMsg}
            onChange={(e) => commitForm.setCommitMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitForm.handleCommit(); }}
            disabled={hasOpenConflicts}
          />
          <textarea
            className="staging-commit-input staging-commit-description"
            placeholder="Commit-Beschreibung (optional)..."
            value={commitForm.commitDescription}
            onChange={(e) => commitForm.setCommitDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitForm.handleCommit(); }}
            disabled={hasOpenConflicts}
          />
          <div className="staging-commit-bar" style={{ gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: hasOpenConflicts ? 'var(--status-danger)' : 'var(--text-secondary)' }}>
              {hasOpenConflicts ? 'Offene Konflikte blockieren Commit' : 'Ctrl+Enter'}
            </span>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: commitForm.amendCommit ? 'var(--status-warning)' : 'var(--text-secondary)', cursor: 'pointer' }}
              title="Letzten Commit ändern (--amend). Commit-Nachricht wird automatisch vorausgefüllt."
            >
              <input type="checkbox" checked={commitForm.amendCommit} onChange={(e) => commitForm.setAmendCommit(e.target.checked)} />
              Amend
            </label>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
              title="Signed-off-by Zeile anhängen (--signoff)"
            >
              <input type="checkbox" checked={commitForm.signoffCommit} onChange={(e) => commitForm.setSignoffCommit(e.target.checked)} />
              Signoff
            </label>
            <div style={{ flex: 1 }} />
            {aiCommit.aiProgressMessage && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '220px', maxWidth: '420px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiCommit.aiProgressMessage}>
                  {aiCommit.aiProgressMessage}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  {`Phase: ${aiCommit.aiPhase} | Modus: ${aiCommit.aiMode}${aiCommit.aiRemainingFiles !== null ? ` | Rest: ${aiCommit.aiRemainingFiles}` : ''}`}
                </span>
                {aiCommit.aiLastCommit && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiCommit.aiLastCommit}>
                    {`Letzter Commit: ${aiCommit.aiLastCommit}`}
                  </span>
                )}
              </div>
            )}
            {(aiCommit.isAiCommitting || aiCommit.isAiJobRunning) && (
              <button
                className="staging-tool-btn danger"
                type="button"
                onClick={aiCommit.handleCancelAiAutoCommit}
                title="Laufenden KI Auto-Commit abbrechen"
              >
                Abbrechen
              </button>
            )}
            <button
              className="staging-tool-btn"
              type="button"
              onClick={aiCommit.handleAiAutoCommit}
              disabled={commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || !status}
              title={aiConfig.enabled ? 'KI entscheidet Staging + Commit-Nachrichten automatisch.' : 'In Settings zuerst KI Auto-Commit aktivieren.'}
              style={{ opacity: aiConfig.enabled ? 1 : 0.7 }}
            >
              {(aiCommit.isAiCommitting || aiCommit.isAiJobRunning) ? 'KI arbeitet...' : 'KI Auto-Commit'}
            </button>
            <button
              className="staging-commit-btn"
              onClick={commitForm.handleCommit}
              disabled={hasOpenConflicts || !commitForm.commitMsg.trim() || commitForm.isCommitting || aiCommit.isAiCommitting || !status || (status.staged.length === 0 && !commitForm.amendCommit)}
            >
              {hasOpenConflicts
                ? `Konflikte (${totalConflictBlocksAll})`
                : (commitForm.isCommitting ? 'Committing...' : `Commit (${status?.staged.length || 0} | ${formatDiffStats(fileOps.stagedStats)})`)
              }
            </button>
          </div>
        </div>
      )}

      {fileOps.contextMenu && contextEntry && (
        <div className="ctx-menu-backdrop" onClick={() => fileOps.setContextMenu(null)}>
          <div className="ctx-menu" style={{ left: fileOps.contextMenu.x, top: fileOps.contextMenu.y }} onClick={(e) => e.stopPropagation()}>
            <div className="ctx-menu-header">{contextEntry.path}</div>
            <button className="ctx-menu-item" onClick={() => { fileOps.setContextMenu(null); fileOps.addIgnoreRule(contextEntry, fileOps.contextMenu!.section, toGitPath(contextEntry.path)); }}>
              <span className="ctx-menu-icon">IG</span>
              Datei zu .gitignore hinzufuegen
            </button>
            {contextDir && (
              <button className="ctx-menu-item" onClick={() => { fileOps.setContextMenu(null); fileOps.addIgnoreRule(contextEntry, fileOps.contextMenu!.section, `${contextDir}/`); }}>
                <span className="ctx-menu-icon">DIR</span>
                Ordner ignorieren ({contextDir}/)
              </button>
            )}
            {contextTopDir && contextTopDir !== contextDir && (
              <button className="ctx-menu-item" onClick={() => { fileOps.setContextMenu(null); fileOps.addIgnoreRule(contextEntry, fileOps.contextMenu!.section, `${contextTopDir}/`); }}>
                <span className="ctx-menu-icon">TOP</span>
                Oberordner ignorieren ({contextTopDir}/)
              </button>
            )}
            {contextExtPattern && (
              <button className="ctx-menu-item" onClick={() => { fileOps.setContextMenu(null); fileOps.addIgnoreRule(contextEntry, fileOps.contextMenu!.section, contextExtPattern); }}>
                <span className="ctx-menu-icon">EXT</span>
                Dateityp ignorieren ({contextExtPattern})
              </button>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`action-toast ${toast.isError ? 'error' : 'success'}`}>
          {toast.isError ? 'x' : 'ok'} {toast.msg}
        </div>
      )}

      {confirmDialog && confirmDialog.variant === 'confirm' && (
        <Confirm
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          contextItems={confirmDialog.contextItems}
          irreversible={confirmDialog.irreversible}
          consequences={confirmDialog.consequences}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={executeConfirmDialog}
          onCancel={closeConfirmDialog}
        />
      )}

      {confirmDialog && confirmDialog.variant === 'danger' && (
        <DangerConfirm
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          contextItems={confirmDialog.contextItems}
          irreversible={confirmDialog.irreversible}
          consequences={confirmDialog.consequences}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={executeConfirmDialog}
          onCancel={closeConfirmDialog}
        />
      )}

      {inputDialog && (
        <Input
          open={true}
          title={inputDialog.title}
          message={inputDialog.message}
          fields={inputDialog.fields}
          contextItems={inputDialog.contextItems}
          irreversible={inputDialog.irreversible}
          consequences={inputDialog.consequences}
          confirmLabel={inputDialog.confirmLabel}
          onSubmit={executeInputDialog}
          onCancel={closeInputDialog}
        />
      )}
    </div>
  );
};
