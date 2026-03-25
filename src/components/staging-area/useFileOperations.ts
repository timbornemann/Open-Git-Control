import { useCallback, useEffect, useState } from 'react';
import { FileEntry, parseGitStatusDetailed } from '../../utils/gitParsing';
import type { DiffRequest } from '../../types/diff';
import type { ToastMessage } from '../../types/git';
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
    refresh();
    const iv = setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', refresh);
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
        setToast({ msg: r.error || 'Fehler', isError: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    }
  }, [setToast, onRepoChanged, refresh]);

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
        setToast({ msg: result.error || 'Konnte .gitignore nicht aktualisieren.', isError: true });
        return;
      }
      if (section === 'staged' && entry.x === 'A') {
        await window.electronAPI.runGitCommand('reset', 'HEAD', '--', entry.path);
      }
      setToast({ msg: result.added ? `Ignore-Regel hinzugefuegt: ${normalizedPattern}` : `Regel existiert bereits: ${normalizedPattern}`, isError: false });
      if (onRepoChanged) onRepoChanged();
      await refresh();
    } catch (e: any) {
      setToast({ msg: e.message || 'Konnte .gitignore nicht aktualisieren.', isError: true });
    }
  }, [setToast, onRepoChanged, refresh]);

  const stageFile = useCallback((f: string) => git(['add', '--', f], `${basename(f)} gestaged`), [git]);
  const unstageFile = useCallback((f: string) => git(['reset', 'HEAD', '--', f], `${basename(f)} unstaged`), [git]);
  const stageAll = useCallback(() => git(['add', '.'], 'Alle Dateien gestaged'), [git]);
  const unstageAll = useCallback(() => git(['reset', 'HEAD'], 'Alle Dateien unstaged'), [git]);

  const stageAllUntracked = useCallback(async () => {
    if (!window.electronAPI || !status || status.untracked.length === 0) return;
    try {
      for (const entry of status.untracked) {
        const r = await window.electronAPI.runGitCommand('add', '--', entry.path);
        if (!r.success) throw new Error(r.error || `Fehler beim Stagen von ${entry.path}`);
      }
      const count = status.untracked.length;
      setToast({ msg: `${count} untracked Datei${count !== 1 ? 'en' : ''} gestaged`, isError: false });
      await refresh();
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    }
  }, [status, setToast, refresh]);

  const discardFile = useCallback((f: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Datei-Aenderungen verwerfen?',
      message: 'Alle nicht gespeicherten Aenderungen dieser Datei werden verworfen.',
      contextItems: [{ label: 'Datei', value: f }, { label: 'Bereich', value: 'Unstaged Working Tree' }],
      irreversible: true,
      consequences: 'Die verworfenen Zeilen koennen nicht aus Git wiederhergestellt werden.',
      confirmLabel: 'Aenderungen verwerfen',
      onConfirm: () => git(['checkout', '--', f], `${basename(f)} verworfen`, true),
    });
  }, [setConfirmDialog, git]);

  const discardAll = useCallback(() => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Alle unstaged Aenderungen verwerfen?',
      message: 'Alle lokalen unstaged Aenderungen werden auf den letzten Commit zurueckgesetzt.',
      contextItems: [{ label: 'Umfang', value: 'Gesamtes Repository' }, { label: 'Betrifft', value: 'Nur unstaged Dateien' }],
      irreversible: true,
      consequences: 'Nicht gespeicherte Aenderungen gehen unwiderruflich verloren.',
      confirmLabel: 'Alles verwerfen',
      onConfirm: () => git(['checkout', '--', '.'], 'Alle Aenderungen verworfen', true),
    });
  }, [setConfirmDialog, git]);

  const deleteUntracked = useCallback((f: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Untracked Datei loeschen?',
      message: 'Die Datei ist nicht versioniert und wird direkt vom Dateisystem entfernt.',
      contextItems: [{ label: 'Datei', value: f }, { label: 'Git-Status', value: 'Untracked' }],
      irreversible: true,
      consequences: 'Die Datei ist danach ohne Backup nicht wiederherstellbar.',
      confirmLabel: 'Datei loeschen',
      onConfirm: () => git(['clean', '-f', '--', f], `${basename(f)} geloescht`, true),
    });
  }, [setConfirmDialog, git]);

  const stashChanges = useCallback(() => {
    setInputDialog({
      title: 'Aenderungen stashen',
      message: 'Optional eine Nachricht fuer den neuen Stash hinterlegen.',
      fields: [{ id: 'message', label: 'Stash-Nachricht (optional)', placeholder: 'z.B. WIP: Feature XYZ' }],
      contextItems: [{ label: 'Repository', value: repoPath ? basename(repoPath) : '(unbekannt)' }],
      irreversible: false,
      consequences: 'Aenderungen werden temporaer aus dem Working Tree entfernt und im Stash gespeichert.',
      confirmLabel: 'Stash erstellen',
      onSubmit: async (values) => {
        const msg = (values.message || '').trim();
        const args = msg ? ['stash', 'push', '-m', msg] : ['stash'];
        await git(args, 'Aenderungen gestasht', true);
      },
    });
  }, [setInputDialog, repoPath, git]);

  const stashPop = useCallback(() => git(['stash', 'pop'], 'Stash angewendet', true), [git]);

  const showDiff = useCallback((filePath: string, staged: boolean) => {
    const request: DiffRequest = {
      source: staged ? 'staged' : 'unstaged',
      path: filePath,
      title: staged ? 'Staged Diff' : 'Unstaged Diff',
    };
    onOpenDiff?.(request);
  }, [onOpenDiff]);

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
