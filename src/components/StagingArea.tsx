import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { GitStatusDetailed, FileEntry, parseGitStatusDetailed } from '../utils/gitParsing';
import { useToastQueue } from '../hooks/useToastQueue';
import { Confirm, DialogContextItem } from './Confirm';
import { DangerConfirm } from './DangerConfirm';
import { Input, InputDialogField } from './Input';
import { DiffRequest } from '../types/diff';
import { AppSettingsDto } from '../global';

interface StagingAreaProps {
  repoPath: string | null;
  onRepoChanged?: () => void;
  onOpenDiff?: (request: DiffRequest) => void;
  onSelectFileInspect?: (filePath: string, source: 'staged' | 'unstaged') => void;
  onOpenConflictResolver?: (filePath: string) => void;
  viewMode?: 'default' | 'conflictOnly';
  initialConflictPath?: string | null;
  settings: AppSettingsDto;
}

type ConfirmDialogState = {
  variant: 'confirm' | 'danger';
  title: string;
  message: string;
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
};

type InputDialogState = {
  title: string;
  message: string;
  fields: InputDialogField[];
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
};

type ConflictEntry = FileEntry & { code: string };
type GitStatusWithConflicts = GitStatusDetailed & { conflicts: ConflictEntry[] };
type DiffStats = { files: number; additions: number; deletions: number };
type FileSection = 'staged' | 'unstaged' | 'untracked';
type ConflictResolutionChoice = 'ours' | 'theirs' | 'both';
type ConflictEditorState = {
  filePath: string;
  originalContent: string;
  content: string;
  isSaving: boolean;
};
type ConflictBlock = {
  start: number;
  end: number;
  marker: string;
  oursLabel: string;
  theirsLabel: string;
  ours: string;
  theirs: string;
  startLine: number;
  endLine: number;
};

type StagingContextMenuState = {
  x: number;
  y: number;
  entry: FileEntry;
  section: FileSection;
};

const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  A: { label: 'Added', color: 'var(--status-success)' },
  M: { label: 'Modified', color: 'var(--status-warning)' },
  D: { label: 'Deleted', color: 'var(--status-danger)' },
  R: { label: 'Renamed', color: 'var(--status-merged)' },
  C: { label: 'Copied', color: 'var(--status-info)' },
  '?': { label: 'Untracked', color: 'var(--status-untracked)' },
};

const CONFLICT_LABELS: Record<string, string> = {
  UU: 'Both modified',
  AA: 'Both added',
  DD: 'Both deleted',
  AU: 'Added by us',
  UA: 'Added by them',
  DU: 'Deleted by us',
  UD: 'Deleted by them',
};

const getStatusInfo = (code: string) => STATUS_LABELS[code] || { label: code, color: 'var(--status-untracked)' };
const basename = (p: string) => p.split(/[\\/]/).pop() || p;

const parseConflictEntries = (statusOutput: string): ConflictEntry[] => {
  if (!statusOutput.trim()) return [];

  const conflicts: ConflictEntry[] = [];
  for (const line of statusOutput.split('\n')) {
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    const code = `${x}${y}`;
    if (!CONFLICT_CODES.has(code)) continue;
    conflicts.push({ path: line.substring(3).trim(), x, y, code });
  }

  return conflicts;
};

const EMPTY_DIFF_STATS: DiffStats = { files: 0, additions: 0, deletions: 0 };

const parseNumstatStats = (numstatOutput: string): DiffStats => {
  const stats: DiffStats = { ...EMPTY_DIFF_STATS };
  if (!numstatOutput.trim()) return stats;

  for (const line of numstatOutput.split('\n')) {
    const match = line.trim().match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!match) continue;

    stats.files += 1;
    if (match[1] !== '-') {
      stats.additions += Number(match[1]);
    }
    if (match[2] !== '-') {
      stats.deletions += Number(match[2]);
    }
  }

  return stats;
};

const formatDiffStats = (stats: DiffStats): string => `${stats.files}f +${stats.additions} -${stats.deletions}`;
const toGitPath = (p: string) => p.replace(/\\/g, '/');
const dirname = (p: string) => {
  const normalized = toGitPath(p);
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx) : '';
};
const extensionPattern = (p: string) => {
  const name = basename(p);
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return null;
  return `*${name.slice(idx)}`;
};

const CONFLICT_BLOCK_PATTERN_SOURCE = '<<<<<<<([^\\r\\n]*)\\r?\\n([\\s\\S]*?)\\r?\\n=======\\r?\\n([\\s\\S]*?)\\r?\\n>>>>>>>([^\\r\\n]*)\\r?\\n?';

const detectLineEnding = (value: string): string => (value.includes('\r\n') ? '\r\n' : '\n');

const lineNumberAt = (content: string, index: number): number => {
  let line = 1;
  const max = Math.min(index, content.length);
  for (let i = 0; i < max; i += 1) {
    if (content[i] === '\n') line += 1;
  }
  return line;
};

const parseConflictBlocks = (content: string): ConflictBlock[] => {
  const blocks: ConflictBlock[] = [];
  const pattern = new RegExp(CONFLICT_BLOCK_PATTERN_SOURCE, 'g');
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(content)) !== null) {
    const marker = match[0] || '';
    const start = match.index;
    const end = start + marker.length;
    const startLine = lineNumberAt(content, start);
    const lineCount = marker === '' ? 0 : marker.split(/\r?\n/).length;
    const endLine = Math.max(startLine, startLine + lineCount - 1);

    blocks.push({
      start,
      end,
      marker,
      oursLabel: (match[1] || '').trim(),
      theirsLabel: (match[4] || '').trim(),
      ours: match[2] || '',
      theirs: match[3] || '',
      startLine,
      endLine,
    });
  }

  return blocks;
};

const joinBothSides = (ours: string, theirs: string, lineEnding: string): string => {
  if (!ours) return theirs;
  if (!theirs) return ours;
  const needsSeparator = !/\r?\n$/.test(ours);
  return `${ours}${needsSeparator ? lineEnding : ''}${theirs}`;
};

const buildConflictResolution = (block: ConflictBlock, choice: ConflictResolutionChoice, lineEnding: string): string => {
  if (choice === 'ours') return block.ours;
  if (choice === 'theirs') return block.theirs;
  return joinBothSides(block.ours, block.theirs, lineEnding);
};

