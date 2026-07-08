import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToastQueue } from '../hooks/useToastQueue';
import { useI18n } from '../i18n';
import {
  getCommitMessageStyleLabel,
} from '../utils/commitMessagePreferences';
import { ConflictResolverPanel } from './staging-area/ConflictResolverPanel';
import { StagingCommitPanel } from './staging-area/StagingCommitPanel';
import { StagingContextMenu } from './staging-area/StagingContextMenu';
import { StagingDialogHost } from './staging-area/StagingDialogHost';
import { StagingFileSections } from './staging-area/StagingFileSections';
import { StagingToolbar } from './staging-area/StagingToolbar';
import { StashPanel } from './staging-area/StashPanel';
import type { StagingAreaProps } from './staging-area/types';
import { useAiCommit } from './staging-area/useAiCommit';
import { useAiCommitMessageDialog } from './staging-area/useAiCommitMessageDialog';
import { useCommitForm } from './staging-area/useCommitForm';
import { useConflictResolver } from './staging-area/useConflictResolver';
import { useFileOperations } from './staging-area/useFileOperations';
import { useStagingDialogs } from './staging-area/useStagingDialogs';
import { useVisibleStagingFiles } from './staging-area/useVisibleStagingFiles';

export const StagingArea: React.FC<StagingAreaProps> = ({
  repoPath,
  onRepoChanged,
  onCommitsCreated,
  onOpenDiff,
  onSelectFileInspect,
  onOpenConflictResolver,
  onCloseConflictResolver,
  viewMode = 'default',
  initialConflictPath = null,
  settings,
  workingTreeSnapshot,
  workingTreeStatus,
  workingTreeStats,
  onRefreshWorkingTree,
}) => {
  const { tr } = useI18n();
  const { toasts, setToast, dismiss } = useToastQueue(3000);
  const dialogs = useStagingDialogs();
  const [stashRefreshTrigger, setStashRefreshTrigger] = useState(0);

  const isConflictOnly = viewMode === 'conflictOnly';
  const triggerStashRefresh = useCallback(() => {
    setStashRefreshTrigger((value) => value + 1);
  }, []);

  const hasSharedWorkingTreeStatus = workingTreeStatus !== null && workingTreeStatus !== undefined;
  const fileOps = useFileOperations({
    repoPath,
    setToast,
    setConfirmDialog: dialogs.setConfirmDialog,
    setInputDialog: dialogs.setInputDialog,
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
    setConfirmDialog: dialogs.setConfirmDialog,
    git: fileOps.git,
    refresh: fileOps.refresh,
    onRepoChanged,
    initialConflictPath,
    isConflictOnly,
    onOpenConflictResolver,
  });

  const aiCommitMessageStyleLabel = useMemo(() => {
    return getCommitMessageStyleLabel(settings.aiCommitMessageStyle, tr);
  }, [settings.aiCommitMessageStyle, tr]);

  const openAiCommitMessageDialog = useAiCommitMessageDialog({
    aiCommit,
    commitForm,
    setInputDialog: dialogs.setInputDialog,
  });

  const { visibleFiles, visibleTotal, maxListHeight } = useVisibleStagingFiles({
    status: fileOps.status,
    searchQuery: fileOps.searchQuery,
  });

  useEffect(() => {
    if (!isConflictOnly || !fileOps.status) return;
    if (fileOps.status.conflicts.length > 0) return;
    onCloseConflictResolver?.();
  }, [fileOps.status, isConflictOnly, onCloseConflictResolver]);

  if (!repoPath) return null;
  if (!fileOps.status) {
    return <div style={{ color: 'var(--text-secondary)', padding: '16px' }}>{tr('Lade Status...', 'Loading status...')}</div>;
  }

  const status = fileOps.status;
  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length + status.conflicts.length;
  const hasOpenConflicts = status.conflicts.length > 0;
  const isCommitInputDisabled = hasOpenConflicts
    || fileOps.isMutating
    || commitForm.isCommitting
    || aiCommit.isAiCommitting
    || aiCommit.isAiJobRunning
    || aiCommit.isAiMessageGenerating;

  const visibleStaged = visibleFiles.staged;
  const visibleUnstaged = visibleFiles.unstaged;
  const visibleUntracked = visibleFiles.untracked;
  const visibleConflicts = visibleFiles.conflicts;
  const totalConflictBlocksInView = visibleConflicts.reduce((sum, file) => sum + conflicts.blockCountForPath(file.path), 0);
  const totalConflictBlocksAll = status.conflicts.reduce((sum, file) => sum + conflicts.blockCountForPath(file.path), 0);

  return (
    <div className={`staging-container${isConflictOnly ? ' staging-container--conflict' : ''}`}>
      {!isConflictOnly && (
        <StagingToolbar
          searchQuery={fileOps.searchQuery}
          setSearchQuery={fileOps.setSearchQuery}
          stagedStats={fileOps.stagedStats}
          unstagedStats={fileOps.unstagedStats}
          isMutating={fileOps.isMutating}
          mutationElapsedMs={fileOps.mutationElapsedMs}
          visibleTotal={visibleTotal}
        />
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

        <StagingFileSections
          visibleStaged={visibleStaged}
          visibleUnstaged={visibleUnstaged}
          visibleUntracked={visibleUntracked}
          fileOps={fileOps}
          maxListHeight={maxListHeight}
          onSelectFileInspect={onSelectFileInspect}
        />
      </div>

      {!isConflictOnly && (
        <StashPanel
          repoPath={repoPath}
          onRepoChanged={onRepoChanged}
          setInputDialog={dialogs.setInputDialog}
          refreshTrigger={stashRefreshTrigger}
        />
      )}

      {!isConflictOnly && (
        <StagingCommitPanel
          status={status}
          fileOps={fileOps}
          commitForm={commitForm}
          aiCommit={aiCommit}
          hasOpenConflicts={hasOpenConflicts}
          totalConflictBlocksAll={totalConflictBlocksAll}
          isCommitInputDisabled={isCommitInputDisabled}
          aiConfigEnabled={Boolean(settings.aiAutoCommitEnabled)}
          aiCommitMessageStyleLabel={aiCommitMessageStyleLabel}
          openAiCommitMessageDialog={openAiCommitMessageDialog}
        />
      )}

      <StagingContextMenu
        contextMenu={fileOps.contextMenu}
        fileOps={fileOps}
      />

      <StagingDialogHost
        toasts={toasts}
        onDismissToast={dismiss}
        confirmDialog={dialogs.confirmDialog}
        inputDialog={dialogs.inputDialog}
        executeConfirmDialog={dialogs.executeConfirmDialog}
        closeConfirmDialog={dialogs.closeConfirmDialog}
        executeInputDialog={dialogs.executeInputDialog}
        closeInputDialog={dialogs.closeInputDialog}
      />
    </div>
  );
};
