import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileEntry } from '@/utils/gitParsing';
import { parseGitStatusDetailed, type GitStatusDetailed } from '@/utils/gitParsing';
import type { GitCommandNameDto, WorkingTreeStatsDto } from '@/global';
import type { DiffRequest } from '@/types/diff';
import type { ToastMessage } from '@/types/git';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { EMPTY_DIFF_STATS, basename, parseConflictEntries, parseNumstatStats } from './utils';
import type { ConfirmDialogState, DiffStats, FileSection, GitStatusWithConflicts, InputDialogState, StagingContextMenuState } from './types';

type Params = {
  repoPath: string | null;
  setToast: (msg: ToastMessage | null) => void;
  setConfirmDialog: (d: ConfirmDialogState | null) => void;
  setInputDialog: (d: InputDialogState | null) => void;
  onRepoChanged?: () => void;
  onStashChanged?: () => void;
  onOpenDiff?: (request: DiffRequest) => void;
  externalStatus?: GitStatusDetailed | null;
  externalStatusRaw?: string;
  externalStats?: WorkingTreeStatsDto | null;
  externalRefresh?: () => Promise<void>;
};

export const useFileOperations = ({
  repoPath,
  setToast,
  setConfirmDialog,
  setInputDialog,
  onRepoChanged,
  onStashChanged,
  onOpenDiff,
  externalStatus,
  externalStatusRaw,
  externalStats,
  externalRefresh,
}: Params) => {
  const { t, tr } = useI18n();
  const [status, setStatus] = useState<GitStatusWithConflicts | null>(null);
  const [stagedStats, setStagedStats] = useState<DiffStats>(EMPTY_DIFF_STATS);
  const [unstagedStats, setUnstagedStats] = useState<DiffStats>(EMPTY_DIFF_STATS);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<StagingContextMenuState | null>(null);
  const [mutationStartedAt, setMutationStartedAt] = useState<number | null>(null);
  const [mutationElapsedMs, setMutationElapsedMs] = useState(0);
  const mutationInFlightRef = useRef(false);
  const externalRefreshRef = useRef(externalRefresh);

  useEffect(() => {
    externalRefreshRef.current = externalRefresh;
  }, [externalRefresh]);

  useEffect(() => {
    if (mutationStartedAt === null) {
      setMutationElapsedMs(0);
      return;
    }
    const update = () => setMutationElapsedMs(Date.now() - mutationStartedAt);
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [mutationStartedAt]);

  const refresh = useCallback(async () => {
    if (!repoPath || !gitClient.isAvailable()) return;
    if (externalRefresh) {
      await externalRefresh();
      return;
    }
    try {
      const [statusResult, stagedResult, unstagedResult] = await Promise.all([
        gitClient.getStatusPorcelain(),
        gitClient.runGitCommand('diff', '--numstat', '--cached'),
        gitClient.runGitCommand('diff', '--numstat'),
      ]);
      if (externalRefreshRef.current) return;

      if (statusResult.success) {
        const rawStatus = statusResult.data || '';
        const parsed = parseGitStatusDetailed(rawStatus);
        const conflicts = parseConflictEntries(rawStatus);
        const conflictPathSet = new Set(conflicts.map((c) => c.path));
        setStatus({
          ...parsed,
          conflicts,
          staged: parsed.staged.filter((f) => !conflictPathSet.has(f.path)),
          unstaged: parsed.unstaged.filter((f) => !conflictPathSet.has(f.path)),
        });
      }

      setStagedStats(stagedResult.success ? parseNumstatStats(stagedResult.data || '') : EMPTY_DIFF_STATS);
      setUnstagedStats(unstagedResult.success ? parseNumstatStats(unstagedResult.data || '') : EMPTY_DIFF_STATS);
    } catch (e) {
      console.error(e);
    }
  }, [externalRefresh, repoPath]);

  useEffect(() => {
    if (externalStatus === undefined) return;
    if (!externalStatus) {
      setStatus(null);
      return;
    }
    const conflicts = parseConflictEntries(externalStatusRaw || '');
    const conflictPathSet = new Set(conflicts.map((conflict) => conflict.path));
    setStatus({
      ...externalStatus,
      conflicts,
      staged: externalStatus.staged.filter((file) => !conflictPathSet.has(file.path)),
      unstaged: externalStatus.unstaged.filter((file) => !conflictPathSet.has(file.path)),
    });
  }, [externalStatus, externalStatusRaw]);

  useEffect(() => {
    if (externalStats === undefined) return;
    setStagedStats(externalStats?.staged || EMPTY_DIFF_STATS);
    setUnstagedStats(externalStats?.unstaged || EMPTY_DIFF_STATS);
  }, [externalStats]);

  useEffect(() => {
    if (!repoPath) {
      setStatus(null);
      setStagedStats(EMPTY_DIFF_STATS);
      setUnstagedStats(EMPTY_DIFF_STATS);
      return;
    }
    if (externalRefresh) return;
    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refresh();
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refresh();
      }
    };

    void refresh();
    const iv = setInterval(refreshIfVisible, 3000);
    window.addEventListener('focus', refreshIfVisible);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', refreshIfVisible);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [externalRefresh, repoPath, refresh]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const git = useCallback(
    async (args: string[], msg: string, notify = false) => {
      if (!gitClient.isAvailable() || args.length === 0) return false;
      if (mutationInFlightRef.current) return false;
      mutationInFlightRef.current = true;
      setMutationStartedAt(Date.now());
      try {
        const r = await gitClient.runGitCommand(args[0] as GitCommandNameDto, ...args.slice(1));
        if (r.success) {
          setToast({ msg, isError: false });
          if (notify && onRepoChanged) onRepoChanged();
          await refresh();
          return true;
        } else {
          setToast({ msg: r.error || t('generated.components.layout.cloneprogressmodal.error_7d62310f'), isError: true });
          return false;
        }
      } catch (e: any) {
        setToast({ msg: e.message, isError: true });
        return false;
      } finally {
        mutationInFlightRef.current = false;
        setMutationStartedAt(null);
      }
    },
    [setToast, onRepoChanged, refresh, t],
  );

  const openFileContextMenu = useCallback((event: React.MouseEvent, entry: FileEntry, section: FileSection) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, entry, section });
  }, []);

  const addIgnoreRule = useCallback(
    async (entry: FileEntry, section: FileSection, pattern: string) => {
      if (!gitClient.isAvailable()) return;
      const normalizedPattern = pattern.trim();
      if (!normalizedPattern) return;
      try {
        const result = await gitClient.addIgnoreRule(normalizedPattern);
        if (!result.success) {
          setToast({ msg: result.error || t('generated.components.staging_area.usefileoperations.could_not_update_gitignore_074773f8'), isError: true });
          return;
        }
        if (section === 'staged' && entry.x === 'A') {
          await gitClient.runGitCommand('reset', 'HEAD', '--', entry.path);
        }
        setToast({
          msg: result.added
            ? tr(`Ignore-Regel hinzugefuegt: ${normalizedPattern}`, `Added ignore rule: ${normalizedPattern}`)
            : tr(`Regel existiert bereits: ${normalizedPattern}`, `Rule already exists: ${normalizedPattern}`),
          isError: false,
        });
        if (onRepoChanged) onRepoChanged();
        await refresh();
      } catch (e: any) {
        setToast({ msg: e.message || t('generated.components.staging_area.usefileoperations.could_not_update_gitignore_074773f8'), isError: true });
      }
    },
    [setToast, tr, onRepoChanged, refresh, t],
  );

  const stageFile = useCallback((f: string) => git(['add', '--', f], tr(`${basename(f)} gestaged`, `Staged ${basename(f)}`)), [git, tr]);
  const unstageFile = useCallback((f: string) => git(['reset', 'HEAD', '--', f], tr(`${basename(f)} unstaged`, `Unstaged ${basename(f)}`)), [git, tr]);
  const stageAll = useCallback(() => git(['add', '.'], t('generated.components.staging_area.usefileoperations.staged_all_files_b29a5702')), [git, t]);
  const unstageAll = useCallback(() => git(['reset', 'HEAD'], t('generated.components.staging_area.usefileoperations.unstaged_all_files_444bd313')), [git, t]);

  const stageAllUntracked = useCallback(async () => {
    if (!gitClient.isAvailable() || !status || status.untracked.length === 0) return;
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setMutationStartedAt(Date.now());
    try {
      const result = await gitClient.stagePaths(status.untracked.map((entry) => entry.path));
      if (!result.success) throw new Error(result.error);
      const count = status.untracked.length;
      setToast({
        msg: tr(`${count} untracked Datei${count !== 1 ? 'en' : ''} gestaged`, `Staged ${count} untracked file${count !== 1 ? 's' : ''}`),
        isError: false,
      });
      await refresh();
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    } finally {
      mutationInFlightRef.current = false;
      setMutationStartedAt(null);
    }
  }, [status, setToast, refresh, tr]);

  const discardFile = useCallback(
    (f: string) => {
      setConfirmDialog({
        variant: 'danger',
        title: t('generated.components.staging_area.usefileoperations.discard_file_changes_ba9a3d21'),
        message: t('generated.components.staging_area.usefileoperations.all_unsaved_changes_in_this_file_will_be_discarded_8d5f1078'),
        contextItems: [
          { label: t('generated.components.commitdetails.file_9d811416'), value: f },
          {
            label: t('generated.components.staging_area.usefileoperations.scope_9817b017'),
            value: t('generated.components.staging_area.usefileoperations.unstaged_working_tree_4bf6f78b'),
          },
        ],
        irreversible: true,
        consequences: t('generated.components.staging_area.usefileoperations.discarded_lines_cannot_be_restored_from_git_d40dd8f1'),
        confirmLabel: t('generated.components.staging_area.conflictresolverpanel.discard_changes_b80ac3bd'),
        onConfirm: async () => {
          await git(['checkout', '--', f], tr(`${basename(f)} verworfen`, `Discarded ${basename(f)}`), true);
        },
      });
    },
    [setConfirmDialog, t, git, tr],
  );

  const discardAll = useCallback(() => {
    setConfirmDialog({
      variant: 'danger',
      title: t('generated.components.staging_area.usefileoperations.discard_all_unstaged_changes_aa3f4f05'),
      message: t('generated.components.staging_area.usefileoperations.all_local_unstaged_changes_will_be_reset_to_the_last_com_2a16eed6'),
      contextItems: [
        {
          label: t('generated.components.staging_area.usefileoperations.scope_7d90ed9d'),
          value: t('generated.components.staging_area.usefileoperations.entire_repository_3b268641'),
        },
        {
          label: t('generated.components.staging_area.usefileoperations.affects_80a8b1b0'),
          value: t('generated.components.staging_area.usefileoperations.only_unstaged_files_edd96f1c'),
        },
      ],
      irreversible: true,
      consequences: t('generated.components.staging_area.usefileoperations.unsaved_changes_will_be_permanently_lost_7fed012c'),
      confirmLabel: t('generated.components.staging_area.usefileoperations.discard_all_5a080ac9'),
      onConfirm: async () => {
        await git(['checkout', '--', '.'], t('generated.components.staging_area.usefileoperations.discarded_all_changes_f85f8117'), true);
      },
    });
  }, [setConfirmDialog, t, git]);

  const deleteUntracked = useCallback(
    (f: string) => {
      setConfirmDialog({
        variant: 'danger',
        title: t('generated.components.staging_area.usefileoperations.delete_untracked_file_bbf6e21c'),
        message: t('generated.components.staging_area.usefileoperations.the_file_is_not_tracked_and_will_be_removed_from_the_fil_59ed3043'),
        contextItems: [
          { label: t('generated.components.commitdetails.file_9d811416'), value: f },
          {
            label: t('generated.components.staging_area.usefileoperations.git_status_98e69c47'),
            value: t('generated.components.staging_area.stagingfilesections.untracked_d2518623'),
          },
        ],
        irreversible: true,
        consequences: t('generated.components.staging_area.usefileoperations.the_file_cannot_be_restored_without_backup_afterwards_cb997723'),
        confirmLabel: t('generated.components.staging_area.usefileoperations.delete_file_67f7198d'),
        onConfirm: async () => {
          await git(['clean', '-f', '--', f], tr(`${basename(f)} geloescht`, `Deleted ${basename(f)}`), true);
        },
      });
    },
    [setConfirmDialog, t, git, tr],
  );

  const stashFile = useCallback(
    (filePath: string, section: FileSection) => {
      setInputDialog({
        title: t('generated.components.staging_area.usefileoperations.stash_file_06bcc105'),
        message: t('generated.components.staging_area.usefileoperations.optionally_add_a_message_for_the_new_file_stash_08b0ff6d'),
        fields: [
          {
            id: 'message',
            label: t('generated.components.staging_area.usefileoperations.stash_message_optional_cfb6ab56'),
            placeholder: t('generated.components.staging_area.usefileoperations.e_g_wip_single_file_f4ef1437'),
          },
        ],
        contextItems: [
          {
            label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'),
            value: repoPath ? basename(repoPath) : t('generated.components.staging_area.usefileoperations.unknown_af8d7dc4'),
          },
          { label: t('generated.components.commitdetails.file_9d811416'), value: filePath },
          { label: t('generated.components.staging_area.usefileoperations.section_254cebe4'), value: section },
        ],
        irreversible: false,
        consequences: t('generated.components.staging_area.usefileoperations.only_this_file_is_moved_into_a_new_stash_untracked_files_fb0d5119'),
        confirmLabel: t('generated.components.staging_area.usefileoperations.create_stash_ebe60340'),
        onSubmit: async (values) => {
          const msg = (values.message || '').trim();
          const args = ['stash', 'push', ...(section === 'untracked' ? ['--include-untracked'] : []), ...(msg ? ['-m', msg] : []), '--', filePath];
          const ok = await git(args, tr(`${basename(filePath)} gestasht`, `Stashed ${basename(filePath)}`), true);
          if (ok) onStashChanged?.();
        },
      });
    },
    [setInputDialog, t, repoPath, git, tr, onStashChanged],
  );

  const stashAll = useCallback(() => {
    const trackedCount = (status?.staged.length || 0) + (status?.unstaged.length || 0);
    const untrackedCount = status?.untracked.length || 0;
    setInputDialog({
      title: t('generated.components.staging_area.usefileoperations.stash_all_changes_48324425'),
      message: t('generated.components.staging_area.usefileoperations.optionally_add_a_message_for_the_new_stash_with_all_loca_3a612534'),
      fields: [
        {
          id: 'message',
          label: t('generated.components.staging_area.usefileoperations.stash_message_optional_cfb6ab56'),
          placeholder: t('generated.components.staging_area.usefileoperations.e_g_wip_larger_change_b8c378c4'),
        },
      ],
      contextItems: [
        {
          label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'),
          value: repoPath ? basename(repoPath) : t('generated.components.staging_area.usefileoperations.unknown_af8d7dc4'),
        },
        { label: t('generated.components.staging_area.usefileoperations.tracked_8e161c2e'), value: String(trackedCount) },
        { label: t('generated.components.staging_area.stagingfilesections.untracked_d2518623'), value: String(untrackedCount) },
      ],
      irreversible: false,
      consequences: t('generated.components.staging_area.usefileoperations.staged_unstaged_and_untracked_files_are_moved_into_a_new_01585ccc'),
      confirmLabel: t('generated.components.staging_area.usefileoperations.stash_all_602ded33'),
      onSubmit: async (values) => {
        const msg = (values.message || '').trim();
        const args = ['stash', 'push', '--include-untracked', ...(msg ? ['-m', msg] : [])];
        const ok = await git(args, t('generated.components.staging_area.usefileoperations.stashed_all_changes_c28f9b06'), true);
        if (ok) onStashChanged?.();
      },
    });
  }, [status?.staged.length, status?.unstaged.length, status?.untracked.length, setInputDialog, t, repoPath, git, onStashChanged]);

  const showDiff = useCallback(
    (filePath: string, staged: boolean) => {
      const request: DiffRequest = {
        source: staged ? 'staged' : 'unstaged',
        path: filePath,
        title: staged
          ? t('generated.components.staging_area.usefileoperations.staged_diff_6db84f1e')
          : t('generated.components.staging_area.usefileoperations.unstaged_diff_a19af98a'),
      };
      onOpenDiff?.(request);
    },
    [onOpenDiff, t],
  );

  return {
    status,
    refresh,
    git,
    stagedStats,
    unstagedStats,
    searchQuery,
    setSearchQuery,
    contextMenu,
    setContextMenu,
    openFileContextMenu,
    addIgnoreRule,
    stageFile,
    unstageFile,
    stageAll,
    stageAllUntracked,
    unstageAll,
    discardFile,
    discardAll,
    deleteUntracked,
    stashFile,
    stashAll,
    showDiff,
    isMutating: mutationStartedAt !== null,
    mutationElapsedMs,
  };
};
