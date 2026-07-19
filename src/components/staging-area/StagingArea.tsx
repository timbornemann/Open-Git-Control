import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppToastSetter } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { useSettingsContext, useUIContext } from '@/contexts/AppStateContext';
import { getCommitMessageStyleLabel } from '@/utils/commitMessagePreferences';
import { normalizeRepoPathKey } from '@/utils/repoPath';
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
import type { SequencerOperation } from './sequencerState';

type SequencerActionProps = {
  onMergeContinue?: () => void;
  onMergeAbort?: () => void;
  onRebaseContinue?: () => void;
  onRebaseAbort?: () => void;
  onCherryPickContinue?: () => void;
  onCherryPickAbort?: () => void;
};

const getSequencerActionProps = (operation: SequencerOperation | null, actions: Required<SequencerActionProps>): SequencerActionProps => {
  if (operation === 'merge') return { onMergeContinue: actions.onMergeContinue, onMergeAbort: actions.onMergeAbort };
  if (operation === 'rebase') return { onRebaseContinue: actions.onRebaseContinue, onRebaseAbort: actions.onRebaseAbort };
  if (operation === 'cherry-pick') return { onCherryPickContinue: actions.onCherryPickContinue, onCherryPickAbort: actions.onCherryPickAbort };
  return {};
};