const replaceConflictBlock = (content: string, block: ConflictBlock, replacement: string): string => (
  `${content.slice(0, block.start)}${replacement}${content.slice(block.end)}`
);

export const StagingArea: React.FC<StagingAreaProps> = ({
  repoPath,
  onRepoChanged,
  onOpenDiff,
  onSelectFileInspect,
  onOpenConflictResolver,
  viewMode = 'default',
  initialConflictPath = null,
  settings,
}) => {
  const [status, setStatus] = useState<GitStatusWithConflicts | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);
  const { toast, setToast } = useToastQueue(3000);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'staged' | 'unstaged' | 'untracked' | 'conflicts'>('all');
  const [amendCommit, setAmendCommit] = useState(false);
  const [signoffCommit, setSignoffCommit] = useState(false);
  const [commitDescription, setCommitDescription] = useState('');
  const [stagedStats, setStagedStats] = useState<DiffStats>(EMPTY_DIFF_STATS);
  const [unstagedStats, setUnstagedStats] = useState<DiffStats>(EMPTY_DIFF_STATS);
  const [contextMenu, setContextMenu] = useState<StagingContextMenuState | null>(null);
  const [isAiCommitting, setIsAiCommitting] = useState(false);
  const [isAiJobRunning, setIsAiJobRunning] = useState(false);
  const [aiProgressMessage, setAiProgressMessage] = useState<string | null>(null);
  const [aiPhase, setAiPhase] = useState<string>('idle');
  const [aiMode, setAiMode] = useState<string>('normal');
  const [aiLastCommit, setAiLastCommit] = useState<string | null>(null);
  const [aiRemainingFiles, setAiRemainingFiles] = useState<number | null>(null);
  const [conflictEditor, setConflictEditor] = useState<ConflictEditorState | null>(null);
  const [isConflictEditorLoading, setIsConflictEditorLoading] = useState(false);
  const [selectedConflictBlockIndex, setSelectedConflictBlockIndex] = useState(0);
  const autoOpenedConflictPathRef = useRef<string | null>(null);
  const aiConfig = {
    enabled: Boolean(settings.aiAutoCommitEnabled),
    provider: settings.aiProvider,
    model: settings.aiProvider === 'gemini' ? (settings.geminiModel || '') : (settings.ollamaModel || ''),
  };
  const isConflictOnly = viewMode === 'conflictOnly';

  const refresh = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    try {
      const statusRequest = window.electronAPI.runGitCommand('statusPorcelain');
      const stagedDiffRequest = window.electronAPI.runGitCommand('diff', '--numstat', '--cached');
      const unstagedDiffRequest = window.electronAPI.runGitCommand('diff', '--numstat');

      const [statusResult, stagedResult, unstagedResult] = await Promise.all([
        statusRequest,
        stagedDiffRequest,
        unstagedDiffRequest,
      ]);

      if (statusResult.success) {
        const rawStatus = statusResult.data || '';
        const parsed = parseGitStatusDetailed(rawStatus);
        const conflicts = parseConflictEntries(rawStatus);
        const conflictPathSet = new Set(conflicts.map(c => c.path));

        setStatus({
          ...parsed,
          conflicts,
          staged: parsed.staged.filter(f => !conflictPathSet.has(f.path)),
          unstaged: parsed.unstaged.filter(f => !conflictPathSet.has(f.path)),
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
    setSignoffCommit(Boolean(settings.commitSignoffByDefault));
  }, [settings.commitSignoffByDefault]);

  useEffect(() => {
    if (settings.commitTemplate && !commitMsg.trim()) {
      setCommitMsg(settings.commitTemplate);
    }
  }, [settings.commitTemplate, commitMsg]);

  const git = async (args: string[], msg: string, notify = false) => {
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
  };

  const closeConfirmDialog = useCallback(() => setConfirmDialog(null), []);
  const executeConfirmDialog = useCallback(async () => {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    await action();
  }, [confirmDialog]);

  const closeInputDialog = useCallback(() => setInputDialog(null), []);
  const executeInputDialog = useCallback(async (values: Record<string, string>) => {
    if (!inputDialog) return;
    const action = inputDialog.onSubmit;
    setInputDialog(null);
    await action(values);
  }, [inputDialog]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onJobEvent((event) => {
      if (event.operation !== 'git:aiAutoCommit') return;

      const details = event.details || {};
      const phase = typeof details.phase === 'string' ? details.phase : null;
      const mode = typeof details.mode === 'string' ? details.mode : null;
      const lastCommit = typeof details.lastCommit === 'string' ? details.lastCommit : null;
      const remaining = typeof details.remainingFiles === 'number' ? details.remainingFiles : null;

      if (phase) setAiPhase(phase);
      if (mode) setAiMode(mode);
      if (lastCommit) setAiLastCommit(lastCommit);
      if (remaining !== null) setAiRemainingFiles(remaining);

      if (event.status === 'start' || event.status === 'progress') {
        setIsAiJobRunning(true);
        setAiProgressMessage(event.message || 'KI arbeitet...');
        return;
      }

      if (event.status === 'done') {
        setIsAiJobRunning(false);
        setAiProgressMessage(event.message || 'KI Auto-Commit abgeschlossen.');
        return;
      }

      if (event.status === 'failed') {
        setIsAiJobRunning(false);
        setAiProgressMessage(event.message || 'KI Auto-Commit fehlgeschlagen.');
        return;
      }

      if (event.status === 'cancelled') {
        setIsAiJobRunning(false);
        setAiProgressMessage(event.message || 'KI Auto-Commit abgebrochen.');
      }
    });

    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
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

  const openFileContextMenu = (event: React.MouseEvent, entry: FileEntry, section: FileSection) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, entry, section });
  };

  const addIgnoreRule = async (entry: FileEntry, section: FileSection, pattern: string) => {
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
  };
  const stageFile = (f: string) => git(['add', '--', f], `${basename(f)} gestaged`);
  const unstageFile = (f: string) => git(['reset', 'HEAD', '--', f], `${basename(f)} unstaged`);
  const stageAll = () => git(['add', '.'], 'Alle Dateien gestaged');
  const stageAllUntracked = async () => {
    if (!window.electronAPI || !status || status.untracked.length === 0) return;

    try {
      for (const entry of status.untracked) {
        const r = await window.electronAPI.runGitCommand('add', '--', entry.path);
        if (!r.success) {
          throw new Error(r.error || `Fehler beim Stagen von ${entry.path}`);
        }
      }

      const count = status.untracked.length;
      setToast({ msg: `${count} untracked Datei${count !== 1 ? 'en' : ''} gestaged`, isError: false });
      await refresh();
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    }
  };
  const unstageAll = () => git(['reset', 'HEAD'], 'Alle Dateien unstaged');

  const discardFile = (f: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Datei-Aenderungen verwerfen?',
      message: 'Alle nicht gespeicherten Aenderungen dieser Datei werden verworfen.',
      contextItems: [
        { label: 'Datei', value: f },
        { label: 'Bereich', value: 'Unstaged Working Tree' },
      ],
      irreversible: true,
      consequences: 'Die verworfenen Zeilen koennen nicht aus Git wiederhergestellt werden.',
      confirmLabel: 'Aenderungen verwerfen',
      onConfirm: () => git(['checkout', '--', f], `${basename(f)} verworfen`, true),
    });
  };

  const discardAll = () => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Alle unstaged Aenderungen verwerfen?',
      message: 'Alle lokalen unstaged Aenderungen werden auf den letzten Commit zurueckgesetzt.',
      contextItems: [
        { label: 'Umfang', value: 'Gesamtes Repository' },
        { label: 'Betrifft', value: 'Nur unstaged Dateien' },
      ],
      irreversible: true,
      consequences: 'Nicht gespeicherte Aenderungen gehen unwiderruflich verloren.',
      confirmLabel: 'Alles verwerfen',
      onConfirm: () => git(['checkout', '--', '.'], 'Alle Aenderungen verworfen', true),
    });
  };

  const deleteUntracked = (f: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Untracked Datei loeschen?',
      message: 'Die Datei ist nicht versioniert und wird direkt vom Dateisystem entfernt.',
      contextItems: [
        { label: 'Datei', value: f },
        { label: 'Git-Status', value: 'Untracked' },
      ],
      irreversible: true,
      consequences: 'Die Datei ist danach ohne Backup nicht wiederherstellbar.',
      confirmLabel: 'Datei loeschen',
      onConfirm: () => git(['clean', '-f', '--', f], `${basename(f)} geloescht`, true),
    });
  };

  const stashChanges = () => {
    setInputDialog({
      title: 'Aenderungen stashen',
      message: 'Optional eine Nachricht fuer den neuen Stash hinterlegen.',
      fields: [
        {
          id: 'message',
          label: 'Stash-Nachricht (optional)',
          placeholder: 'z.B. WIP: Feature XYZ',
        },
      ],
      contextItems: [
        { label: 'Repository', value: repoPath ? basename(repoPath) : '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Aenderungen werden temporaer aus dem Working Tree entfernt und im Stash gespeichert.',
      confirmLabel: 'Stash erstellen',
      onSubmit: async (values) => {
        const msg = (values.message || '').trim();
        const args = msg ? ['stash', 'push', '-m', msg] : ['stash'];
        await git(args, 'Aenderungen gestasht', true);
      },
    });
  };

  const stashPop = () => git(['stash', 'pop'], 'Stash angewendet', true);

  const showDiff = (filePath: string, staged: boolean) => {
    const request: DiffRequest = {
      source: staged ? 'staged' : 'unstaged',
      path: filePath,
      title: staged ? 'Staged Diff' : 'Unstaged Diff',
    };
    onOpenDiff?.(request);
  };


  const markConflictResolved = (filePath: string) => git(['conflictMarkResolved', filePath], `${basename(filePath)} als geloest markiert`);

  const openConflictEditor = useCallback(async (filePath: string) => {
    if (!window.electronAPI) return;

    setIsConflictEditorLoading(true);

    try {
      const result = await window.electronAPI.readRepoFile(filePath);
      if (!result.success || typeof result.data !== 'string') {
        const message = result.error || `Datei konnte nicht geladen werden: ${filePath}`;
        setToast({ msg: message, isError: true });
        return;
      }

      setConflictEditor({
        filePath,
        originalContent: result.data,
        content: result.data,
        isSaving: false,
      });
      setSelectedConflictBlockIndex(0);
    } catch (error: any) {
      const message = error?.message || `Datei konnte nicht geladen werden: ${filePath}`;
      setToast({ msg: message, isError: true });
    } finally {
      setIsConflictEditorLoading(false);
    }
  }, [setToast]);

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

  const isConflictEditorDirty = Boolean(conflictEditor && conflictEditor.content !== conflictEditor.originalContent);

  useEffect(() => {
    if (conflictBlocks.length === 0) {
      if (selectedConflictBlockIndex !== 0) {
        setSelectedConflictBlockIndex(0);
      }
      return;
    }

    if (selectedConflictBlockIndex > conflictBlocks.length - 1) {
      setSelectedConflictBlockIndex(conflictBlocks.length - 1);
    }
  }, [conflictBlocks.length, selectedConflictBlockIndex]);

  useEffect(() => {
    if (onOpenConflictResolver && !isConflictOnly) {
      return;
    }

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

    if (!activePath && autoOpenedConflictPathRef.current === nextPath) {
      return;
    }

    autoOpenedConflictPathRef.current = nextPath;
    void openConflictEditor(nextPath);
  }, [status, conflictEditor, openConflictEditor, onOpenConflictResolver, isConflictOnly]);

  useEffect(() => {
    if (!isConflictOnly) return;
    if (!initialConflictPath) return;
    if (!status || status.conflicts.length === 0) return;
    if (!status.conflicts.some((entry) => entry.path === initialConflictPath)) return;
    if (conflictEditor?.filePath === initialConflictPath) return;

    void openConflictEditor(initialConflictPath);
  }, [isConflictOnly, initialConflictPath, status, conflictEditor, openConflictEditor]);
  const applyConflictChoiceToSelected = useCallback((choice: ConflictResolutionChoice) => {
    if (!conflictEditor) return;

    const blocks = parseConflictBlocks(conflictEditor.content);
    if (blocks.length === 0) {
      return;
    }

    const blockIndex = Math.min(selectedConflictBlockIndex, blocks.length - 1);
    const block = blocks[blockIndex];
    if (!block) return;

    const nextContent = replaceConflictBlock(
      conflictEditor.content,
      block,
      buildConflictResolution(block, choice, detectLineEnding(conflictEditor.content)),
    );

    setConflictEditor((prev) => {
      if (!prev || prev.filePath !== conflictEditor.filePath) return prev;
      return { ...prev, content: nextContent };
    });

    const selectedLabel = choice === 'ours' ? 'Aktueller Stand' : choice === 'theirs' ? 'Eingehender Stand' : 'Beide Seiten';
    setToast({ msg: `${selectedLabel} fuer Block ${blockIndex + 1} uebernommen.`, isError: false });
  }, [conflictEditor, selectedConflictBlockIndex, setToast]);

  const applyConflictChoiceToAll = useCallback((choice: ConflictResolutionChoice) => {
    if (!conflictEditor) return;

    const blocks = parseConflictBlocks(conflictEditor.content);
    if (blocks.length === 0) {
      return;
    }

    let nextContent = conflictEditor.content;
    const lineEnding = detectLineEnding(conflictEditor.content);

    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const block = blocks[i];
      nextContent = replaceConflictBlock(nextContent, block, buildConflictResolution(block, choice, lineEnding));
    }

    setConflictEditor((prev) => {
      if (!prev || prev.filePath !== conflictEditor.filePath) return prev;
      return { ...prev, content: nextContent };
    });

    setSelectedConflictBlockIndex(0);

    const selectedLabel = choice === 'ours' ? 'Aktueller Stand' : choice === 'theirs' ? 'Eingehender Stand' : 'Beide Seiten';
    setToast({ msg: `${selectedLabel} fuer alle Konfliktbloecke uebernommen.`, isError: false });
  }, [conflictEditor, setToast]);


  const markConflictResolvedAndSync = useCallback(async (filePath: string) => {
    await markConflictResolved(filePath);
    if (conflictEditor?.filePath === filePath) {
      await openConflictEditor(filePath);
    }
  }, [conflictEditor, openConflictEditor]);

  const resetConflictEditorDraft = useCallback(() => {
    if (!conflictEditor) return;

    setConflictEditor((prev) => {
      if (!prev || prev.filePath !== conflictEditor.filePath) return prev;
      return { ...prev, content: prev.originalContent };
    });

    setToast({ msg: 'Lokale Editor-Aenderungen verworfen.', isError: false });
  }, [conflictEditor]);

  const saveConflictEditor = useCallback(async (markResolvedAfterSave: boolean) => {
    if (!window.electronAPI || !conflictEditor) return;

    const pendingBlocks = parseConflictBlocks(conflictEditor.content);
    if (markResolvedAfterSave && pendingBlocks.length > 0) {
      setToast({
        msg: 'Vor "Speichern + als geloest markieren" muessen alle Konfliktmarker entfernt sein.',
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
      const writeResult = await window.electronAPI.writeRepoFile(targetPath, targetContent);
      if (!writeResult.success) {
        throw new Error(writeResult.error || 'Datei konnte nicht gespeichert werden.');
      }

      if (markResolvedAfterSave) {
        const stageResult = await window.electronAPI.runGitCommand('conflictMarkResolved', targetPath);
        if (!stageResult.success) {
          throw new Error(stageResult.error || 'Datei konnte nicht als geloest markiert werden.');
        }
      }

      setConflictEditor((prev) => {
        if (!prev || prev.filePath !== targetPath) return prev;
        return {
          ...prev,
          content: targetContent,
          originalContent: targetContent,
          isSaving: false,
        };
      });

      setToast({
        msg: markResolvedAfterSave
          ? `${basename(targetPath)} gespeichert + geloest`
          : `${basename(targetPath)} gespeichert`,
        isError: false,
      });

      if (onRepoChanged) onRepoChanged();
      await refresh();
    } catch (error: any) {
      const message = error?.message || 'Konfliktdatei konnte nicht gespeichert werden.';

      setConflictEditor((prev) => {
        if (!prev || prev.filePath !== targetPath) return prev;
        return { ...prev, isSaving: false };
      });
      setToast({ msg: message, isError: true });
    }
  }, [conflictEditor, onRepoChanged, refresh, setToast]);

  const mergeContinue = () => git(['mergeContinue'], 'Merge fortgesetzt', true);
  const mergeAbort = () => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Merge abbrechen?',
      message: 'Der laufende Merge wird verworfen und auf den Zustand vor dem Merge zurueckgesetzt.',
      contextItems: [{ label: 'Aktion', value: 'git merge --abort' }],
      irreversible: true,
      consequences: 'Alle noch nicht gesicherten Merge-Konfliktaufloesungen gehen verloren.',
      confirmLabel: 'Merge abbrechen',
      onConfirm: () => git(['mergeAbort'], 'Merge abgebrochen', true),
    });
  };

  const rebaseContinue = () => git(['rebaseContinue'], 'Rebase fortgesetzt', true);
  const rebaseAbort = () => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Rebase abbrechen?',
      message: 'Der laufende Rebase wird verworfen und der vorherige Branch-Zustand wiederhergestellt.',
      contextItems: [{ label: 'Aktion', value: 'git rebase --abort' }],
      irreversible: true,
      consequences: 'Alle noch nicht gesicherten Rebase-Aufloesungen gehen verloren.',
      confirmLabel: 'Rebase abbrechen',
      onConfirm: () => git(['rebaseAbort'], 'Rebase abgebrochen', true),
    });
  };

  const handleAiAutoCommit = async () => {
    if (!window.electronAPI || !status) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: 'Bitte zuerst alle Konflikte aufloesen.', isError: true });
      return;
    }

    if (status.staged.length + status.unstaged.length + status.untracked.length === 0) {
      setToast({ msg: 'Keine Aenderungen fuer KI Auto-Commit vorhanden.', isError: true });
      return;
    }
    setAiPhase('snapshot');
    setAiMode('normal');
    setAiLastCommit(null);
    setAiRemainingFiles(status.staged.length + status.unstaged.length + status.untracked.length);
    setIsAiJobRunning(true);
    setAiProgressMessage('KI startet...');
    setIsAiCommitting(true);
    try {
      const latestSettings = await window.electronAPI.getSettings();
      const latestModel = latestSettings.aiProvider === 'gemini'
        ? (latestSettings.geminiModel || '')
        : (latestSettings.ollamaModel || '');

      if (!latestSettings.aiAutoCommitEnabled) {
        setToast({ msg: 'KI Auto-Commit ist in den Einstellungen deaktiviert.', isError: true });
        return;
      }

      if (!latestModel.trim()) {
        setToast({ msg: 'Bitte in den Einstellungen zuerst ein KI-Modell auswaehlen.', isError: true });
        return;
      }

      const result = await window.electronAPI.runAiAutoCommit();
      if (!result.success) {
        setToast({ msg: result.error || 'KI Auto-Commit fehlgeschlagen.', isError: true });
        return;
      }

      const commits = result.data.commits || [];
      const warnings = result.data.warnings || [];
      const diagnostics = result.data.diagnostics || [];

      if (commits.length === 0) {
        setToast({ msg: result.data.summary || 'KI hat keine Commits erstellt.', isError: false });
      } else {
        const list = commits.map((commit) => `${commit.hash} ${commit.subject}`).join(' | ');
        const extra = warnings.length > 0 ? ` | Hinweise: ${warnings.length}` : '';
        setToast({ msg: `KI Commit(s): ${list}${extra}`, isError: false });
      }

      if (diagnostics.length > 0) {
        console.info('AI Auto-Commit diagnostics:', diagnostics);
      }
      if (onRepoChanged) onRepoChanged();
      await refresh();
    } catch (error: unknown) {
      setToast({ msg: error instanceof Error ? error.message : 'KI Auto-Commit fehlgeschlagen.', isError: true });
    } finally {
      setIsAiCommitting(false);
      setIsAiJobRunning(false);
    }
  };

  const handleCancelAiAutoCommit = async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.cancelAiAutoCommit();
      if (result.success && result.canceled) {
        setAiProgressMessage('Abbruch wird ausgefuehrt...');
      } else {
        setAiProgressMessage('Kein laufender KI Auto-Commit zum Abbrechen.');
      }
    } catch (error: unknown) {
      setToast({ msg: error instanceof Error ? error.message : 'KI Auto-Commit konnte nicht abgebrochen werden.', isError: true });
    }
  };
  const handleCommit = async () => {
    if (!commitMsg.trim() || !window.electronAPI || !status) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: 'Bitte zuerst alle Konflikte aufloesen.', isError: true });
      return;
    }

    if (status.staged.length === 0) {
      setToast({ msg: 'Bitte zuerst Dateien stagen.', isError: true });
      return;
    }

    setIsCommitting(true);
    try {
      const commitArgs: string[] = ['commit'];
      if (amendCommit) commitArgs.push('--amend');
      if (signoffCommit) commitArgs.push('--signoff');
      commitArgs.push('-m', commitMsg.trim());
      if (commitDescription.trim()) {
        commitArgs.push('-m', commitDescription.trim());
      }
      const r = await window.electronAPI.runGitCommand(commitArgs[0], ...commitArgs.slice(1));
      if (r.success) {
        setCommitMsg('');
        setCommitDescription('');
        setToast({ msg: 'Commit erfolgreich!', isError: false });
        if (onRepoChanged) onRepoChanged();
        await refresh();
      } else {
        setToast({ msg: r.error || 'Commit fehlgeschlagen', isError: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    } finally {
      setIsCommitting(false);
    }
  };

  if (!repoPath) return null;
  if (!status) return <div style={{ color: 'var(--text-secondary)', padding: '16px' }}>Lade Status...</div>;

  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length + status.conflicts.length;
  const hasOpenConflicts = status.conflicts.length > 0;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const bySearch = <T extends { path: string }>(entries: T[]) => entries
    .filter(entry => !normalizedQuery || entry.path.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => a.path.localeCompare(b.path));

  const visibleStaged = activeFilter === 'all' || activeFilter === 'staged' ? bySearch(status.staged) : [];
  const visibleUnstaged = activeFilter === 'all' || activeFilter === 'unstaged' ? bySearch(status.unstaged) : [];
  const visibleUntracked = activeFilter === 'all' || activeFilter === 'untracked' ? bySearch(status.untracked) : [];
  const visibleConflicts = activeFilter === 'all' || activeFilter === 'conflicts' ? bySearch(status.conflicts) : [];
  const visibleTotal = visibleStaged.length + visibleUnstaged.length + visibleUntracked.length + visibleConflicts.length;
  const contextEntry = contextMenu?.entry || null;
  const contextDir = contextEntry ? dirname(contextEntry.path) : '';
  const contextTopDir = contextDir.includes('/') ? contextDir.split('/')[0] : '';
  const contextExtPattern = contextEntry ? extensionPattern(contextEntry.path) : null;

  const FileRow = ({ entry, section }: { entry: FileEntry; section: FileSection }) => {
    const statusCode = section === 'staged' ? entry.x : entry.y;
    const info = getStatusInfo(statusCode);
    const inspectSource = section === 'staged' ? 'staged' : section === 'unstaged' ? 'unstaged' : null;
    return (
      <div
        className="staging-file-row"
        onClick={() => {
          if (inspectSource) {
            onSelectFileInspect?.(entry.path, inspectSource);
          }
          if (section !== 'untracked') {
            showDiff(entry.path, section === 'staged');
          }
        }}
        onContextMenu={(e) => openFileContextMenu(e, entry, section)}
      >
        <span className="staging-status" style={{ color: info.color }}>{statusCode}</span>
        <span className="staging-path" title={entry.path}>{entry.path}</span>
        <div className="staging-actions">
          {section === 'staged' && (
            <button className="staging-btn" onClick={(e) => { e.stopPropagation(); unstageFile(entry.path); }} title="Unstage">-</button>
          )}
          {section === 'unstaged' && (
            <>
              <button className="staging-btn" onClick={(e) => { e.stopPropagation(); stageFile(entry.path); }} title="Stage">+</button>
              <button className="staging-btn danger" onClick={(e) => { e.stopPropagation(); discardFile(entry.path); }} title="Verwerfen">x</button>
            </>
          )}
          {section === 'untracked' && (
            <>
              <button className="staging-btn" onClick={(e) => { e.stopPropagation(); stageFile(entry.path); }} title="Stage">+</button>
              <button className="staging-btn danger" onClick={(e) => { e.stopPropagation(); deleteUntracked(entry.path); }} title="Loeschen">x</button>
            </>
          )}
        </div>
      </div>
    );
  };

  const SectionHeader = ({ title, count, color, actions, statsText }: { title: string; count: number; color: string; actions?: React.ReactNode; statsText?: string }) => (
    <div className="staging-section-header">
      <span style={{ color }}>{title}</span>
      <span className="staging-count">{count}</span>
      {statsText && <span className="staging-stats-inline">{statsText}</span>}
      <div style={{ flex: 1 }} />
      {actions}
    </div>
  );

  return (
    <div className={`staging-container${isConflictOnly ? ' staging-container--conflict' : ''}`}>
      {!isConflictOnly && (
      <div className="staging-toolbar" style={{ flexWrap: 'wrap' }}>
        <button className="staging-tool-btn" onClick={stashChanges} title="Stash">Stash</button>
        <button className="staging-tool-btn" onClick={stashPop} title="Stash Pop">Pop</button>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Datei suchen..."
          style={{ flex: 1, minWidth: '170px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.76rem' }}
        />
        {(['all', 'staged', 'unstaged', 'untracked', 'conflicts'] as const).map((filter) => (
          <button
            key={filter}
            className="staging-tool-btn"
            style={{
              backgroundColor: activeFilter === filter ? 'var(--accent-primary-soft)' : undefined,
              borderColor: activeFilter === filter ? 'var(--accent-primary-border)' : undefined,
              color: activeFilter === filter ? 'var(--text-accent)' : undefined,
            }}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
        <span className="staging-stat-chip" title="Staged Diff-Statistik">
          Staged {formatDiffStats(stagedStats)}
        </span>
        <span className="staging-stat-chip" title="Unstaged Diff-Statistik">
          Unstaged {formatDiffStats(unstagedStats)}
        </span>
        <div style={{ flex: 1 }} />
        {visibleTotal > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {visibleTotal} sichtbar
          </span>
        )}
      </div>
      )}

      <div className="staging-files">
        {totalChanges === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isConflictOnly ? 'Keine offenen Konflikte.' : 'Working Tree ist sauber.'}
          </div>
        )}

        {visibleConflicts.length > 0 && (
          <div className={`staging-section conflict-section${isConflictOnly ? ' conflict-section--resolve' : ''}`}>
            <SectionHeader title="Konflikte" count={visibleConflicts.length} color="var(--status-danger)" />
            {!onOpenConflictResolver && (
            <div className="conflict-global-actions" style={{ padding: '10px 16px', backgroundColor: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: 'var(--status-danger)', fontSize: '0.85rem' }}>{visibleConflicts.length} Konflikt{visibleConflicts.length !== 1 ? 'e' : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '4px 12px', background: 'var(--bg-dark)' }} onClick={mergeContinue} title="Merge abschliessen">Merge fortsetzen</button>
                <button className="staging-btn-sm danger" style={{ border: '1px solid var(--status-danger-border)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', padding: '4px 12px' }} onClick={mergeAbort} title="Merge abbrechen">Merge abbrechen</button>
                <div style={{ width: '1px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />
                <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '4px 12px', background: 'var(--bg-dark)' }} onClick={rebaseContinue} title="Rebase fortsetzen">Rebase fortsetzen</button>
                <button className="staging-btn-sm danger" style={{ border: '1px solid var(--status-danger-border)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', padding: '4px 12px' }} onClick={rebaseAbort} title="Rebase abbrechen">Rebase abbrechen</button>
              </div>
            </div>
            )}

            {onOpenConflictResolver && (
              <div className="conflict-sidebar-list">
                {visibleConflicts.map((f) => (
                  <button
                    key={`sidebar-c-${f.path}`}
                    className="conflict-sidebar-file"
                    onClick={() => onOpenConflictResolver(f.path)}
                    title={f.path}
                  >
                    <span className="conflict-file-code">{f.code}</span>
                    <span className="conflict-file-path">{f.path}</span>
                    <span className="conflict-file-label">{CONFLICT_LABELS[f.code] || 'Konflikt'}</span>
                  </button>
                ))}
              </div>
            )}
            {!onOpenConflictResolver && (
            <div
              className={`conflict-layout${isConflictOnly ? ' conflict-layout--fill' : ''}`}
              style={{ borderBottom: '1px solid var(--border-color)', ...(isConflictOnly ? {} : { minHeight: '360px' }) }}
            >
              <div className="conflict-file-list" style={{ borderRight: '1px solid var(--border-color)', background: 'var(--bg-panel)', overflowY: 'auto' }}>
                {visibleConflicts.map((f) => {
                  const isActive = conflictEditor?.filePath === f.path;
                  return (
                    <button
                      key={`c-${f.path}`}
                      className={`conflict-sidebar-file ${isActive ? 'active' : ''}`}
                      style={{
                        width: '100%', margin: 0, borderRadius: 0, borderTop: 'none', borderRight: 'none', borderBottom: '1px solid var(--line-subtle)',
                        backgroundColor: isActive ? 'var(--bg-dark)' : 'transparent',
                        padding: '12px 16px',
                        display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', gap: '4px 8px', alignItems: 'center',
                        borderLeft: isActive ? '3px solid var(--status-danger)' : '3px solid transparent'
                      }}
                      onClick={() => { void openConflictEditor(f.path); }}
                      title={f.path}
                    >
                      <span className="conflict-file-code" style={{ gridRow: '1 / span 2', fontSize: '0.8rem' }}>{f.code}</span>
                      <span className="conflict-file-path" style={{ fontSize: '0.8rem', fontWeight: isActive ? 600 : 400 }}>{f.path}</span>
                      <span className="conflict-file-label" style={{ fontSize: '0.7rem' }}>{CONFLICT_LABELS[f.code] || 'Konflikt'}</span>
                    </button>
                  );
                })}
              </div>

              <div className="conflict-editor-panel" style={{ background: 'var(--bg-darker)' }}>
                {isConflictEditorLoading && (
                  <div className="conflict-empty-state">Konfliktdatei wird geladen...</div>
                )}

                {!isConflictEditorLoading && !conflictEditor && (
                  <div className="conflict-empty-state">Waehle links eine Konfliktdatei aus.</div>
                )}

                {!isConflictEditorLoading && conflictEditor && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
                    <div className="conflict-editor-toolbar" style={{ padding: '16px 20px', background: 'var(--bg-dark)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }} title={conflictEditor.filePath}>{conflictEditor.filePath}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ 
                            color: conflictBlocks.length > 0 ? 'var(--status-warning)' : 'var(--status-success)',
                            background: conflictBlocks.length > 0 ? 'var(--status-warning-soft)' : 'var(--status-success-soft)',
                            border: `1px solid ${conflictBlocks.length > 0 ? 'var(--status-warning-border)' : 'var(--status-success-border)'}`,
                            padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600
                          }}>
                            {conflictBlocks.length > 0 ? `${conflictBlocks.length} ungeloeste${conflictBlocks.length === 1 ? 'r' : ''} Block${conflictBlocks.length === 1 ? '' : 'e'}` : 'Bereit zum Speichern'}
                          </span>
                          <button className="staging-btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem', border: '1px solid var(--border-color)', background: 'var(--bg-panel)' }} onClick={reloadActiveConflictEditor} disabled={conflictEditor.isSaving}>Neu laden</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '6px 12px', background: 'var(--bg-panel)' }} onClick={() => applyConflictChoiceToAll('ours')} disabled={conflictEditor.isSaving || conflictBlocks.length === 0}>Alle: Aktueller Stand</button>
                        <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '6px 12px', background: 'var(--bg-panel)' }} onClick={() => applyConflictChoiceToAll('theirs')} disabled={conflictEditor.isSaving || conflictBlocks.length === 0}>Alle: Eingehender Stand</button>
                        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />
                        <button className="staging-btn-sm" style={{ 
                          color: 'var(--on-accent)', background: 'var(--status-success)', border: 'none', padding: '6px 16px', fontWeight: 600
                        }} onClick={() => { void markConflictResolvedAndSync(conflictEditor.filePath); }}>Als geloest markieren</button>
                      </div>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                      {conflictBlocks.length > 0 && selectedConflictBlock && (
                        <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-darker)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Konfliktblock {selectedConflictBlockIndex + 1} von {conflictBlocks.length}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>Zeile {selectedConflictBlock.startLine} - {selectedConflictBlock.endLine}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '4px 12px', background: 'var(--bg-dark)' }} disabled={selectedConflictBlockIndex === 0} onClick={() => setSelectedConflictBlockIndex(prev => prev - 1)}>Vorheriger</button>
                              <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '4px 12px', background: 'var(--bg-dark)' }} disabled={selectedConflictBlockIndex === conflictBlocks.length - 1} onClick={() => setSelectedConflictBlockIndex(prev => prev + 1)}>Naechster</button>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--border-color)', gap: '1px', minHeight: 0 }}>
                            
                            <div style={{ background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--status-warning-soft)' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--status-warning)' }}>Aktueller Stand {selectedConflictBlock.oursLabel ? `(${selectedConflictBlock.oursLabel})` : ''}</span>
                                <button className="staging-btn-sm" style={{ padding: '4px 12px', background: 'var(--status-warning)', color: 'var(--on-accent)', border: 'none', fontWeight: 600 }} onClick={() => applyConflictChoiceToSelected('ours')} disabled={conflictEditor.isSaving}>Uebernehmen</button>
                              </div>
                              <pre style={{ padding: '16px', margin: 0, overflow: 'auto', fontSize: '0.75rem', color: 'var(--text-primary)', minHeight: '80px', fontFamily: 'monospace' }}>{selectedConflictBlock.ours || '(leer)'}</pre>
                            </div>

                            <div style={{ background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--status-success-soft)' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--status-success)' }}>Eingehender Stand {selectedConflictBlock.theirsLabel ? `(${selectedConflictBlock.theirsLabel})` : ''}</span>
                                <button className="staging-btn-sm" style={{ padding: '4px 12px', background: 'var(--status-success)', color: 'var(--on-accent)', border: 'none', fontWeight: 600 }} onClick={() => applyConflictChoiceToSelected('theirs')} disabled={conflictEditor.isSaving}>Uebernehmen</button>
                              </div>
                              <pre style={{ padding: '16px', margin: 0, overflow: 'auto', fontSize: '0.75rem', color: 'var(--text-primary)', minHeight: '80px', fontFamily: 'monospace' }}>{selectedConflictBlock.theirs || '(leer)'}</pre>
                            </div>

                          </div>

                          <div style={{ padding: '12px 20px', background: 'var(--bg-darker)', borderTop: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'center' }}>
                            <button className="staging-btn-sm" style={{ padding: '6px 24px', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', fontWeight: 600, fontSize: '0.8rem' }} onClick={() => applyConflictChoiceToSelected('both')} disabled={conflictEditor.isSaving}>Beide Staende uebernehmen (Aktueller zuerst)</button>
                          </div>

                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-darker)' }}>
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Manuelle Bearbeitung</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '4px 12px', background: 'var(--bg-dark)' }} onClick={resetConflictEditorDraft} disabled={!isConflictEditorDirty || conflictEditor.isSaving}>Aenderungen verwerfen</button>
                            <button className="staging-btn-sm" style={{ border: '1px solid var(--border-color)', padding: '4px 12px', background: 'var(--bg-dark)' }} onClick={() => { void saveConflictEditor(false); }} disabled={conflictEditor.isSaving || !isConflictEditorDirty}>Speichern</button>
                            <button className="staging-btn-sm" style={{ background: 'var(--status-success)', color: 'var(--on-accent)', border: 'none', padding: '4px 16px', fontWeight: 600 }} onClick={() => { void saveConflictEditor(true); }} disabled={conflictEditor.isSaving || conflictBlocks.length > 0}>Speichern + Geloest</button>
                          </div>
                        </div>
                        <textarea
                          spellCheck={false}
                          value={conflictEditor.content}
                          onChange={(event) => {
                            const next = event.target.value;
                            setConflictEditor((prev) => {
                              if (!prev || prev.filePath !== conflictEditor.filePath) return prev;
                              return { ...prev, content: next };
                            });
                          }}
                          disabled={conflictEditor.isSaving}
                          style={{ flex: 1, minHeight: '160px', border: 'none', padding: '16px 20px', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.75rem', resize: 'none', outline: 'none', overflow: 'auto' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {visibleStaged.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Staged Changes" count={visibleStaged.length} color="var(--status-success)" statsText={formatDiffStats(stagedStats)}
              actions={<button className="staging-btn-sm" onClick={unstageAll} title="Alle unstagen">- Alle</button>}
            />
            {visibleStaged.map(f => <FileRow key={`s-${f.path}`} entry={f} section="staged" />)}
          </div>
        )}

        {visibleUnstaged.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Changes" count={visibleUnstaged.length} color="var(--status-warning)" statsText={formatDiffStats(unstagedStats)}
              actions={
                <>
                  <button className="staging-btn-sm" onClick={stageAll} title="Alle stagen">+ Alle</button>
                  <button className="staging-btn-sm danger" onClick={discardAll} title="Alle verwerfen">x Alle</button>
                </>
              }
            />
            {visibleUnstaged.map(f => <FileRow key={`u-${f.path}`} entry={f} section="unstaged" />)}
          </div>
        )}

        {visibleUntracked.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Untracked" count={visibleUntracked.length} color="var(--status-untracked)"
              actions={<button className="staging-btn-sm" onClick={stageAllUntracked} title="Alle untracked stagen">+ Alle</button>}
            />
            {visibleUntracked.map(f => <FileRow key={`t-${f.path}`} entry={f} section="untracked" />)}
          </div>
        )}
      </div>

      {!isConflictOnly && (
      <div className="staging-commit-area">
        <textarea
          className="staging-commit-input"
          placeholder={hasOpenConflicts ? 'Konflikte aufloesen, danach committen...' : 'Commit-Titel...'}
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit(); }}
          disabled={hasOpenConflicts}
        />
        <textarea
          className="staging-commit-input staging-commit-description"
          placeholder="Commit-Beschreibung (optional)..."
          value={commitDescription}
          onChange={e => setCommitDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit(); }}
          disabled={hasOpenConflicts}
        />
        <div className="staging-commit-bar" style={{ gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: hasOpenConflicts ? 'var(--status-danger)' : 'var(--text-secondary)' }}>
            {hasOpenConflicts ? 'Offene Konflikte blockieren Commit' : 'Ctrl+Enter'}
          </span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={amendCommit} onChange={(e) => setAmendCommit(e.target.checked)} />
            Amend
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={signoffCommit} onChange={(e) => setSignoffCommit(e.target.checked)} />
            Signoff
          </label>
          <div style={{ flex: 1 }} />
          {aiProgressMessage && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '220px', maxWidth: '420px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiProgressMessage}>
                {aiProgressMessage}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                {`Phase: ${aiPhase} | Modus: ${aiMode}${aiRemainingFiles !== null ? ` | Rest: ${aiRemainingFiles}` : ''}`}
              </span>
              {aiLastCommit && (
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiLastCommit}>
                  {`Letzter Commit: ${aiLastCommit}`}
                </span>
              )}
            </div>
          )}
          {(isAiCommitting || isAiJobRunning) && (
            <button
              className="staging-tool-btn danger"
              type="button"
              onClick={handleCancelAiAutoCommit}
              title="Laufenden KI Auto-Commit abbrechen"
            >
              Abbrechen
            </button>
          )}
          <button
            className="staging-tool-btn"
            type="button"
            onClick={handleAiAutoCommit}
            disabled={isCommitting || isAiCommitting || isAiJobRunning || !status}
            title={aiConfig.enabled ? 'KI entscheidet Staging + Commit-Nachrichten automatisch.' : 'In Settings zuerst KI Auto-Commit aktivieren.'}
            style={{ opacity: aiConfig.enabled ? 1 : 0.7 }}
          >
            {(isAiCommitting || isAiJobRunning) ? 'KI arbeitet...' : 'KI Auto-Commit'}
          </button>
          <button
            className="staging-commit-btn"
            onClick={handleCommit}
            disabled={hasOpenConflicts || !commitMsg.trim() || isCommitting || isAiCommitting || !status || status.staged.length === 0}
          >
            {hasOpenConflicts
              ? `Konflikte (${status.conflicts.length})`
              : (isCommitting ? 'Committing...' : `Commit (${status?.staged.length || 0} | ${formatDiffStats(stagedStats)})`)
            }
          </button>
        </div>
      </div>
      )}

      {contextMenu && contextEntry && (
        <div className="ctx-menu-backdrop" onClick={() => setContextMenu(null)}>
          <div className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
            <div className="ctx-menu-header">{contextEntry.path}</div>
            <button
              className="ctx-menu-item"
              onClick={() => {
                setContextMenu(null);
                addIgnoreRule(contextEntry, contextMenu.section, toGitPath(contextEntry.path));
              }}
            >
              <span className="ctx-menu-icon">IG</span>
              Datei zu .gitignore hinzufuegen
            </button>
            {contextDir && (
              <button
                className="ctx-menu-item"
                onClick={() => {
                  setContextMenu(null);
                  addIgnoreRule(contextEntry, contextMenu.section, `${contextDir}/`);
                }}
              >
                <span className="ctx-menu-icon">DIR</span>
                Ordner ignorieren ({contextDir}/)
              </button>
            )}
            {contextTopDir && contextTopDir !== contextDir && (
              <button
                className="ctx-menu-item"
                onClick={() => {
                  setContextMenu(null);
                  addIgnoreRule(contextEntry, contextMenu.section, `${contextTopDir}/`);
                }}
              >
                <span className="ctx-menu-icon">TOP</span>
                Oberordner ignorieren ({contextTopDir}/)
              </button>
            )}
            {contextExtPattern && (
              <button
                className="ctx-menu-item"
                onClick={() => {
                  setContextMenu(null);
                  addIgnoreRule(contextEntry, contextMenu.section, contextExtPattern);
                }}
              >
                <span className="ctx-menu-icon">EXT</span>
                Dateityp ignorieren ({contextExtPattern})
              </button>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className={`action-toast ${toast.isError ? 'error' : 'success'}`}>
          {toast.isError ? 'x' : 'ok'} {toast.msg}
        </div>
      )}

      {confirmDialog && confirmDialog.variant === 'confirm' && (
        <Confirm
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          contextItems={confirmDialog.contextItems}
          irreversible={confirmDialog.irreversible}
          consequences={confirmDialog.consequences}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={executeConfirmDialog}
          onCancel={closeConfirmDialog}
        />
      )}

      {confirmDialog && confirmDialog.variant === 'danger' && (
        <DangerConfirm
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          contextItems={confirmDialog.contextItems}
          irreversible={confirmDialog.irreversible}
          consequences={confirmDialog.consequences}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={executeConfirmDialog}
          onCancel={closeConfirmDialog}
        />
      )}

      {inputDialog && (
        <Input
          open={true}
          title={inputDialog.title}
          message={inputDialog.message}
          fields={inputDialog.fields}
          contextItems={inputDialog.contextItems}
          irreversible={inputDialog.irreversible}
          consequences={inputDialog.consequences}
          confirmLabel={inputDialog.confirmLabel}
          onSubmit={executeInputDialog}
          onCancel={closeInputDialog}
        />
      )}
    </div>
  );
};

