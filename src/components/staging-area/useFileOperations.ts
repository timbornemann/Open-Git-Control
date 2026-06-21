import { useCallback, useEffect, useRef, useState } from 'react';
import { FileEntry, parseGitStatusDetailed, type GitStatusDetailed } from '../../utils/gitParsing';
import type { WorkingTreeStatsDto } from '../../global';
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
  const { tr } = useI18n();
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
    if (!repoPath || !window.electronAPI) return;
    if (externalRefresh) {
      await externalRefresh();
      return;
    }
    try {
      const [statusResult, stagedResult, unstagedResult] = await Promise.all([
        window.electronAPI.runGitCommand('statusPorcelain'),
        window.electronAPI.runGitCommand('diff', '--numstat', '--cached'),
        window.electronAPI.runGitCommand('diff', '--numstat'),
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
    if (!window.electronAPI) return false;
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    setMutationStartedAt(Date.now());
    try {
      const r = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (r.success) {
        setToast({ msg, isError: false });
        if (notify && onRepoChanged) onRepoChanged();
        await refresh();
        return true;
      } else {
        setToast({ msg: r.error || tr('Fehler', 'Error'), isError: true });
        return false;
      }
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
      return false;
    } finally {
      mutationInFlightRef.current = false;
      setMutationStartedAt(null);
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
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setMutationStartedAt(Date.now());
    try {
      const result = await window.electronAPI.stagePaths(status.untracked.map((entry) => entry.path));
      if (!result.success) throw new Error(result.error);
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
    } finally {
      mutationInFlightRef.current = false;
      setMutationStartedAt(null);
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

  const stashFile = useCallback((filePath: string, section: FileSection) => {
    setInputDialog({
      title: tr('Datei stashen', 'Stash file'),
      message: tr('Optional eine Nachricht fuer den neuen Datei-Stash hinterlegen.', 'Optionally add a message for the new file stash.'),
      fields: [{ id: 'message', label: tr('Stash-Nachricht (optional)', 'Stash message (optional)'), placeholder: tr('z.B. WIP: einzelne Datei', 'e.g. WIP: single file') }],
      contextItems: [
        { label: tr('Repository', 'Repository'), value: repoPath ? basename(repoPath) : tr('(unbekannt)', '(unknown)') },
        { label: tr('Datei', 'File'), value: filePath },
        { label: tr('Bereich', 'Section'), value: section },
      ],
      irreversible: false,
      consequences: tr('Nur diese Datei wird in einen neuen Stash verschoben. Untracked Dateien werden bei Bedarf eingeschlossen.', 'Only this file is moved into a new stash. Untracked files are included when needed.'),
      confirmLabel: tr('Stash erstellen', 'Create stash'),
      onSubmit: async (values) => {
        const msg = (values.message || '').trim();
        const args = [
          'stash',
          'push',
          ...(section === 'untracked' ? ['--include-untracked'] : []),
          ...(msg ? ['-m', msg] : []),
          '--',
          filePath,
        ];
        const ok = await git(args, tr(`${basename(filePath)} gestasht`, `Stashed ${basename(filePath)}`), true);
        if (ok) onStashChanged?.();
      },
    });
  }, [setInputDialog, repoPath, git, onStashChanged, tr]);

  const stashAll = useCallback(() => {
    const trackedCount = (status?.staged.length || 0) + (status?.unstaged.length || 0);
    const untrackedCount = status?.untracked.length || 0;
    setInputDialog({
      title: tr('Alle Aenderungen stashen', 'Stash all changes'),
      message: tr('Optional eine Nachricht fuer den neuen Stash mit allen lokalen Aenderungen hinterlegen.', 'Optionally add a message for the new stash with all local changes.'),
      fields: [{ id: 'message', label: tr('Stash-Nachricht (optional)', 'Stash message (optional)'), placeholder: tr('z.B. WIP: groesserer Umbau', 'e.g. WIP: larger change') }],
      contextItems: [
        { label: tr('Repository', 'Repository'), value: repoPath ? basename(repoPath) : tr('(unbekannt)', '(unknown)') },
        { label: tr('Tracked', 'Tracked'), value: String(trackedCount) },
        { label: tr('Untracked', 'Untracked'), value: String(untrackedCount) },
      ],
      irreversible: false,
      consequences: tr('Staged, unstaged und untracked Dateien werden in einen neuen Stash verschoben.', 'Staged, unstaged and untracked files are moved into a new stash.'),
      confirmLabel: tr('Alles stashen', 'Stash all'),
      onSubmit: async (values) => {
        const msg = (values.message || '').trim();
        const args = [
          'stash',
          'push',
          '--include-untracked',
          ...(msg ? ['-m', msg] : []),
        ];
        const ok = await git(args, tr('Alle Aenderungen gestasht', 'Stashed all changes'), true);
        if (ok) onStashChanged?.();
      },
    });
  }, [setInputDialog, repoPath, status, git, onStashChanged, tr]);

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
