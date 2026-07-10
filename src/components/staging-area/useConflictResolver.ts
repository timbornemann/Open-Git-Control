import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { normalizeMergeConflictFileContent } from '@/utils/conflictLineGutter';
import type { ToastMessage } from '@/types/git';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { basename, buildConflictResolution, countConflictMarkerLines, detectLineEnding, parseConflictBlocks, replaceConflictBlock } from './utils';
import type { ConfirmDialogState, ConflictEditorState, ConflictResolutionChoice, GitStatusWithConflicts } from './types';
import { useConflictAutoOpen } from './useConflictAutoOpen';
import { useConflictBlockCounts } from './useConflictBlockCounts';
import { useConflictNavigation } from './useConflictNavigation';
import { buildCherryPickAbortDialog, buildMergeAbortDialog, buildRebaseAbortDialog } from './conflictAbortDialogs';

type Params = {
  repoPath: string | null;
  status: GitStatusWithConflicts | null;
  setToast: (msg: ToastMessage | null) => void;
  setConfirmDialog: (d: ConfirmDialogState | null) => void;
  git: (args: string[], msg: string, notify?: boolean) => Promise<boolean>;
  refresh: () => Promise<void>;
  onRepoChanged?: () => void;
  initialConflictPath?: string | null;
  isConflictOnly: boolean;
  onOpenConflictResolver?: (filePath: string) => void;
};