const sharedWorkingTreeMatchesRepository = ({
  repoPath,
  workingTreeRepoPath,
  workingTreeSnapshot,
  workingTreeStatus,
}: Pick<StagingAreaProps, 'repoPath' | 'workingTreeRepoPath' | 'workingTreeSnapshot' | 'workingTreeStatus'>): boolean => {
  if (!repoPath) return false;
  if (workingTreeRepoPath !== undefined) {
    return Boolean(workingTreeRepoPath && normalizeRepoPathKey(workingTreeRepoPath) === normalizeRepoPathKey(repoPath));
  }
  return Boolean(
    workingTreeStatus !== undefined && (!workingTreeSnapshot || normalizeRepoPathKey(workingTreeSnapshot.repoPath) === normalizeRepoPathKey(repoPath)),
  );
};

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
  workingTreeRepoPath,
  workingTreeSnapshot,
  workingTreeStatus,
  workingTreeStats,
  onRefreshWorkingTree,
}) => {
  const { t } = useI18n();
  const { setConfirmDialog, setInputDialog } = useUIContext();
  const { onUpdateSettings } = useSettingsContext();
  const setToast = useAppToastSetter();
  const [stashRefreshTrigger, setStashRefreshTrigger] = useState(0);

  const isConflictOnly = viewMode === 'conflictOnly';
  const triggerStashRefresh = useCallback(() => {
    setStashRefreshTrigger((value) => value + 1);
  }, []);

  const hasSharedWorkingTree = onRefreshWorkingTree !== undefined;
  const sharedWorkingTreeMatchesRepo = sharedWorkingTreeMatchesRepository({ repoPath, workingTreeRepoPath, workingTreeSnapshot, workingTreeStatus });
  const sharedStatus = sharedWorkingTreeMatchesRepo ? (workingTreeStatus ?? null) : null;
  const sharedSnapshot = sharedWorkingTreeMatchesRepo ? (workingTreeSnapshot ?? null) : null;

  const fileOps = useFileOperations({
    repoPath,
    setToast,
    setConfirmDialog,
    setInputDialog,
    onRepoChanged,
    onStashChanged: triggerStashRefresh,
    onOpenDiff,
    externalRepoPath: hasSharedWorkingTree ? (sharedWorkingTreeMatchesRepo ? repoPath : null) : undefined,
    externalStatus: hasSharedWorkingTree ? sharedStatus : undefined,
    externalStatusRaw: sharedSnapshot?.statusRaw,
    externalStats: hasSharedWorkingTree ? (sharedWorkingTreeMatchesRepo ? (workingTreeStats ?? null) : null) : undefined,
    externalRefresh: onRefreshWorkingTree,
  });

  const commitForm = useCommitForm({
    repoPath,
    status: fileOps.status,
    setToast,
    refresh: fileOps.refresh,
    onRepoChanged,
    onCommitsCreated,
    settings,
    setConfirmDialog,
    onUpdateSettings,
  });

  const aiCommit = useAiCommit({
    repoPath,
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

  const { visibleFiles } = useVisibleStagingFiles({
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
  const isBareRepository = Boolean(sharedSnapshot?.isBare);
  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length + status.conflicts.length;
  const hasOpenConflicts = status.conflicts.length > 0;
  const isCommitInputDisabled =
    hasOpenConflicts || fileOps.isMutating || commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || aiCommit.isAiMessageGenerating;

  const visibleStaged = visibleFiles.staged;
  const visibleUnstaged = visibleFiles.unstaged;
  const visibleUntracked = visibleFiles.untracked;
  const visibleConflicts = visibleFiles.conflicts;
  const totalConflictBlocksInView = visibleConflicts.reduce((sum, file) => sum + conflicts.blockCountForPath(file.path), 0);
  const sequencerActionProps = getSequencerActionProps(conflicts.sequencerOperation, {
    onMergeContinue: conflicts.mergeContinue,
    onMergeAbort: conflicts.mergeAbort,
    onRebaseContinue: conflicts.rebaseContinue,
    onRebaseAbort: conflicts.rebaseAbort,
    onCherryPickContinue: conflicts.cherryPickContinue,
    onCherryPickAbort: conflicts.cherryPickAbort,
  });
  const getSectionFlex = (itemCount: number) => `${Math.max(1, Math.min(itemCount, 8))} 1 0`;
  const stagingSections = (
    <>
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
        resolveConflictByDeletion={conflicts.resolveConflictByDeletion}
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
        showOperationActions={conflicts.sequencerOperation !== null}
        isGitActionRunning={fileOps.isMutating}
        sectionFlex={isConflictOnly ? undefined : getSectionFlex(visibleConflicts.length)}
        {...sequencerActionProps}
      />

      {!isConflictOnly && (
        <StagingFileSections
          visibleStaged={visibleStaged}
          visibleUnstaged={visibleUnstaged}
          visibleUntracked={visibleUntracked}
          fileOps={fileOps}
          onSelectFileInspect={onSelectFileInspect}
        />
      )}
    </>
  );

  return (
    <div className={`staging-container${isConflictOnly ? ' staging-container--conflict' : ''}`}>
      {!isConflictOnly && <StagingToolbar searchQuery={fileOps.searchQuery} setSearchQuery={fileOps.setSearchQuery} />}

      <div className="staging-files">
        {isBareRepository ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {t('generated.components.staging_area.stagingarea.bare_repository_no_working_tree_a1b2c3d4')}
          </div>
        ) : (
          <>
            {totalChanges === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {isConflictOnly
                  ? t('generated.components.staging_area.stagingarea.no_open_conflicts_a3f846f5')
                  : t('generated.components.staging_area.stagingarea.working_tree_is_clean_7d0c725c')}
              </div>
            ) : null}

            {isConflictOnly ? stagingSections : <div className="staging-file-sections">{stagingSections}</div>}
          </>
        )}
      </div>

      {!isBareRepository && !isConflictOnly && (
        <StashPanel repoPath={repoPath} onRepoChanged={onRepoChanged} setInputDialog={setInputDialog} refreshTrigger={stashRefreshTrigger} />
      )}

      {!isBareRepository && !isConflictOnly && (
        <StagingCommitPanel
          status={status}
          fileOps={fileOps}
          commitForm={commitForm}
          aiCommit={aiCommit}
          hasOpenConflicts={hasOpenConflicts}
          isCommitInputDisabled={isCommitInputDisabled}
          aiConfigEnabled={Boolean(settings.aiAutoCommitEnabled)}
          aiCommitMessageStyleLabel={aiCommitMessageStyleLabel}
          openAiCommitMessageDialog={openAiCommitMessageDialog}
        />
      )}

      <StagingContextMenu contextMenu={fileOps.contextMenu} fileOps={fileOps} />
    </div>
  );
};
