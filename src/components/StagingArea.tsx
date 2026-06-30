import React, { useCallback, useMemo, useState } from 'react';
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
import {
  getCommitMessageStyleLabel,
} from '../utils/commitMessagePreferences';
import type {
  ConfirmDialogState,
  FileSection,
  InputDialogState,
  StagingAreaProps,
} from './staging-area/types';
import {
  basename,
  dirname,
  extensionPattern,
  formatDiffStats,
  getStatusInfo,
  toGitPath,
} from './staging-area/utils';
import { useI18n } from '../i18n';
import { VirtualList } from './VirtualList';

export const StagingArea: React.FC<StagingAreaProps> = ({
  repoPath,
  onRepoChanged,
  onCommitsCreated,
  onOpenDiff,
  onSelectFileInspect,
  onOpenConflictResolver,
  viewMode = 'default',
  initialConflictPath = null,
  settings,
  workingTreeSnapshot,
  workingTreeStatus,
  workingTreeStats,
  onRefreshWorkingTree,
}) => {
  const { tr } = useI18n();
  const { toast, setToast } = useToastQueue(3000);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);
  const [stashRefreshTrigger, setStashRefreshTrigger] = useState(0);

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
  const triggerStashRefresh = useCallback(() => {
    setStashRefreshTrigger((value) => value + 1);
  }, []);

  const hasSharedWorkingTreeStatus = workingTreeStatus !== null && workingTreeStatus !== undefined;
  const fileOps = useFileOperations({
    repoPath,
    setToast,
    setConfirmDialog,
    setInputDialog,
    onRepoChanged,
    onStashChanged: triggerStashRefresh,
    onOpenDiff,
    externalStatus: hasSharedWorkingTreeStatus ? workingTreeStatus : undefined,
    externalStatusRaw: hasSharedWorkingTreeStatus ? workingTreeSnapshot?.statusRaw : undefined,
    externalStats: hasSharedWorkingTreeStatus ? workingTreeStats : undefined,
    externalRefresh: hasSharedWorkingTreeStatus ? onRefreshWorkingTree : undefined,
  });

  const commitForm = useCommitForm({
    repoPath,
    status: fileOps.status,
    setToast,
    refresh: fileOps.refresh,
    onRepoChanged,
    onCommitsCreated,
    settings,
  });

  const aiCommit = useAiCommit({
    status: fileOps.status,
    setToast,
    refresh: fileOps.refresh,
    onRepoChanged,
    onCommitsCreated,
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

  const aiCommitMessageStyleLabel = useMemo(() => {
    return getCommitMessageStyleLabel(settings.aiCommitMessageStyle, tr);
  }, [settings.aiCommitMessageStyle, tr]);

  const openAiCommitMessageDialog = useCallback(() => {
    setInputDialog({
      title: tr('KI Commit-Message aus Notizen', 'AI commit message from notes'),
      message: tr('Gib Stichpunkte oder eine kurze Beschreibung der Aenderungen ein.', 'Enter bullet points or a short description of the changes.'),
      fields: [
        {
          id: 'notes',
          label: tr('Aenderungen', 'Changes'),
          placeholder: tr('z.B. Login-Fehler behoben, Settings validiert, Tests ergaenzt...', 'e.g. fixed login error, validated settings, added tests...'),
          required: true,
          multiline: true,
          rows: 8,
          helperText: tr('Verwendet die zentralen KI-Commit-Message-Einstellungen.', 'Uses the central AI commit message settings.'),
        },
      ],
      contextItems: [],
      irreversible: false,
      consequences: tr('Fuellt nur Commit-Titel und Beschreibung aus.', 'Only fills the commit title and description.'),
      confirmLabel: tr('Generieren', 'Generate'),
      onSubmit: async (values) => {
        const message = await aiCommit.generateCommitMessageFromNotes(values.notes || '');
        if (!message) return;
        commitForm.setCommitMsg(message.title);
        commitForm.setCommitDescription(message.description || '');
      },
    });
  }, [aiCommit, commitForm, tr]);

  const visibleFiles = useMemo(() => {
    const status = fileOps.status;
    if (!status) {
      return { staged: [], unstaged: [], untracked: [], conflicts: [] };
    }
    const normalizedQuery = fileOps.searchQuery.trim().toLowerCase();
    const bySearch = <T extends { path: string }>(entries: T[]) => entries
      .filter((entry) => !normalizedQuery || entry.path.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.path.localeCompare(b.path));
    return {
      staged: bySearch(status.staged),
      unstaged: bySearch(status.unstaged),
      untracked: bySearch(status.untracked),
      conflicts: bySearch(status.conflicts),
    };
  }, [fileOps.searchQuery, fileOps.status]);

  if (!repoPath) return null;
  if (!fileOps.status) return <div style={{ color: 'var(--text-secondary)', padding: '16px' }}>{tr('Lade Status...', 'Loading status...')}</div>;

  const status = fileOps.status;
  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length + status.conflicts.length;
  const hasOpenConflicts = status.conflicts.length > 0;
  const isCommitInputDisabled = hasOpenConflicts || fileOps.isMutating || commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || aiCommit.isAiMessageGenerating;

  const visibleStaged = visibleFiles.staged;
  const visibleUnstaged = visibleFiles.unstaged;
  const visibleUntracked = visibleFiles.untracked;
  const visibleConflicts = visibleFiles.conflicts;
  const visibleTotal = visibleStaged.length + visibleUnstaged.length + visibleUntracked.length + visibleConflicts.length;
  const visibleSectionCount = [
    visibleConflicts.length,
    visibleStaged.length,
    visibleUnstaged.length,
    visibleUntracked.length,
  ].filter((count) => count > 0).length;
  const maxListHeight = (itemCount: number) => {
    if (itemCount <= 0) return 0;
    if (visibleSectionCount <= 1) return 720;
    if (visibleSectionCount === 2) return 520;
    return 380;
  };

  const totalConflictBlocksInView = visibleConflicts.reduce((sum, f) => sum + conflicts.blockCountForPath(f.path), 0);
  const totalConflictBlocksAll = status.conflicts.reduce((sum, f) => sum + conflicts.blockCountForPath(f.path), 0);

  const contextEntry = fileOps.contextMenu?.entry || null;
  const contextSection = fileOps.contextMenu?.section || null;
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
        <span className="staging-path" title={entry.path}>{basename(entry.path)}</span>
        <div className="staging-actions">
          {section === 'staged' && (
            <button className="staging-btn" disabled={fileOps.isMutating} onClick={(e) => { e.stopPropagation(); fileOps.unstageFile(entry.path); }} title={tr('Aus Stage entfernen', 'Unstage')}>-</button>
          )}
          {section === 'unstaged' && (
            <>
              <button className="staging-btn" disabled={fileOps.isMutating} onClick={(e) => { e.stopPropagation(); fileOps.stageFile(entry.path); }} title={tr('Stagen', 'Stage')}>+</button>
              <button className="staging-btn danger" disabled={fileOps.isMutating} onClick={(e) => { e.stopPropagation(); fileOps.discardFile(entry.path); }} title={tr('Verwerfen', 'Discard')}>x</button>
            </>
          )}
          {section === 'untracked' && (
            <>
              <button className="staging-btn" disabled={fileOps.isMutating} onClick={(e) => { e.stopPropagation(); fileOps.stageFile(entry.path); }} title={tr('Stagen', 'Stage')}>+</button>
              <button className="staging-btn danger" disabled={fileOps.isMutating} onClick={(e) => { e.stopPropagation(); fileOps.deleteUntracked(entry.path); }} title={tr('Loeschen', 'Delete')}>x</button>
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
        <div className="staging-toolbar">
          <div className="staging-search-row">
            <input
              className="staging-search-input"
              value={fileOps.searchQuery}
              onChange={(e) => fileOps.setSearchQuery(e.target.value)}
              placeholder={tr('Datei suchen...', 'Search file...')}
            />
          </div>
          <div className="staging-toolbar-stats">
            <span className="staging-stat-chip" title={tr('Staged Diff-Statistik', 'Staged diff stats')}>
              {tr('Staged', 'Staged')} {formatDiffStats(fileOps.stagedStats)}
            </span>
            <span className="staging-stat-chip" title={tr('Unstaged Diff-Statistik', 'Unstaged diff stats')}>
              {tr('Unstaged', 'Unstaged')} {formatDiffStats(fileOps.unstagedStats)}
            </span>
            {fileOps.isMutating && (
              <span className="staging-stat-chip">
                {tr('Git arbeitet', 'Git is working')} {(fileOps.mutationElapsedMs / 1000).toFixed(1)}s
              </span>
            )}
            {visibleTotal > 0 && (
              <span className="staging-visible-count">
                {tr(`${visibleTotal} sichtbar`, `${visibleTotal} visible`)}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="staging-files">
        {totalChanges === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isConflictOnly ? tr('Keine offenen Konflikte.', 'No open conflicts.') : tr('Working Tree ist sauber.', 'Working tree is clean.')}
          </div>
        )}

        <ConflictResolverPanel
          visibleConflicts={visibleConflicts}
          isConflictOnly={isConflictOnly}
          onOpenConflictResolver={onOpenConflictResolver}
          isConflictBlockCountPending={conflicts.isConflictBlockCountPending}
          totalConflictBlocksInView={totalConflictBlocksInView}
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
            <SectionHeader title={tr('Staged Aenderungen', 'Staged changes')} count={visibleStaged.length} color="var(--status-success)" statsText={formatDiffStats(fileOps.stagedStats)}
              actions={<button className="staging-btn-sm" disabled={fileOps.isMutating} onClick={fileOps.unstageAll} title={tr('Alle unstagen', 'Unstage all')}>- {tr('Alle', 'All')}</button>}
            />
            <VirtualList
              items={visibleStaged}
              rowHeight={28}
              maxHeight={maxListHeight(visibleStaged.length)}
              getKey={(file) => `s-${file.path}`}
              renderItem={(file) => <FileRow entry={file} section="staged" />}
            />
          </div>
        )}

        {visibleUnstaged.length > 0 && (
          <div className="staging-section">
            <SectionHeader title={tr('Aenderungen', 'Changes')} count={visibleUnstaged.length} color="var(--status-warning)" statsText={formatDiffStats(fileOps.unstagedStats)}
              actions={
                <>
                  <button className="staging-btn-sm" disabled={fileOps.isMutating} onClick={fileOps.stageAll} title={tr('Alle stagen', 'Stage all')}>+ {tr('Alle', 'All')}</button>
                  <button className="staging-btn-sm danger" disabled={fileOps.isMutating} onClick={fileOps.discardAll} title={tr('Alle verwerfen', 'Discard all')}>x {tr('Alle', 'All')}</button>
                </>
              }
            />
            <VirtualList
              items={visibleUnstaged}
              rowHeight={28}
              maxHeight={maxListHeight(visibleUnstaged.length)}
              getKey={(file) => `u-${file.path}`}
              renderItem={(file) => <FileRow entry={file} section="unstaged" />}
            />
          </div>
        )}

        {visibleUntracked.length > 0 && (
          <div className="staging-section">
            <SectionHeader title={tr('Untracked', 'Untracked')} count={visibleUntracked.length} color="var(--status-untracked)"
              actions={<button className="staging-btn-sm" disabled={fileOps.isMutating} onClick={fileOps.stageAllUntracked} title={tr('Alle untracked stagen', 'Stage all untracked')}>+ {tr('Alle', 'All')}</button>}
            />
            <VirtualList
              items={visibleUntracked}
              rowHeight={28}
              maxHeight={maxListHeight(visibleUntracked.length)}
              getKey={(file) => `t-${file.path}`}
              renderItem={(file) => <FileRow entry={file} section="untracked" />}
            />
          </div>
        )}
      </div>

      {!isConflictOnly && (
        <StashPanel
          repoPath={repoPath}
          onRepoChanged={onRepoChanged}
          setInputDialog={setInputDialog}
          refreshTrigger={stashRefreshTrigger}
        />
      )}

      {!isConflictOnly && (
        <div className="staging-commit-area">
          <textarea
            className="staging-commit-input"
            placeholder={hasOpenConflicts ? tr('Konflikte aufloesen, danach committen...', 'Resolve conflicts, then commit...') : tr('Commit-Titel...', 'Commit title...')}
            value={commitForm.commitMsg}
            onChange={(e) => commitForm.setCommitMsg(e.target.value)}
            onKeyDown={(e) => {
              if (!isCommitInputDisabled && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitForm.handleCommit();
              }
            }}
            disabled={isCommitInputDisabled}
          />
          <textarea
            className="staging-commit-input staging-commit-description"
            placeholder={tr('Commit-Beschreibung (optional)...', 'Commit description (optional)...')}
            value={commitForm.commitDescription}
            onChange={(e) => commitForm.setCommitDescription(e.target.value)}
            onKeyDown={(e) => {
              if (!isCommitInputDisabled && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitForm.handleCommit();
              }
            }}
            disabled={isCommitInputDisabled}
          />
          <div className="staging-commit-bar" style={{ gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: hasOpenConflicts ? 'var(--status-danger)' : 'var(--text-secondary)' }}>
              {hasOpenConflicts ? tr('Offene Konflikte blockieren Commit', 'Open conflicts block commit') : 'Ctrl+Enter'}
            </span>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: commitForm.amendCommit ? 'var(--status-warning)' : 'var(--text-secondary)', cursor: 'pointer' }}
              title={tr('Letzten Commit aendern (--amend). Commit-Nachricht wird automatisch vorausgefuellt.', 'Amend last commit (--amend). Commit message is prefilled automatically.')}
            >
              <input type="checkbox" checked={commitForm.amendCommit} onChange={(e) => commitForm.setAmendCommit(e.target.checked)} />
              {tr('Amend', 'Amend')}
            </label>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
              title={tr('Signed-off-by Zeile anhaengen (--signoff)', 'Append signed-off-by line (--signoff)')}
            >
              <input type="checkbox" checked={commitForm.signoffCommit} onChange={(e) => commitForm.setSignoffCommit(e.target.checked)} />
              {tr('Signoff', 'Signoff')}
            </label>
            <div style={{ flex: 1 }} />
            {aiCommit.aiProgressMessage && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '220px', maxWidth: '420px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiCommit.aiProgressMessage}>
                  {aiCommit.aiProgressMessage}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  {[
                    `${tr('Phase', 'Phase')}: ${aiCommit.aiPhase}`,
                    `${tr('Modus', 'Mode')}: ${aiCommit.aiMode}`,
                    aiCommit.aiGroupId !== null ? `${tr('Gruppe', 'Group')}: ${aiCommit.aiGroupId}` : null,
                    aiCommit.aiGroupSize !== null ? `${tr('Batch', 'Batch')}: ${aiCommit.aiGroupSize}` : null,
                  ].filter(Boolean).join(' | ')}
                </span>
                {(aiCommit.aiProcessedFiles !== null || aiCommit.aiRemainingFiles !== null || aiCommit.aiTotalCommits !== null) && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    {[
                      aiCommit.aiProcessedFiles !== null ? `${tr('Verarbeitet', 'Processed')}: ${aiCommit.aiProcessedFiles}` : null,
                      aiCommit.aiRemainingFiles !== null ? `${tr('Rest', 'Remaining')}: ${aiCommit.aiRemainingFiles}` : null,
                      aiCommit.aiTotalCommits !== null ? `${tr('Commits', 'Commits')}: ${aiCommit.aiTotalCommits}` : null,
                    ].filter(Boolean).join(' | ')}
                  </span>
                )}
                {aiCommit.aiLastCommit && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiCommit.aiLastCommit}>
                    {`${tr('Letzter Commit', 'Last commit')}: ${aiCommit.aiLastCommit}`}
                  </span>
                )}
              </div>
            )}
            {(aiCommit.isAiCommitting || aiCommit.isAiJobRunning) && (
              <button
                className="staging-tool-btn danger"
                type="button"
                onClick={aiCommit.handleCancelAiAutoCommit}
                title={tr('Laufenden KI Auto-Commit abbrechen', 'Cancel running AI auto-commit')}
              >
                {tr('Abbrechen', 'Cancel')}
              </button>
            )}
            <button
              className="staging-tool-btn"
              type="button"
              onClick={openAiCommitMessageDialog}
              disabled={fileOps.isMutating || hasOpenConflicts || commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || aiCommit.isAiMessageGenerating || !status}
              title={tr(`Commit-Message aus Notizen generieren (${aiCommitMessageStyleLabel})`, `Generate commit message from notes (${aiCommitMessageStyleLabel})`)}
            >
              {aiCommit.isAiMessageGenerating ? tr('KI generiert...', 'AI generating...') : tr('KI Message', 'AI message')}
            </button>
            <button
              className="staging-tool-btn"
              type="button"
              onClick={aiCommit.handleAiAutoCommit}
              disabled={fileOps.isMutating || commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || !status}
              title={aiConfig.enabled ? tr('KI entscheidet Staging + Commit-Nachrichten automatisch.', 'AI decides staging + commit messages automatically.') : tr('In Settings zuerst KI Auto-Commit aktivieren.', 'Enable AI auto-commit in settings first.')}
              style={{ opacity: aiConfig.enabled ? 1 : 0.7 }}
            >
              {(aiCommit.isAiCommitting || aiCommit.isAiJobRunning) ? tr('KI arbeitet...', 'AI is working...') : tr('KI Auto-Commit', 'AI auto-commit')}
            </button>
            <button
              className="staging-commit-btn"
              onClick={commitForm.handleCommit}
              disabled={fileOps.isMutating || hasOpenConflicts || !commitForm.commitMsg.trim() || commitForm.isCommitting || aiCommit.isAiCommitting || !status || (status.staged.length === 0 && !commitForm.amendCommit)}
            >
              {hasOpenConflicts
                ? tr(`Konflikte (${totalConflictBlocksAll})`, `Conflicts (${totalConflictBlocksAll})`)
                : (commitForm.isCommitting ? tr('Committing...', 'Committing...') : `${tr('Commit', 'Commit')} (${status?.staged.length || 0} | ${formatDiffStats(fileOps.stagedStats)})`)
              }
            </button>
          </div>
        </div>
      )}

      {fileOps.contextMenu && contextEntry && (
        <div className="ctx-menu-backdrop" onClick={() => fileOps.setContextMenu(null)}>
          <div className="ctx-menu" style={{ left: fileOps.contextMenu.x, top: fileOps.contextMenu.y }} onClick={(e) => e.stopPropagation()}>
            <div className="ctx-menu-header">{contextEntry.path}</div>
            {contextSection && (
              <>
                <button className="ctx-menu-item" disabled={fileOps.isMutating} onClick={() => { fileOps.setContextMenu(null); fileOps.stashFile(contextEntry.path, contextSection); }}>
                  <span className="ctx-menu-icon">ST</span>
                  {tr('Datei stashen...', 'Stash file...')}
                </button>
                <button className="ctx-menu-item" disabled={fileOps.isMutating} onClick={() => { fileOps.setContextMenu(null); fileOps.stashAll(); }}>
                  <span className="ctx-menu-icon">ALL</span>
                  {tr('Alle Aenderungen stashen...', 'Stash all changes...')}
                </button>
                <div className="ctx-menu-sep" />
              </>
            )}
            <button className="ctx-menu-item" onClick={() => { fileOps.setContextMenu(null); fileOps.addIgnoreRule(contextEntry, contextSection || fileOps.contextMenu!.section, toGitPath(contextEntry.path)); }}>
              <span className="ctx-menu-icon">IG</span>
              {tr('Datei zu .gitignore hinzufuegen', 'Add file to .gitignore')}
            </button>
            {contextDir && (
              <button className="ctx-menu-item" onClick={() => { fileOps.setContextMenu(null); fileOps.addIgnoreRule(contextEntry, contextSection || fileOps.contextMenu!.section, `${contextDir}/`); }}>
                <span className="ctx-menu-icon">DIR</span>
                {tr(`Ordner ignorieren (${contextDir}/)`, `Ignore folder (${contextDir}/)`)}
              </button>
            )}
            {contextTopDir && contextTopDir !== contextDir && (
              <button className="ctx-menu-item" onClick={() => { fileOps.setContextMenu(null); fileOps.addIgnoreRule(contextEntry, contextSection || fileOps.contextMenu!.section, `${contextTopDir}/`); }}>
                <span className="ctx-menu-icon">TOP</span>
                {tr(`Oberordner ignorieren (${contextTopDir}/)`, `Ignore top-level folder (${contextTopDir}/)`)}
              </button>
            )}
            {contextExtPattern && (
              <button className="ctx-menu-item" onClick={() => { fileOps.setContextMenu(null); fileOps.addIgnoreRule(contextEntry, contextSection || fileOps.contextMenu!.section, contextExtPattern); }}>
                <span className="ctx-menu-icon">EXT</span>
                {tr(`Dateityp ignorieren (${contextExtPattern})`, `Ignore file type (${contextExtPattern})`)}
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
