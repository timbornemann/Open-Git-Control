import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { normalizeMergeConflictFileContent } from '@/utils/conflictLineGutter';
import type { ToastMessage } from '@/types/git';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { basename, buildConflictResolution, countConflictMarkerLines, detectLineEnding, parseConflictBlocks, replaceConflictBlock } from './utils';
import type { ConfirmDialogState, ConflictEditorState, ConflictResolutionChoice, GitStatusWithConflicts } from './types';

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
  const [conflictBlockCountsByPath, setConflictBlockCountsByPath] = useState<Record<string, number>>({});
  const [isConflictBlockCountPending, setIsConflictBlockCountPending] = useState(false);

  const conflictManualScrollRef = useRef<HTMLDivElement>(null);
  const autoOpenedConflictPathRef = useRef<string | null>(null);
  const appliedInitialConflictPathRef = useRef<string | null>(null);
  const autoScrollAnchorRef = useRef<string>('');
  const countedConflictPathsKeyRef = useRef<string>('');

  const openConflictEditor = useCallback(
    async (filePath: string, initialBlockIndex = 0) => {
      if (!gitClient.isAvailable()) return;
      setIsConflictEditorLoading(true);
      try {
        const result = await gitClient.readRepoFile(filePath);
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
        setToast({ msg: error?.message || tr(`Datei konnte nicht geladen werden: ${filePath}`, `Could not load file: ${filePath}`), isError: true });
      } finally {
        setIsConflictEditorLoading(false);
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

  useEffect(() => {
    if (!repoPath || !gitClient.isAvailable() || !status?.conflicts?.length) {
      setConflictBlockCountsByPath({});
      setIsConflictBlockCountPending(false);
      countedConflictPathsKeyRef.current = '';
      return;
    }

    let cancelled = false;
    const paths = [...new Set(status.conflicts.map((c) => c.path))].sort();
    const pathsKey = `${repoPath}::${paths.join('\u0001')}`;
    const shouldShowPending = countedConflictPathsKeyRef.current !== pathsKey;
    if (shouldShowPending) {
      setIsConflictBlockCountPending(true);
    }

    (async () => {
      const next: Record<string, number> = {};
      try {
        for (const path of paths) {
          const r = await gitClient.readRepoFile(path);
          if (cancelled) return;
          next[path] = r.success && typeof r.data === 'string' ? parseConflictBlocks(normalizeMergeConflictFileContent(r.data)).length : 0;
        }
        if (!cancelled) {
          setConflictBlockCountsByPath((prev) => {
            const normalized: Record<string, number> = {};
            let changed = Object.keys(prev).length !== paths.length;
            for (const path of paths) {
              const value = next[path] ?? 0;
              normalized[path] = value;
              if (prev[path] !== value) changed = true;
            }
            return changed ? normalized : prev;
          });
        }
      } finally {
        if (!cancelled) {
          countedConflictPathsKeyRef.current = pathsKey;
          setIsConflictBlockCountPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repoPath, status]);

  useLayoutEffect(() => {
    if (!selectedConflictBlock) return;
    if (isStructuredConflictViewLocked) return;
    if (!conflictEditor?.filePath) return;

    const anchor = `${conflictEditor.filePath}::${selectedConflictBlockIndex}`;
    if (autoScrollAnchorRef.current === anchor) return;
    autoScrollAnchorRef.current = anchor;

    const el = conflictManualScrollRef.current;
    if (!el) return;
    const line = selectedConflictBlock.startLine;
    const run = () => {
      const ta = el.querySelector('textarea.conflict-manual-textarea');
      if (!(ta instanceof HTMLTextAreaElement)) return;
      const lh = parseFloat(getComputedStyle(ta).lineHeight || '18');
      const scrollTop = Math.max(0, (line - 1) * lh - 56);
      el.scrollTop = scrollTop;
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [selectedConflictBlockIndex, conflictEditor?.filePath, selectedConflictBlock, isStructuredConflictViewLocked]);

  useEffect(() => {
    if (conflictBlocks.length === 0) {
      if (selectedConflictBlockIndex !== 0) setSelectedConflictBlockIndex(0);
      return;
    }
    if (selectedConflictBlockIndex > conflictBlocks.length - 1) {
      setSelectedConflictBlockIndex(conflictBlocks.length - 1);
    }
  }, [conflictBlocks.length, selectedConflictBlockIndex]);

  useEffect(() => {
    if (onOpenConflictResolver && !isConflictOnly) return;
    if (!status || status.conflicts.length === 0) {
      autoOpenedConflictPathRef.current = null;
      setConflictEditor(null);
      setSelectedConflictBlockIndex(0);
      return;
    }
    const activePath = conflictEditor?.filePath || null;
    const activeStillConflicting = activePath ? status.conflicts.some((entry) => entry.path === activePath) : false;
    if (activeStillConflicting) {
      autoOpenedConflictPathRef.current = activePath;
      return;
    }
    const nextPath = status.conflicts[0]?.path;
    if (!nextPath) return;
    if (!activePath && autoOpenedConflictPathRef.current === nextPath) return;
    autoOpenedConflictPathRef.current = nextPath;
    void openConflictEditor(nextPath);
  }, [status, conflictEditor, openConflictEditor, onOpenConflictResolver, isConflictOnly]);

  useEffect(() => {
    if (!isConflictOnly) {
      appliedInitialConflictPathRef.current = null;
      return;
    }
    if (!initialConflictPath) return;
    if (!status || status.conflicts.length === 0) return;
    if (appliedInitialConflictPathRef.current === initialConflictPath) return;
    if (!status.conflicts.some((entry) => entry.path === initialConflictPath)) return;
    appliedInitialConflictPathRef.current = initialConflictPath;
    if (conflictEditor?.filePath === initialConflictPath) return;
    void openConflictEditor(initialConflictPath);
  }, [isConflictOnly, initialConflictPath, status, conflictEditor?.filePath, openConflictEditor]);

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
      const didResolve = await markConflictResolved(filePath);
      if (!didResolve) return;
      if (conflictEditor?.filePath === filePath) {
        setConflictEditor(null);
        setSelectedConflictBlockIndex(0);
      }
    },
    [conflictEditor, markConflictResolved],
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
      if (!gitClient.isAvailable() || !conflictEditor) return;
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
      setConflictEditor((prev) => {
        if (!prev || prev.filePath !== targetPath) return prev;
        return { ...prev, isSaving: true };
      });
      try {
        const writeResult = await gitClient.writeRepoFile(targetPath, targetContent);
        if (!writeResult.success) throw new Error(writeResult.error || t('generated.components.staging_area.useconflictresolver.could_not_save_file_6d41241a'));
        if (markResolvedAfterSave) {
          const stageResult = await gitClient.runGitCommand('conflictMarkResolved', targetPath);
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
        setConflictEditor((prev) => {
          if (!prev || prev.filePath !== targetPath) return prev;
          return { ...prev, isSaving: false };
        });
        setToast({ msg: error?.message || t('generated.components.staging_area.useconflictresolver.could_not_save_conflict_file_e9930739'), isError: true });
      }
    },
    [conflictEditor, onRepoChanged, refresh, setToast, t, tr],
  );

  const mergeContinue = useCallback(
    () => git(['mergeContinue'], t('generated.components.staging_area.useconflictresolver.merge_continued_fc503f43'), true),
    [git, t],
  );
  const mergeAbort = useCallback(() => {
    setConfirmDialog({
      variant: 'danger',
      title: t('generated.components.staging_area.useconflictresolver.abort_merge_b80580e6'),
      message: t('generated.components.staging_area.useconflictresolver.the_active_merge_will_be_discarded_and_reset_to_the_pre_7fdcd8df'),
      contextItems: [{ label: t('generated.components.staging_area.useconflictresolver.action_ba062410'), value: 'git merge --abort' }],
      irreversible: true,
      consequences: t('generated.components.staging_area.useconflictresolver.all_unsaved_merge_conflict_resolutions_will_be_lost_96aa2476'),
      confirmLabel: t('generated.components.layout.main.mainprimarypane.abort_merge_8f3c2f66'),
      onConfirm: async () => {
        await git(['mergeAbort'], t('generated.components.staging_area.useconflictresolver.merge_aborted_1750e90f'), true);
      },
    });
  }, [setConfirmDialog, t, git]);

  const rebaseContinue = useCallback(
    () => git(['rebaseContinue'], t('generated.components.staging_area.useconflictresolver.rebase_continued_d91def08'), true),
    [git, t],
  );
  const rebaseAbort = useCallback(() => {
    setConfirmDialog({
      variant: 'danger',
      title: t('generated.components.staging_area.useconflictresolver.abort_rebase_1cf7416a'),
      message: t('generated.components.staging_area.useconflictresolver.the_active_rebase_will_be_discarded_and_the_previous_bra_13fdc39c'),
      contextItems: [{ label: t('generated.components.staging_area.useconflictresolver.action_ba062410'), value: 'git rebase --abort' }],
      irreversible: true,
      consequences: t('generated.components.staging_area.useconflictresolver.all_unsaved_rebase_resolutions_will_be_lost_8fee553e'),
      confirmLabel: t('generated.components.layout.main.mainprimarypane.abort_rebase_c924fd71'),
      onConfirm: async () => {
        await git(['rebaseAbort'], t('generated.components.staging_area.useconflictresolver.rebase_aborted_339ee787'), true);
      },
    });
  }, [setConfirmDialog, t, git]);

  const onConflictEditorContentChange = useCallback((filePath: string, nextContent: string) => {
    setConflictEditor((prev) => {
      if (!prev || prev.filePath !== filePath) return prev;
      return { ...prev, content: nextContent };
    });
  }, []);

  // Derived navigation values (need status + editor state)
  const conflictPaths = useMemo(() => (status ? [...new Set(status.conflicts.map((e) => e.path))].sort((a, b) => a.localeCompare(b)) : []), [status]);
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
  }, [canUseStructuredConflictNavigation, conflictEditor, safeSelectedConflictBlockIndex, activeConflictFileIndex, conflictPaths, openConflictEditor]);

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
  ]);

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
    onConflictEditorContentChange,
    // Navigation
    conflictPaths,
    safeSelectedConflictBlockIndex,
    activeConflictFileIndex,
    canUseStructuredConflictNavigation,
    hasPreviousConflictTarget,
    hasNextConflictTarget,
    navigateToPreviousConflict,
    navigateToNextConflict,
    blockCountForPath,
  };
};
