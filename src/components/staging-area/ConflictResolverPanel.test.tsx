import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConflictResolverPanel } from './ConflictResolverPanel';

describe('ConflictResolverPanel sequencer controls', () => {
  it('keeps only the detected operation controls visible after the last conflict is staged', () => {
    const onRebaseContinue = vi.fn();
    const onRebaseAbort = vi.fn();
    const markup = renderToStaticMarkup(
      <ConflictResolverPanel
        visibleConflicts={[]}
        isConflictOnly={false}
        onOpenConflictResolver={vi.fn()}
        isConflictBlockCountPending={false}
        totalConflictBlocksInView={0}
        conflictEditor={null}
        isConflictEditorLoading={false}
        blockCountForPath={() => 0}
        openConflictEditor={vi.fn()}
        reloadActiveConflictEditor={vi.fn()}
        applyConflictChoiceToAll={vi.fn()}
        markConflictResolvedAndSync={vi.fn()}
        resolveConflictByDeletion={vi.fn()}
        hasPreviousConflictTarget={false}
        hasNextConflictTarget={false}
        navigateToPreviousConflict={vi.fn()}
        navigateToNextConflict={vi.fn()}
        isStructuredConflictViewLocked={false}
        activeConflictFileIndex={-1}
        conflictPaths={[]}
        conflictBlocks={[]}
        selectedConflictBlock={null}
        safeSelectedConflictBlockIndex={0}
        applyConflictChoiceToSelected={vi.fn()}
        resetConflictEditorDraft={vi.fn()}
        saveConflictEditor={vi.fn()}
        isConflictEditorDirty={false}
        conflictManualScrollRef={{ current: null }}
        onConflictEditorContentChange={vi.fn()}
        showOperationActions
        onRebaseContinue={onRebaseContinue}
        onRebaseAbort={onRebaseAbort}
      />,
    );

    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('Rebase');
    expect(markup).not.toContain('Cherry');
    expect(markup).not.toContain('Merge');
  });
});
