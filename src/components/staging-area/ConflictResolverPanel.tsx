import React from 'react';
import { cx } from '@/components/ui';
import { ConflictEditorPanel } from './ConflictEditorPanel';
import { ConflictFileList } from './ConflictFileList';
import { ConflictResolverHeader } from './ConflictResolverHeader';
import type { ConflictBlock, ConflictEditorState, ConflictEntry, ConflictResolutionChoice } from './types';

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
  resolveConflictByDeletion: (filePath: string) => Promise<void> | void;
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
  showOperationActions?: boolean;
  isGitActionRunning?: boolean;
  onMergeContinue?: () => void;
  onMergeAbort?: () => void;
  onRebaseContinue?: () => void;
  onRebaseAbort?: () => void;
  onCherryPickContinue?: () => void;
  onCherryPickAbort?: () => void;
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
  resolveConflictByDeletion,
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
  showOperationActions = false,
  isGitActionRunning = false,
  onMergeContinue,
  onMergeAbort,
  onRebaseContinue,
  onRebaseAbort,
  onCherryPickContinue,
  onCherryPickAbort,
}) => {
  if (visibleConflicts.length === 0) {
    return null;
  }

  const isCompact = Boolean(onOpenConflictResolver);
  const isNavigationBusy = isConflictEditorLoading || conflictEditor?.isSaving === true;

  return (
    <div className={cx('staging-section conflict-section', isConflictOnly && 'conflict-section--resolve', isCompact && 'conflict-section--compact')}>
      <ConflictResolverHeader
        isCompact={isCompact}
        isNavigationBusy={isNavigationBusy}
        isConflictBlockCountPending={isConflictBlockCountPending}
        totalConflictBlocksInView={totalConflictBlocksInView}
        visibleConflictCount={visibleConflicts.length}
        hasPreviousConflictTarget={hasPreviousConflictTarget}
        hasNextConflictTarget={hasNextConflictTarget}
        navigateToPreviousConflict={navigateToPreviousConflict}
        navigateToNextConflict={navigateToNextConflict}
        isStructuredConflictViewLocked={isStructuredConflictViewLocked}
        activeConflictFileIndex={activeConflictFileIndex}
        conflictPathsCount={conflictPaths.length}
        conflictBlocksCount={conflictBlocks.length}
        safeSelectedConflictBlockIndex={safeSelectedConflictBlockIndex}
        showOperationActions={showOperationActions}
        isGitActionRunning={isGitActionRunning}
        onMergeContinue={onMergeContinue}
        onMergeAbort={onMergeAbort}
        onRebaseContinue={onRebaseContinue}
        onRebaseAbort={onRebaseAbort}
        onCherryPickContinue={onCherryPickContinue}
        onCherryPickAbort={onCherryPickAbort}
      />

      {isCompact ? (
        <ConflictFileList
          visibleConflicts={visibleConflicts}
          conflictEditor={conflictEditor}
          isConflictOnly={isConflictOnly}
          isConflictBlockCountPending={isConflictBlockCountPending}
          blockCountForPath={blockCountForPath}
          onOpenConflictResolver={onOpenConflictResolver}
          openConflictEditor={openConflictEditor}
        />
      ) : (
        <div
          className={cx(
            'conflict-layout conflict-layout--embedded',
            isConflictOnly && 'conflict-layout--fill',
            !isConflictOnly && 'conflict-layout--with-min-height',
          )}
        >
          <ConflictFileList
            visibleConflicts={visibleConflicts}
            conflictEditor={conflictEditor}
            isConflictOnly={isConflictOnly}
            isConflictBlockCountPending={isConflictBlockCountPending}
            blockCountForPath={blockCountForPath}
            openConflictEditor={openConflictEditor}
          />
          <ConflictEditorPanel
            conflictEditor={conflictEditor}
            isConflictEditorLoading={isConflictEditorLoading}
            reloadActiveConflictEditor={reloadActiveConflictEditor}
            applyConflictChoiceToAll={applyConflictChoiceToAll}
            markConflictResolvedAndSync={markConflictResolvedAndSync}
            resolveConflictByDeletion={resolveConflictByDeletion}
            isStructuredConflictViewLocked={isStructuredConflictViewLocked}
            conflictBlocks={conflictBlocks}
            selectedConflictBlock={selectedConflictBlock}
            safeSelectedConflictBlockIndex={safeSelectedConflictBlockIndex}
            applyConflictChoiceToSelected={applyConflictChoiceToSelected}
            resetConflictEditorDraft={resetConflictEditorDraft}
            saveConflictEditor={saveConflictEditor}
            isConflictEditorDirty={isConflictEditorDirty}
            conflictManualScrollRef={conflictManualScrollRef}
            onConflictEditorContentChange={onConflictEditorContentChange}
          />
        </div>
      )}
    </div>
  );
};
