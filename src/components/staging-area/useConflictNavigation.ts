import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { ConflictBlock, ConflictEditorState, GitStatusWithConflicts } from './types';

type Params = {
  status: GitStatusWithConflicts | null;
  conflictEditor: ConflictEditorState | null;
  conflictBlocks: ConflictBlock[];
  selectedConflictBlock: ConflictBlock | null;
  selectedConflictBlockIndex: number;
  setSelectedConflictBlockIndex: Dispatch<SetStateAction<number>>;
  isStructuredConflictViewLocked: boolean;
  conflictManualScrollRef: RefObject<HTMLDivElement>;
  openConflictEditor: (filePath: string, initialBlockIndex?: number) => Promise<void> | void;
};

export const useConflictNavigation = ({
  status,
  conflictEditor,
  conflictBlocks,
  selectedConflictBlock,
  selectedConflictBlockIndex,
  setSelectedConflictBlockIndex,
  isStructuredConflictViewLocked,
  conflictManualScrollRef,
  openConflictEditor,
}: Params) => {
  const autoScrollAnchorRef = useRef<string>('');

  useLayoutEffect(() => {
    if (!selectedConflictBlock) return;
    if (isStructuredConflictViewLocked) return;
    if (!conflictEditor?.filePath) return;

    const anchor = `${conflictEditor.filePath}::${selectedConflictBlockIndex}`;
    if (autoScrollAnchorRef.current === anchor) return;
    autoScrollAnchorRef.current = anchor;

    const element = conflictManualScrollRef.current;
    if (!element) return;
    const line = selectedConflictBlock.startLine;
    const run = () => {
      const textarea = element.querySelector('textarea.conflict-manual-textarea');
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight || '18');
      element.scrollTop = Math.max(0, (line - 1) * lineHeight - 56);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [selectedConflictBlockIndex, conflictEditor?.filePath, selectedConflictBlock, isStructuredConflictViewLocked, conflictManualScrollRef]);

  useEffect(() => {
    if (conflictBlocks.length === 0) {
      if (selectedConflictBlockIndex !== 0) setSelectedConflictBlockIndex(0);
      return;
    }
    if (selectedConflictBlockIndex > conflictBlocks.length - 1) {
      setSelectedConflictBlockIndex(conflictBlocks.length - 1);
    }
  }, [conflictBlocks.length, selectedConflictBlockIndex, setSelectedConflictBlockIndex]);

  const conflictPaths = useMemo(() => (status ? [...new Set(status.conflicts.map((entry) => entry.path))].sort((a, b) => a.localeCompare(b)) : []), [status]);
  const safeSelectedConflictBlockIndex = conflictBlocks.length > 0 ? Math.min(selectedConflictBlockIndex, conflictBlocks.length - 1) : 0;
  const activeConflictFileIndex = conflictEditor ? conflictPaths.indexOf(conflictEditor.filePath) : -1;
  const canUseStructuredConflictNavigation = Boolean(conflictEditor) && !isStructuredConflictViewLocked && conflictBlocks.length > 0;
  const hasPreviousConflictTarget = canUseStructuredConflictNavigation && (safeSelectedConflictBlockIndex > 0 || activeConflictFileIndex > 0);
  const hasNextConflictTarget =
    canUseStructuredConflictNavigation &&
    (safeSelectedConflictBlockIndex < conflictBlocks.length - 1 || (activeConflictFileIndex >= 0 && activeConflictFileIndex < conflictPaths.length - 1));

  const navigateToPreviousConflict = useCallback(async () => {
    if (!canUseStructuredConflictNavigation || !conflictEditor) return;
    if (safeSelectedConflictBlockIndex > 0) {
      setSelectedConflictBlockIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (activeConflictFileIndex <= 0) return;
    const previousPath = conflictPaths[activeConflictFileIndex - 1];
    if (!previousPath) return;
    await openConflictEditor(previousPath, Number.MAX_SAFE_INTEGER);
  }, [
    canUseStructuredConflictNavigation,
    conflictEditor,
    safeSelectedConflictBlockIndex,
    activeConflictFileIndex,
    conflictPaths,
    openConflictEditor,
    setSelectedConflictBlockIndex,
  ]);

  const navigateToNextConflict = useCallback(async () => {
    if (!canUseStructuredConflictNavigation || !conflictEditor) return;
    if (safeSelectedConflictBlockIndex < conflictBlocks.length - 1) {
      setSelectedConflictBlockIndex((prev) => prev + 1);
      return;
    }
    if (activeConflictFileIndex < 0 || activeConflictFileIndex >= conflictPaths.length - 1) return;
    const nextPath = conflictPaths[activeConflictFileIndex + 1];
    if (!nextPath) return;
    await openConflictEditor(nextPath, 0);
  }, [
    canUseStructuredConflictNavigation,
    conflictEditor,
    safeSelectedConflictBlockIndex,
    conflictBlocks.length,
    activeConflictFileIndex,
    conflictPaths,
    openConflictEditor,
    setSelectedConflictBlockIndex,
  ]);

  return {
    conflictPaths,
    safeSelectedConflictBlockIndex,
    activeConflictFileIndex,
    canUseStructuredConflictNavigation,
    hasPreviousConflictTarget,
    hasNextConflictTarget,
    navigateToPreviousConflict,
    navigateToNextConflict,
  };
};
