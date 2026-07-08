import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToastQueue } from '@/hooks/useToastQueue';
import { useI18n } from '@/i18n';
import { useUIContext } from '@/contexts/AppStateContext';
import { getCommitMessageStyleLabel } from '@/utils/commitMessagePreferences';
import { ActionToastViewport } from '@/components/ActionToastViewport';
import { ConflictResolverPanel } from './ConflictResolverPanel';
import { StagingCommitPanel } from './StagingCommitPanel';
import { StagingContextMenu } from './StagingContextMenu';
import { StagingFileSections } from './StagingFileSections';
import { StagingToolbar } from './StagingToolbar';
import { StashPanel } from './StashPanel';
import type { StagingAreaProps } from './types';
import { useAiCommit } from './useAiCommit';
import { useAiCommitMessageDialog } from './useAiCommitMessageDialog';
import { useCommitForm } from './useCommitForm';
import { useConflictResolver } from './useConflictResolver';
import { useFileOperations } from './useFileOperations';
import { useVisibleStagingFiles } from './useVisibleStagingFiles';

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
  const { t } = useI18n();
  const { setConfirmDialog, setInputDialog } = useUIContext();
  const { toasts, setToast, dismiss } = useToastQueue(3000);
  const [stashRefreshTrigger, setStashRefreshTrigger] = useState(0);

  const isConflictOnly = viewMode === 'conflictOnly';
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

  const aiCommitMessageStyleLabel = useMemo(() => {
    return getCommitMessageStyleLabel(settings.aiCommitMessageStyle, t);
  }, [settings.aiCommitMessageStyle, t]);

  const openAiCommitMessageDialog = useAiCommitMessageDialog({
    aiCommit,
    commitForm,
    setInputDialog,
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
    return <div style={{ color: 'var(--text-secondary)', padding: '16px' }}>{t('generated.components.staging_area.stagingarea.loading_status_bff97099')}</div>;
  }

  const status = fileOps.status;
  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length + status.conflicts.length;
  const hasOpenConflicts = status.conflicts.length > 0;
  const isCommitInputDisabled =
    hasOpenConflicts || fileOps.isMutating || commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || aiCommit.isAiMessageGenerating;

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
            {isConflictOnly
              ? t('generated.components.staging_area.stagingarea.no_open_conflicts_a3f846f5')
              : t('generated.components.staging_area.stagingarea.working_tree_is_clean_7d0c725c')}
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

      {!isConflictOnly && <StashPanel repoPath={repoPath} onRepoChanged={onRepoChanged} setInputDialog={setInputDialog} refreshTrigger={stashRefreshTrigger} />}

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

      <StagingContextMenu contextMenu={fileOps.contextMenu} fileOps={fileOps} />
      <ActionToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};
