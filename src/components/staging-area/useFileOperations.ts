import { useCallback, useEffect, useState } from 'react';
import { FileEntry, parseGitStatusDetailed } from '../../utils/gitParsing';
import type { DiffRequest } from '../../types/diff';
import type { ToastMessage } from '../../types/git';
import { useI18n } from '../../i18n';
import {
  EMPTY_DIFF_STATS,
  basename,
  parseConflictEntries,
  parseNumstatStats,
} from './utils';
import type {
  ConfirmDialogState,
  DiffStats,
  FileSection,
  GitStatusWithConflicts,
  InputDialogState,
  StagingContextMenuState,
} from './types';

type Params = {
  repoPath: string | null;
  setToast: (msg: ToastMessage | null) => void;
  setConfirmDialog: (d: ConfirmDialogState | null) => void;
  setInputDialog: (d: InputDialogState | null) => void;
  onRepoChanged?: () => void;
  onOpenDiff?: (request: DiffRequest) => void;
};

export const useFileOperations = ({
  repoPath,
  setToast,
  setConfirmDialog,
  setInputDialog,
  onRepoChanged,
  onOpenDiff,
}: Params) => {
  const { tr } = useI18n();
  const [status, setStatus] = useState<GitStatusWithConflicts | null>(null);
  const [stagedStats, setStagedStats] = useState<DiffStats>(EMPTY_DIFF_STATS);
  const [unstagedStats, setUnstagedStats] = useState<DiffStats>(EMPTY_DIFF_STATS);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'staged' | 'unstaged' | 'untracked' | 'conflicts'>('all');
  const [contextMenu, setContextMenu] = useState<StagingContextMenuState | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    try {
      const [statusResult, stagedResult, unstagedResult] = await Promise.all([
        window.electronAPI.runGitCommand('statusPorcelain'),
        window.electronAPI.runGitCommand('diff', '--numstat', '--cached'),
        window.electronAPI.runGitCommand('diff', '--numstat'),
      ]);

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
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) {
      setStatus(null);
      setStagedStats(EMPTY_DIFF_STATS);
      setUnstagedStats(EMPTY_DIFF_STATS);
      return;
    }
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
  }, [repoPath, refresh]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setContextMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const git = useCallback(async (args: string[], msg: string, notify = false) => {
    if (!window.electronAPI) return;
    try {
      const r = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (r.success) {
        setToast({ msg, isError: false });
        if (notify && onRepoChanged) onRepoChanged();
        await refresh();
      } else {
        setToast({ msg: r.error || tr('Fehler', 'Error'), isError: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    }
  }, [setToast, onRepoChanged, refresh, tr]);

  const openFileContextMenu = useCallback((event: React.MouseEvent, entry: FileEntry, section: FileSection) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, entry, section });
  }, []);

  const addIgnoreRule = useCallback(async (entry: FileEntry, section: FileSection, pattern: string) => {
    if (!window.electronAPI) return;
    const normalizedPattern = pattern.trim();
    if (!normalizedPattern) return;
    try {
      const result = await window.electronAPI.addIgnoreRule(normalizedPattern);
      if (!result.success) {
        setToast({ msg: result.error || tr('Konnte .gitignore nicht aktualisieren.', 'Could not update .gitignore.'), isError: true });
        return;
      }
      if (section === 'staged' && entry.x === 'A') {
        await window.electronAPI.runGitCommand('reset', 'HEAD', '--', entry.path);
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
      setToast({ msg: e.message || tr('Konnte .gitignore nicht aktualisieren.', 'Could not update .gitignore.'), isError: true });
    }
  }, [setToast, onRepoChanged, refresh, tr]);

  const stageFile = useCallback((f: string) => git(['add', '--', f], tr(`${basename(f)} gestaged`, `Staged ${basename(f)}`)), [git, tr]);
  const unstageFile = useCallback((f: string) => git(['reset', 'HEAD', '--', f], tr(`${basename(f)} unstaged`, `Unstaged ${basename(f)}`)), [git, tr]);
  const stageAll = useCallback(() => git(['add', '.'], tr('Alle Dateien gestaged', 'Staged all files')), [git, tr]);
  const unstageAll = useCallback(() => git(['reset', 'HEAD'], tr('Alle Dateien unstaged', 'Unstaged all files')), [git, tr]);

  const stageAllUntracked = useCallback(async () => {
    if (!window.electronAPI || !status || status.untracked.length === 0) return;
    try {
      for (const entry of status.untracked) {
        const r = await window.electronAPI.runGitCommand('add', '--', entry.path);
        if (!r.success) throw new Error(r.error || tr(`Fehler beim Stagen von ${entry.path}`, `Error staging ${entry.path}`));
      }
      const count = status.untracked.length;
      setToast({
        msg: tr(
          `${count} untracked Datei${count !== 1 ? 'en' : ''} gestaged`,
          `Staged ${count} untracked file${count !== 1 ? 's' : ''}`,
        ),
        isError: false,
      });
      await refresh();
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    }
  }, [status, setToast, refresh, tr]);

  const discardFile = useCallback((f: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: tr('Datei-Aenderungen verwerfen?', 'Discard file changes?'),
      message: tr('Alle nicht gespeicherten Aenderungen dieser Datei werden verworfen.', 'All unsaved changes in this file will be discarded.'),
      contextItems: [{ label: tr('Datei', 'File'), value: f }, { label: tr('Bereich', 'Scope'), value: tr('Unstaged Working Tree', 'Unstaged working tree') }],
      irreversible: true,
      consequences: tr('Die verworfenen Zeilen koennen nicht aus Git wiederhergestellt werden.', 'Discarded lines cannot be restored from Git.'),
      confirmLabel: tr('Aenderungen verwerfen', 'Discard changes'),
      onConfirm: () => git(['checkout', '--', f], tr(`${basename(f)} verworfen`, `Discarded ${basename(f)}`), true),
    });
  }, [setConfirmDialog, git, tr]);

  const discardAll = useCallback(() => {
    setConfirmDialog({
      variant: 'danger',
      title: tr('Alle unstaged Aenderungen verwerfen?', 'Discard all unstaged changes?'),
      message: tr('Alle lokalen unstaged Aenderungen werden auf den letzten Commit zurueckgesetzt.', 'All local unstaged changes will be reset to the last commit.'),
      contextItems: [{ label: tr('Umfang', 'Scope'), value: tr('Gesamtes Repository', 'Entire repository') }, { label: tr('Betrifft', 'Affects'), value: tr('Nur unstaged Dateien', 'Only unstaged files') }],
      irreversible: true,
      consequences: tr('Nicht gespeicherte Aenderungen gehen unwiderruflich verloren.', 'Unsaved changes will be permanently lost.'),
      confirmLabel: tr('Alles verwerfen', 'Discard all'),
      onConfirm: () => git(['checkout', '--', '.'], tr('Alle Aenderungen verworfen', 'Discarded all changes'), true),
    });
  }, [setConfirmDialog, git, tr]);

  const deleteUntracked = useCallback((f: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: tr('Untracked Datei loeschen?', 'Delete untracked file?'),
      message: tr('Die Datei ist nicht versioniert und wird direkt vom Dateisystem entfernt.', 'The file is not tracked and will be removed from the filesystem.'),
      contextItems: [{ label: tr('Datei', 'File'), value: f }, { label: tr('Git-Status', 'Git status'), value: tr('Untracked', 'Untracked') }],
      irreversible: true,
      consequences: tr('Die Datei ist danach ohne Backup nicht wiederherstellbar.', 'The file cannot be restored without backup afterwards.'),
      confirmLabel: tr('Datei loeschen', 'Delete file'),
      onConfirm: () => git(['clean', '-f', '--', f], tr(`${basename(f)} geloescht`, `Deleted ${basename(f)}`), true),
    });
  }, [setConfirmDialog, git, tr]);

  const stashChanges = useCallback(() => {
    setInputDialog({
      title: tr('Aenderungen stashen', 'Stash changes'),
      message: tr('Optional eine Nachricht fuer den neuen Stash hinterlegen.', 'Optionally add a message for the new stash.'),
      fields: [{ id: 'message', label: tr('Stash-Nachricht (optional)', 'Stash message (optional)'), placeholder: tr('z.B. WIP: Feature XYZ', 'e.g. WIP: Feature XYZ') }],
      contextItems: [{ label: tr('Repository', 'Repository'), value: repoPath ? basename(repoPath) : tr('(unbekannt)', '(unknown)') }],
      irreversible: false,
      consequences: tr('Aenderungen werden temporaer aus dem Working Tree entfernt und im Stash gespeichert.', 'Changes are temporarily removed from the working tree and saved in the stash.'),
      confirmLabel: tr('Stash erstellen', 'Create stash'),
      onSubmit: async (values) => {
        const msg = (values.message || '').trim();
        const args = msg ? ['stash', 'push', '-m', msg] : ['stash'];
        await git(args, tr('Aenderungen gestasht', 'Stashed changes'), true);
      },
    });
  }, [setInputDialog, repoPath, git, tr]);

  const stashPop = useCallback(() => git(['stash', 'pop'], tr('Stash angewendet', 'Applied stash'), true), [git, tr]);

  const showDiff = useCallback((filePath: string, staged: boolean) => {
    const request: DiffRequest = {
      source: staged ? 'staged' : 'unstaged',
      path: filePath,
      title: staged ? tr('Staged Diff', 'Staged diff') : tr('Unstaged Diff', 'Unstaged diff'),
    };
    onOpenDiff?.(request);
  }, [onOpenDiff, tr]);

  return {
    status,
    refresh,
    git,
    stagedStats,
    unstagedStats,
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
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
    stashChanges,
    stashPop,
    showDiff,
  };
};