export const useConflictResolver = ({
  repoPath,
  status,
  setToast,
  setConfirmDialog,
  git,
  refresh,
  onRepoChanged,
  initialConflictPath,
  isConflictOnly,
  onOpenConflictResolver,
}: Params) => {
  const { t, tr } = useI18n();
  const [conflictEditor, setConflictEditor] = useState<ConflictEditorState | null>(null);
  const [isConflictEditorLoading, setIsConflictEditorLoading] = useState(false);
  const [selectedConflictBlockIndex, setSelectedConflictBlockIndex] = useState(0);

  const conflictManualScrollRef = useRef<HTMLDivElement>(null);
  const repoGenerationRef = useRef(0);
  const editorRequestRef = useRef(0);
  const editorSessionRef = useRef(0);
  const activeConflictActionRef = useRef<number | null>(null);
  const nextConflictActionIdRef = useRef(0);
  const { conflictBlockCountsByPath, isConflictBlockCountPending } = useConflictBlockCounts({ repoPath, status });

  useLayoutEffect(() => {
    repoGenerationRef.current += 1;
    editorRequestRef.current += 1;
    editorSessionRef.current += 1;
    activeConflictActionRef.current = null;
    setConflictEditor(null);
    setIsConflictEditorLoading(false);
    setSelectedConflictBlockIndex(0);
  }, [repoPath]);

  useEffect(() => {
    if ((status?.conflicts || []).length === 0) {
      editorRequestRef.current += 1;
      editorSessionRef.current += 1;
    }
  }, [status?.conflicts]);

  const openConflictEditor = useCallback(
    async (filePath: string, initialBlockIndex = 0) => {
      if (!gitClient.isAvailable()) return;
      const repoGeneration = repoGenerationRef.current;
      const requestId = ++editorRequestRef.current;
      const editorSession = ++editorSessionRef.current;
      const isCurrentRequest = () =>
        repoGeneration === repoGenerationRef.current && requestId === editorRequestRef.current && editorSession === editorSessionRef.current;
      setIsConflictEditorLoading(true);
      try {
        const result = await gitClient.readRepoFile(filePath);
        if (!isCurrentRequest()) return;
        if (!result.success || typeof result.data !== 'string') {
          setToast({ msg: result.error || tr(`Datei konnte nicht geladen werden: ${filePath}`, `Could not load file: ${filePath}`), isError: true });
          return;
        }
        const normalized = normalizeMergeConflictFileContent(result.data);
        const parsedBlocks = parseConflictBlocks(normalized);
        const requestedIndex = Number.isFinite(initialBlockIndex) ? Math.max(0, Math.floor(initialBlockIndex)) : 0;
        const boundedIndex = parsedBlocks.length > 0 ? Math.min(requestedIndex, parsedBlocks.length - 1) : 0;
        setConflictEditor({ filePath, originalContent: normalized, content: normalized, isSaving: false });
        setSelectedConflictBlockIndex(boundedIndex);
      } catch (error: any) {
        if (!isCurrentRequest()) return;
        setToast({ msg: error?.message || tr(`Datei konnte nicht geladen werden: ${filePath}`, `Could not load file: ${filePath}`), isError: true });
      } finally {
        if (isCurrentRequest()) setIsConflictEditorLoading(false);
      }
    },
    [setToast, tr],
  );

  const reloadActiveConflictEditor = useCallback(async () => {
    if (!conflictEditor) return;
    await openConflictEditor(conflictEditor.filePath);
  }, [conflictEditor, openConflictEditor]);

  const conflictBlocks = useMemo(() => {
    if (!conflictEditor) return [];
    return parseConflictBlocks(conflictEditor.content);
  }, [conflictEditor]);

  const selectedConflictBlock = useMemo(() => {
    if (conflictBlocks.length === 0) return null;
    const safeIndex = Math.min(selectedConflictBlockIndex, conflictBlocks.length - 1);
    return conflictBlocks[safeIndex] || null;
  }, [conflictBlocks, selectedConflictBlockIndex]);

  const conflictMarkerStats = useMemo(() => {
    if (!conflictEditor) return { starts: 0, separators: 0, ends: 0 };
    return countConflictMarkerLines(conflictEditor.content);
  }, [conflictEditor]);

  const hasRawConflictMarkers = conflictMarkerStats.starts + conflictMarkerStats.separators + conflictMarkerStats.ends > 0;
  const hasBalancedConflictMarkers = conflictMarkerStats.starts === conflictMarkerStats.separators && conflictMarkerStats.starts === conflictMarkerStats.ends;
  const isStructuredConflictViewLocked = hasRawConflictMarkers && (!hasBalancedConflictMarkers || conflictBlocks.length !== conflictMarkerStats.starts);
  const isConflictEditorDirty = Boolean(conflictEditor && conflictEditor.content !== conflictEditor.originalContent);

  useConflictAutoOpen({
    status,
    conflictEditor,
    setConflictEditor,
    setSelectedConflictBlockIndex,
    openConflictEditor,
    initialConflictPath,
    isConflictOnly,
    onOpenConflictResolver,
  });

  const applyConflictChoiceToSelected = useCallback(
    (choice: ConflictResolutionChoice) => {
      if (!conflictEditor) return;
      const blocks = parseConflictBlocks(conflictEditor.content);
      if (blocks.length === 0) return;
      const blockIndex = Math.min(selectedConflictBlockIndex, blocks.length - 1);
      const block = blocks[blockIndex];
      if (!block) return;
      const nextContent = replaceConflictBlock(conflictEditor.content, block, buildConflictResolution(block, choice, detectLineEnding(conflictEditor.content)));
      setConflictEditor((prev) => {
        if (!prev || prev.filePath !== conflictEditor.filePath) return prev;
        return { ...prev, content: nextContent };
      });
      const selectedLabel =
        choice === 'ours'
          ? t('generated.components.staging_area.conflictresolverpanel.current_version_5aeac7d3')
          : choice === 'theirs'
            ? t('generated.components.staging_area.conflictresolverpanel.incoming_version_321cfa46')
            : t('generated.components.staging_area.useconflictresolver.both_sides_a40e890e');
      setToast({
        msg: tr(`${selectedLabel} fuer Block ${blockIndex + 1} uebernommen.`, `Applied ${selectedLabel} for block ${blockIndex + 1}.`),
        isError: false,
      });
    },
    [conflictEditor, selectedConflictBlockIndex, setToast, t, tr],
  );

  const applyConflictChoiceToAll = useCallback(
    (choice: ConflictResolutionChoice) => {
      if (!conflictEditor) return;
      const blocks = parseConflictBlocks(conflictEditor.content);
      if (blocks.length === 0) return;
      let nextContent = conflictEditor.content;
      const lineEnding = detectLineEnding(conflictEditor.content);
      for (let i = blocks.length - 1; i >= 0; i -= 1) {
        nextContent = replaceConflictBlock(nextContent, blocks[i], buildConflictResolution(blocks[i], choice, lineEnding));
      }
      setConflictEditor((prev) => {
        if (!prev || prev.filePath !== conflictEditor.filePath) return prev;
        return { ...prev, content: nextContent };
      });
      setSelectedConflictBlockIndex(0);
      const selectedLabel =
        choice === 'ours'
          ? t('generated.components.staging_area.conflictresolverpanel.current_version_5aeac7d3')
          : choice === 'theirs'
            ? t('generated.components.staging_area.conflictresolverpanel.incoming_version_321cfa46')
            : t('generated.components.staging_area.useconflictresolver.both_sides_a40e890e');
      setToast({ msg: tr(`${selectedLabel} fuer alle Konfliktbloecke uebernommen.`, `Applied ${selectedLabel} for all conflict blocks.`), isError: false });
    },
    [conflictEditor, setToast, t, tr],
  );

  const markConflictResolved = useCallback(
    (filePath: string) => git(['conflictMarkResolved', filePath], tr(`${basename(filePath)} als geloest markiert`, `Marked ${basename(filePath)} as resolved`)),
    [git, tr],
  );

  const markConflictResolvedAndSync = useCallback(
    async (filePath: string) => {
      if (activeConflictActionRef.current !== null) return;
      if (conflictEditor?.filePath === filePath && hasRawConflictMarkers) {
        setToast({
          msg: t('generated.components.staging_area.useconflictresolver.before_save_mark_as_resolved_all_conflict_markers_must_b_f4e68eaf'),
          isError: true,
        });
        return;
      }
      const actionId = ++nextConflictActionIdRef.current;
      const repoGeneration = repoGenerationRef.current;
      const editorSession = editorSessionRef.current;
      activeConflictActionRef.current = actionId;
      try {
        const didResolve = await markConflictResolved(filePath);
        if (
          !didResolve ||
          repoGeneration !== repoGenerationRef.current ||
          editorSession !== editorSessionRef.current ||
          activeConflictActionRef.current !== actionId
        ) {
          return;
        }
        if (conflictEditor?.filePath === filePath) {
          setConflictEditor(null);
          setSelectedConflictBlockIndex(0);
        }
      } finally {
        if (activeConflictActionRef.current === actionId) activeConflictActionRef.current = null;
      }
    },
    [conflictEditor, hasRawConflictMarkers, markConflictResolved, setToast, t],
  );

  const resetConflictEditorDraft = useCallback(() => {
    if (!conflictEditor) return;
    setConflictEditor((prev) => {
      if (!prev || prev.filePath !== conflictEditor.filePath) return prev;
      return { ...prev, content: prev.originalContent };
    });
    setToast({ msg: t('generated.components.staging_area.useconflictresolver.discarded_local_editor_changes_297514e3'), isError: false });
  }, [conflictEditor, setToast, t]);

  const saveConflictEditor = useCallback(
    async (markResolvedAfterSave: boolean) => {
      if (!gitClient.isAvailable() || !conflictEditor || activeConflictActionRef.current !== null) return;
      const pendingBlocks = parseConflictBlocks(conflictEditor.content);
      if (markResolvedAfterSave && pendingBlocks.length > 0) {
        setToast({
          msg: t('generated.components.staging_area.useconflictresolver.before_save_mark_as_resolved_all_conflict_markers_must_b_f4e68eaf'),
          isError: true,
        });
        return;
      }
      const targetPath = conflictEditor.filePath;
      const targetContent = conflictEditor.content;
      const repoGeneration = repoGenerationRef.current;
      const editorSession = editorSessionRef.current;
      const actionId = ++nextConflictActionIdRef.current;
      activeConflictActionRef.current = actionId;
      const isCurrentAction = () =>
        repoGeneration === repoGenerationRef.current && editorSession === editorSessionRef.current && activeConflictActionRef.current === actionId;
      setConflictEditor((prev) => {
        if (!prev || prev.filePath !== targetPath) return prev;
        return { ...prev, isSaving: true };
      });
      try {
        const writeResult = await gitClient.writeRepoFile(targetPath, targetContent);
        if (!isCurrentAction()) return;
        if (!writeResult.success) throw new Error(writeResult.error || t('generated.components.staging_area.useconflictresolver.could_not_save_file_6d41241a'));
        if (markResolvedAfterSave) {
          const stageResult = await gitClient.runGitCommand('conflictMarkResolved', targetPath);
          if (!isCurrentAction()) return;
          if (!stageResult.success)
            throw new Error(stageResult.error || t('generated.components.staging_area.useconflictresolver.could_not_mark_file_as_resolved_f7ee9c12'));
        }
        setConflictEditor((prev) => {
          if (!prev || prev.filePath !== targetPath) return prev;
          return { ...prev, content: targetContent, originalContent: targetContent, isSaving: false };
        });
        setToast({
          msg: markResolvedAfterSave
            ? tr(`${basename(targetPath)} gespeichert + geloest`, `Saved ${basename(targetPath)} + resolved`)
            : tr(`${basename(targetPath)} gespeichert`, `Saved ${basename(targetPath)}`),
          isError: false,
        });
        if (onRepoChanged) onRepoChanged();
        await refresh();
      } catch (error: any) {
        if (!isCurrentAction()) return;
        setConflictEditor((prev) => {
          if (!prev || prev.filePath !== targetPath) return prev;
          return { ...prev, isSaving: false };
        });
        setToast({ msg: error?.message || t('generated.components.staging_area.useconflictresolver.could_not_save_conflict_file_e9930739'), isError: true });
      } finally {
        if (activeConflictActionRef.current === actionId) activeConflictActionRef.current = null;
      }
    },
    [conflictEditor, onRepoChanged, refresh, setToast, t, tr],
  );

  const mergeContinue = useCallback(
    () => git(['mergeContinue'], t('generated.components.staging_area.useconflictresolver.merge_continued_fc503f43'), true),
    [git, t],
  );
  const mergeAbort = useCallback(() => {
    setConfirmDialog(
      buildMergeAbortDialog({
        t,
        onConfirm: async () => {
          await git(['mergeAbort'], t('generated.components.staging_area.useconflictresolver.merge_aborted_1750e90f'), true);
        },
      }),
    );
  }, [setConfirmDialog, t, git]);

  const rebaseContinue = useCallback(
    () => git(['rebaseContinue'], t('generated.components.staging_area.useconflictresolver.rebase_continued_d91def08'), true),
    [git, t],
  );
  const rebaseAbort = useCallback(() => {
    setConfirmDialog(
      buildRebaseAbortDialog({
        t,
        onConfirm: async () => {
          await git(['rebaseAbort'], t('generated.components.staging_area.useconflictresolver.rebase_aborted_339ee787'), true);
        },
      }),
    );
  }, [setConfirmDialog, t, git]);

  const cherryPickContinue = useCallback(
    () => git(['cherryPickContinue'], t('generated.components.staging_area.useconflictresolver.cherry_pick_continued_f1a2b3c4'), true),
    [git, t],
  );
  const cherryPickAbort = useCallback(() => {
    setConfirmDialog(
      buildCherryPickAbortDialog({
        t,
        onConfirm: async () => {
          await git(['cherryPickAbort'], t('generated.components.staging_area.useconflictresolver.cherry_pick_aborted_d5e6f7a8'), true);
        },
      }),
    );
  }, [setConfirmDialog, t, git]);

  const onConflictEditorContentChange = useCallback((filePath: string, nextContent: string) => {
    setConflictEditor((prev) => {
      if (!prev || prev.filePath !== filePath) return prev;
      return { ...prev, content: nextContent };
    });
  }, []);

  const navigation = useConflictNavigation({
    status,
    conflictEditor,
    conflictBlocks,
    selectedConflictBlock,
    selectedConflictBlockIndex,
    setSelectedConflictBlockIndex,
    isStructuredConflictViewLocked,
    conflictManualScrollRef,
    openConflictEditor,
  });

  const blockCountForPath = useCallback(
    (path: string) => {
      if (conflictEditor?.filePath === path) return conflictBlocks.length;
      return conflictBlockCountsByPath[path] ?? 0;
    },
    [conflictEditor, conflictBlocks.length, conflictBlockCountsByPath],
  );

  return {
    conflictEditor,
    setConflictEditor,
    isConflictEditorLoading,
    selectedConflictBlockIndex,
    setSelectedConflictBlockIndex,
    conflictBlockCountsByPath,
    isConflictBlockCountPending,
    conflictManualScrollRef,
    conflictBlocks,
    selectedConflictBlock,
    conflictMarkerStats,
    isStructuredConflictViewLocked,
    isConflictEditorDirty,
    openConflictEditor,
    reloadActiveConflictEditor,
    applyConflictChoiceToSelected,
    applyConflictChoiceToAll,
    markConflictResolvedAndSync,
    resetConflictEditorDraft,
    saveConflictEditor,
    mergeContinue,
    mergeAbort,
    rebaseContinue,
    rebaseAbort,
    cherryPickContinue,
    cherryPickAbort,
    onConflictEditorContentChange,
    // Navigation
    conflictPaths: navigation.conflictPaths,
    safeSelectedConflictBlockIndex: navigation.safeSelectedConflictBlockIndex,
    activeConflictFileIndex: navigation.activeConflictFileIndex,
    canUseStructuredConflictNavigation: navigation.canUseStructuredConflictNavigation,
    hasPreviousConflictTarget: navigation.hasPreviousConflictTarget,
    hasNextConflictTarget: navigation.hasNextConflictTarget,
    navigateToPreviousConflict: navigation.navigateToPreviousConflict,
    navigateToNextConflict: navigation.navigateToNextConflict,
    blockCountForPath,
  };
};
