import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  isMergeInProgressError,
  mergeableDecoratedRefs,
  normalizeBranchRefForMerge,
  parseGitLog,
  resolveConflictPathAfterGitFailure,
} from '../utils/gitParsing';
import { GraphNode, GraphEdge } from '../utils/graphLayout';
import { useToastQueue } from '../hooks/useToastQueue';
import { Confirm, DialogContextItem } from './Confirm';
import { DangerConfirm } from './DangerConfirm';
import { Input, InputDialogField } from './Input';
import { DiffRequest } from '../types/diff';
import { useI18n } from '../i18n';
import { formatDate, formatRelativeTime, formatTime } from '../utils/dateTime';
import { BranchInfo, GitMergeMode } from '../types/git';
import { useCommitGraphData } from './commit-graph/useCommitGraphData';
import { EmptyState } from './EmptyState';

interface CommitGraphProps {
  repoPath: string | null;
  onSelectCommit?: (hash: string | null) => void;
  selectedHash?: string | null;
  refreshTrigger?: number;
  showSecondaryHistory?: boolean;
  onOpenDiff?: (request: DiffRequest) => void;
  showRecoveryCenter?: boolean;
  onToggleRecoveryCenter?: () => void;
  currentBranch?: string;
  branches?: BranchInfo[];
  onMergeBranch?: (branchName: string, mode: GitMergeMode) => void;
  /** Wenn ein Git-Befehl hier direkt fehlschlaegt (nicht ueber runGitCommand), Konflikt-Resolver oeffnen */
  onOpenConflictResolverForPath?: (path: string) => void;
}

const ROW_HEIGHT = 44;
const LANE_WIDTH = 28;
const GRAPH_PADDING = 16;
const NODE_RADIUS = 4;
const MERGE_NODE_RADIUS = 6;
const SECONDARY_GRAPH_ACCENT = 'var(--status-untracked-border)';
const FORENSIC_PATH_HISTORY_STORAGE_KEY = 'open-git-control:forensic-path-history:v1';

interface ContextMenuState {
  x: number;
  y: number;
  node: GraphNode;
}

interface MenuAction {
  label: string;
  icon: string;
  danger?: boolean;
  separator?: boolean;
  action: () => void;
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

type RefKind = 'head' | 'local' | 'remote' | 'tag' | 'head-pointer';
type SearchScope = 'all' | 'subject' | 'author' | 'hash' | 'refs';
type ForensicSearchType = 'string' | 'regex' | 'line';
type SearchPanel = 'commits' | 'forensic';

const getRefKind = (ref: string): RefKind => {
  if (ref.startsWith('tag:')) return 'tag';
  if (ref.startsWith('HEAD ->')) return 'head';
  if (ref === 'HEAD') return 'head-pointer';
  if (ref.includes('/')) return 'remote';
  return 'local';
};

const getRefPriority = (ref: string) => {
  const kind = getRefKind(ref);
  if (kind === 'head') return 0;
  if (kind === 'local') return 1;
  if (kind === 'remote') return 2;
  if (kind === 'tag') return 3;
  return 4;
};

const sortRefs = (refs: string[]) => [...refs].sort((a, b) => {
  const prioDiff = getRefPriority(a) - getRefPriority(b);
  return prioDiff !== 0 ? prioDiff : a.localeCompare(b);
});

export const CommitGraph: React.FC<CommitGraphProps> = ({
  repoPath,
  onSelectCommit,
  selectedHash,
  refreshTrigger,
  showSecondaryHistory = true,
  onOpenDiff,
  showRecoveryCenter = false,
  onToggleRecoveryCenter,
  currentBranch = '',
  branches = [],
  onMergeBranch,
  onOpenConflictResolverForPath,
}) => {
  const { locale, tr } = useI18n();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [mergeCtxExpanded, setMergeCtxExpanded] = useState(false);
  const { toast, setToast } = useToastQueue(4000);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [activeSearchPanel, setActiveSearchPanel] = useState<SearchPanel>('commits');
  const [matchCursor, setMatchCursor] = useState(0);

  const [forensicType, setForensicType] = useState<ForensicSearchType>('string');
  const [forensicPath, setForensicPath] = useState('');
  const [forensicValue, setForensicValue] = useState('');
  const [forensicStartLine, setForensicStartLine] = useState('1');
  const [forensicEndLine, setForensicEndLine] = useState('1');
  const [forensicLoading, setForensicLoading] = useState(false);
  const [forensicError, setForensicError] = useState<string | null>(null);
  const [forensicResults, setForensicResults] = useState<GraphNode[]>([]);
  const [forensicPathHistory, setForensicPathHistory] = useState<string[]>([]);

  const searchScopeLabels = useMemo<Record<SearchScope, string>>(() => ({
    all: tr('Alles', 'All'),
    subject: tr('Nachricht', 'Message'),
    author: tr('Autor', 'Author'),
    hash: tr('Hash', 'Hash'),
    refs: tr('Refs', 'Refs'),
  }), [tr]);

  const forensicSearchTypeLabels = useMemo<Record<ForensicSearchType, string>>(() => ({
    string: tr('-S String', '-S string'),
    regex: tr('-G Regex', '-G regex'),
    line: tr('-L Zeilenbereich', '-L line range'),
  }), [tr]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);
  const {
    layout,
    workingTreeStatus,
    loading,
    loadingMore,
    hasMoreCommits,
    refreshCommits,
    loadMoreCommits,
    refreshWorkingTreeStatus,
  } = useCommitGraphData({
    repoPath,
    showSecondaryHistory,
    refreshTrigger,
    logContainerRef,
    onRepoCleared: () => {
      setForensicResults([]);
      setForensicError(null);
      setForensicLoading(false);
    },
  });

  useEffect(() => {
    if (!layout) return;
    const container = logContainerRef.current?.parentElement;
    if (!container) return;
    const onScroll = () => setScrollTop(container.scrollTop);
    setScrollTop(container.scrollTop);
    setContainerHeight(container.clientHeight);
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [layout]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORENSIC_PATH_HISTORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const sanitized = parsed
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .slice(0, 30);
      setForensicPathHistory(sanitized);
    } catch {
      // ignore malformed local storage values
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        FORENSIC_PATH_HISTORY_STORAGE_KEY,
        JSON.stringify(forensicPathHistory.slice(0, 30)),
      );
    } catch {
      // ignore write errors
    }
  }, [forensicPathHistory]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);


  const normalizedSearch = searchQuery.trim().toLowerCase();

  const matchedNodes = useMemo(() => {
    if (!layout || !normalizedSearch) return [];

    return layout.nodes.filter(node => {
      const { abbrevHash, hash, author, subject, refs } = node.commit;
      const inHash = abbrevHash.toLowerCase().includes(normalizedSearch) || hash.toLowerCase().includes(normalizedSearch);
      const inAuthor = author.toLowerCase().includes(normalizedSearch);
      const inSubject = subject.toLowerCase().includes(normalizedSearch);
      const inRefs = refs.some(ref => ref.toLowerCase().includes(normalizedSearch));

      if (searchScope === 'hash') return inHash;
      if (searchScope === 'author') return inAuthor;
      if (searchScope === 'subject') return inSubject;
      if (searchScope === 'refs') return inRefs;

      return inHash || inAuthor || inSubject || inRefs;
    });
  }, [layout, normalizedSearch, searchScope]);

  const matchedHashSet = useMemo(() => new Set(matchedNodes.map(node => node.commit.hash)), [matchedNodes]);

  useEffect(() => {
    setMatchCursor(0);
  }, [normalizedSearch, searchScope]);

  useEffect(() => {
    if (!selectedHash || matchedNodes.length === 0) return;
    const idx = matchedNodes.findIndex(node => node.commit.hash === selectedHash);
    if (idx >= 0) {
      setMatchCursor(idx);
    }
  }, [selectedHash, matchedNodes]);

  const jumpToMatch = useCallback((step: 1 | -1) => {
    if (matchedNodes.length === 0) return;

    const nextIndex = (matchCursor + step + matchedNodes.length) % matchedNodes.length;
    setMatchCursor(nextIndex);

    const hash = matchedNodes[nextIndex].commit.hash;
    onSelectCommit?.(hash);

    requestAnimationFrame(() => {
      const row = document.querySelector('[data-commit-hash="' + hash + '"]') as HTMLElement | null;
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [matchCursor, matchedNodes, onSelectCommit]);

  const forensicPathSuggestions = useMemo(() => {
    const query = forensicPath.trim().toLowerCase();
    const workingTreePaths = [
      ...(workingTreeStatus?.staged || []).map((entry) => entry.path),
      ...(workingTreeStatus?.unstaged || []).map((entry) => entry.path),
      ...(workingTreeStatus?.untracked || []).map((entry) => entry.path),
    ];

    const unique = Array.from(new Set([...forensicPathHistory, ...workingTreePaths].map((value) => value.trim()).filter(Boolean)));
    if (!query) {
      return unique.slice(0, 20);
    }

    const startsWith = unique.filter((value) => value.toLowerCase().startsWith(query));
    const includes = unique.filter((value) => !value.toLowerCase().startsWith(query) && value.toLowerCase().includes(query));
    return [...startsWith, ...includes].slice(0, 20);
  }, [forensicPath, forensicPathHistory, workingTreeStatus]);


  const runForensicSearch = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;

    const normalizedPath = forensicPath.trim();
    if (!normalizedPath) {
      setForensicError(tr('Bitte einen Pfad fuer die forensische Suche angeben.', 'Please provide a path for the forensic search.'));
      setForensicResults([]);
      return;
    }

    setForensicPathHistory((prev) => {
      const next = [normalizedPath, ...prev.filter((entry) => entry !== normalizedPath)];
      return next.slice(0, 30);
    });

    const args: string[] = ['forensicHistory', forensicType, normalizedPath];

    if (forensicType === 'line') {
      const start = Number(forensicStartLine);
      const end = Number(forensicEndLine);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
        setForensicError(tr('Ungueltiger Zeilenbereich. Bitte Start/Ende pruefen.', 'Invalid line range. Please check start/end.'));
        setForensicResults([]);
        return;
      }
      args.push('line-range', String(start), String(end), '200');
    } else {
      const searchTerm = forensicValue.trim();
      if (!searchTerm) {
        setForensicError(forensicType === 'regex' ? tr('Bitte Regex angeben.', 'Please provide a regex.') : tr('Bitte Suchstring angeben.', 'Please provide a search string.'));
        setForensicResults([]);
        return;
      }
      args.push(searchTerm, '0', '0', '200');
    }

    setForensicLoading(true);
    setForensicError(null);

    try {
      const { success, data, error } = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (!success) {
        const message = String(error || tr('Forensische Suche fehlgeschlagen.', 'Forensic search failed.'));
        const invalidPattern = /invalid|regex|regular expression|fatal/i.test(message);
        setForensicError(invalidPattern ? tr('Ungueltiges Regex-Muster. Bitte Ausdruck korrigieren.', 'Invalid regex pattern. Please fix the expression.') : message);
        setForensicResults([]);
        return;
      }

      const commits = parseGitLog(String(data || ''));
      const nodes = commits.map(commit => ({ commit, lane: 0, row: 0, color: 'var(--accent-primary)', isMerge: commit.parentHashes.length > 1 }));
      setForensicResults(nodes);
      if (commits.length === 0) {
        setForensicError(tr('Keine Treffer gefunden.', 'No matches found.'));
      }
    } catch (e: any) {
      setForensicResults([]);
      setForensicError(String(e?.message || tr('Forensische Suche fehlgeschlagen.', 'Forensic search failed.')));
    } finally {
      setForensicLoading(false);
    }
  }, [forensicEndLine, forensicPath, forensicStartLine, forensicType, forensicValue, repoPath, tr]);
  const runGitAction = async (args: string[], successMsg: string) => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (result.success) {
        setToast({ msg: successMsg, isError: false });
        refreshCommits();
        refreshWorkingTreeStatus();
      } else {
        const mergeInProgress = isMergeInProgressError(result.error);
        refreshCommits();
        void refreshWorkingTreeStatus();
        try {
          const statusAfter = await window.electronAPI.runGitCommand('statusPorcelain');
          const porcelain = statusAfter.success && typeof statusAfter.data === 'string' ? statusAfter.data : null;
          const conflictPath = resolveConflictPathAfterGitFailure(porcelain, result.error);
          if (conflictPath && onOpenConflictResolverForPath) {
            onOpenConflictResolverForPath(conflictPath);
            return;
          }
        } catch {
          // fall through to error toast
        }
        if (mergeInProgress) {
          setToast({
            msg: tr(
              'Ein Merge ist bereits aktiv (MERGE_HEAD). Bitte zuerst Merge fortsetzen oder Merge abbrechen.',
              'A merge is already active (MERGE_HEAD). Please continue or abort the current merge first.',
            ),
            isError: true,
          });
          return;
        }
        setToast({ msg: result.error || 'Unbekannter Fehler', isError: true });
      }
    } catch (e: any) {
      const mergeInProgress = isMergeInProgressError(e?.message);
      refreshCommits();
      void refreshWorkingTreeStatus();
      try {
        const statusAfter = await window.electronAPI.runGitCommand('statusPorcelain');
        const porcelain = statusAfter.success && typeof statusAfter.data === 'string' ? statusAfter.data : null;
        const conflictPath = resolveConflictPathAfterGitFailure(porcelain, e?.message);
        if (conflictPath && onOpenConflictResolverForPath) {
          onOpenConflictResolverForPath(conflictPath);
          return;
        }
      } catch {
        // ignore
      }
      if (mergeInProgress) {
        setToast({
          msg: tr(
            'Ein Merge ist bereits aktiv (MERGE_HEAD). Bitte zuerst Merge fortsetzen oder Merge abbrechen.',
            'A merge is already active (MERGE_HEAD). Please continue or abort the current merge first.',
          ),
          isError: true,
        });
        return;
      }
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

  const handleContextMenu = (e: React.MouseEvent, node: GraphNode) => {
    e.preventDefault();
    e.stopPropagation();
    setMergeCtxExpanded(false);
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const mergeContextPayload = useMemo(() => {
    if (!contextMenu || !currentBranch || !onMergeBranch) return null;
    const node = contextMenu.node;
    const refsHere = mergeableDecoratedRefs(node.commit.refs, currentBranch);
    const seen = new Set<string>(refsHere);
    const branchExtras = branches
      .filter(b => !(b.scope === 'local' && b.name === currentBranch))
      .filter(b => !seen.has(normalizeBranchRefForMerge(b.name)))
      .map(b => ({ raw: b.name, label: normalizeBranchRefForMerge(b.name), scope: b.scope }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      hash: node.commit.hash,
      shortHash: node.commit.abbrevHash,
      refsHere,
      branchExtras,
    };
  }, [branches, contextMenu, currentBranch, onMergeBranch]);

  const getMenuActions = (node: GraphNode): MenuAction[] => {
    const hash = node.commit.hash;
    const shortHash = node.commit.abbrevHash;
    const isMerge = node.isMerge;

    const actions: MenuAction[] = [
      {
        label: `Checkout (Branch von ${shortHash})`,
        icon: '->',
        action: () => {
          const suggested = `checkout-${shortHash}`;
          setInputDialog({
            title: 'Branch aus Commit auschecken',
            message: 'Es wird ein neuer Branch auf Basis dieses Commits erstellt und ausgecheckt.',
            fields: [
              {
                id: 'name',
                label: 'Neuer Branch-Name',
                defaultValue: suggested,
                required: true,
              },
            ],
            contextItems: [
              { label: 'Commit', value: shortHash },
              { label: 'Aktion', value: 'checkout -b <name> <commit>' },
            ],
            irreversible: false,
            consequences: 'Du wechselst auf den neuen Branch. Der aktuelle Branch bleibt unveraendert.',
            confirmLabel: 'Branch erstellen',
            onSubmit: async (values) => {
              const name = (values.name || '').trim();
              if (!name) return;
              await runGitAction(['checkout', '-b', name, hash], `Branch "${name}" aus ${shortHash} ausgecheckt.`);
            },
          });
        },
      },
      {
        label: 'Nur Commit (detached HEAD) auschecken...',
        icon: '!',
        action: () => {
          setConfirmDialog({
            variant: 'confirm',
            title: 'Detached HEAD aktivieren?',
            message: 'Du checkst direkt auf den Commit aus und arbeitest temporaer ohne Branch.',
            contextItems: [
              { label: 'Commit', value: shortHash },
              { label: 'Modus', value: 'Detached HEAD' },
            ],
            irreversible: false,
            consequences: 'Neue Commits sind spaeter schwerer auffindbar, bis du einen Branch erstellst.',
            confirmLabel: 'Trotzdem auschecken',
            onConfirm: async () => {
              await runGitAction(['checkout', hash], `Checkout zu ${shortHash} (detached HEAD) erfolgreich.`);
            },
          });
        },
      },
      {
        label: 'Neuen Branch erstellen...',
        icon: 'B',
        action: () => {
          setInputDialog({
            title: 'Neuen Branch erstellen',
            message: 'Der neue Branch zeigt auf den ausgewaehlten Commit.',
            fields: [
              {
                id: 'name',
                label: 'Branch-Name',
                required: true,
              },
            ],
            contextItems: [
              { label: 'Commit', value: shortHash },
            ],
            irreversible: false,
            consequences: 'Der Branch wird erstellt und direkt ausgecheckt.',
            confirmLabel: 'Branch erstellen',
            onSubmit: async (values) => {
              const name = (values.name || '').trim();
              if (!name) return;
              await runGitAction(['checkout', '-b', name, hash], `Branch "${name}" erstellt.`);
            },
          });
        },
      },
      {
        label: 'Tag erstellen...',
        icon: 'T',
        action: () => {
          setInputDialog({
            title: 'Tag auf Commit erstellen',
            message: 'Lege einen lightweight oder annotierten Tag an.',
            fields: [
              {
                id: 'name',
                label: 'Tag-Name',
                required: true,
                placeholder: 'v1.2.3',
              },
              {
                id: 'message',
                label: 'Tag-Nachricht (optional)',
                placeholder: 'Leer lassen fuer lightweight Tag',
              },
            ],
            contextItems: [
              { label: 'Commit', value: shortHash },
            ],
            irreversible: false,
            consequences: 'Der Tag markiert diesen Commit lokal. Push auf Remote erfolgt separat.',
            confirmLabel: 'Tag erstellen',
            onSubmit: async (values) => {
              const name = (values.name || '').trim();
              if (!name) return;
              const msg = (values.message || '').trim();
              if (msg) {
                await runGitAction(['tag', '-a', name, '-m', msg, hash], `Tag "${name}" erstellt.`);
              } else {
                await runGitAction(['tag', name, hash], `Tag "${name}" erstellt.`);
              }
            },
          });
        },
      },
      {
        label: '', icon: '', separator: true, action: () => {},
      },
      {
        label: `Cherry-Pick ${shortHash}`,
        icon: 'CP',
        action: () => runGitAction(['cherry-pick', hash], `Cherry-Pick von ${shortHash} erfolgreich.`),
      },
      {
        label: `Revert ${shortHash}`,
        icon: 'RV',
        action: () => runGitAction(['revert', '--no-edit', hash], `Revert von ${shortHash} erfolgreich.`),
      },
      {
        label: '', icon: '', separator: true, action: () => {},
      },
      {
        label: `Reset --soft auf ${shortHash}`,
        icon: 'RS',
        action: () => {
          setConfirmDialog({
            variant: 'confirm',
            title: 'Soft Reset ausfuehren?',
            message: 'HEAD wird auf den Commit gesetzt, Aenderungen bleiben staged.',
            contextItems: [
              { label: 'Commit', value: shortHash },
              { label: 'Reset-Modus', value: '--soft' },
            ],
            irreversible: false,
            consequences: 'Die Commit-Historie wird lokal verschoben.',
            confirmLabel: 'Soft Reset',
            onConfirm: async () => {
              await runGitAction(['reset', '--soft', hash], `Soft-Reset auf ${shortHash} erfolgreich.`);
            },
          });
        },
      },
      {
        label: `Reset --mixed auf ${shortHash}`,
        icon: 'RM',
        action: () => {
          setConfirmDialog({
            variant: 'confirm',
            title: 'Mixed Reset ausfuehren?',
            message: 'HEAD wird verschoben, Aenderungen bleiben unstaged im Working Tree.',
            contextItems: [
              { label: 'Commit', value: shortHash },
              { label: 'Reset-Modus', value: '--mixed' },
            ],
            irreversible: false,
            consequences: 'Index wird zurueckgesetzt. Commit-Historie aendert sich lokal.',
            confirmLabel: 'Mixed Reset',
            onConfirm: async () => {
              await runGitAction(['reset', '--mixed', hash], `Mixed-Reset auf ${shortHash} erfolgreich.`);
            },
          });
        },
      },
      {
        label: `Reset --hard auf ${shortHash}`,
        icon: 'RH',
        danger: true,
        action: () => {
          setConfirmDialog({
            variant: 'danger',
            title: 'Hard Reset ausfuehren?',
            message: 'HEAD, Index und Working Tree werden auf den Commit zurueckgesetzt.',
            contextItems: [
              { label: 'Commit', value: shortHash },
              { label: 'Reset-Modus', value: '--hard' },
            ],
            irreversible: true,
            consequences: 'Lokale nicht-gesicherte Aenderungen gehen verloren.',
            confirmLabel: 'Hard Reset',
            onConfirm: async () => {
              await runGitAction(['reset', '--hard', hash], `Hard-Reset auf ${shortHash} erfolgreich.`);
            },
          });
        },
      },
      {
        label: `Interaktiver Rebase bis ${shortHash}`,
        icon: 'IR',
        action: () => {
          const currentLayout = layout;
          if (!currentLayout) return;

          const selectedNode = currentLayout.nodes.find(candidate => candidate.commit.hash === hash);
          if (!selectedNode) {
            setToast({ msg: 'Ausgewaehlter Commit wurde nicht gefunden.', isError: true });
            return;
          }

          if (selectedNode.commit.parentHashes.length === 0) {
            setToast({ msg: 'Root-Commit kann nicht interaktiv gerebased werden.', isError: true });
            return;
          }

          const headPath = currentLayout.nodes.filter(candidate => reachableFromHead.has(candidate.commit.hash));
          const selectedIndex = headPath.findIndex(candidate => candidate.commit.hash === hash);
          if (selectedIndex < 0) {
            setToast({ msg: 'Commit liegt nicht auf dem aktuellen HEAD-Pfad.', isError: true });
            return;
          }

          const rangeNewestFirst = headPath.slice(0, selectedIndex + 1);
          if (rangeNewestFirst.some(candidate => candidate.isMerge)) {
            setToast({ msg: 'Interaktiver Rebase mit Merge-Commits wird hier nicht unterstuetzt.', isError: true });
            return;
          }

          const rangeOldestFirst = [...rangeNewestFirst].reverse();
          const defaultTodo = rangeOldestFirst
            .map(candidate => `pick ${candidate.commit.hash} ${candidate.commit.subject}`)
            .join('\n');

          const baseHash = selectedNode.commit.parentHashes[0];

          setInputDialog({
            title: 'Interaktiven Rebase starten',
            message: 'Bearbeite die Rebase-Todo-Liste (pick/reword/edit/squash/fixup/drop).',
            fields: [
              {
                id: 'todo',
                label: 'Rebase Todo',
                defaultValue: defaultTodo,
                required: true,
                multiline: true,
                helperText: 'Eine Zeile pro Commit, z.B. "pick <hash> <message>"',
              },
            ],
            contextItems: [
              { label: 'Basis', value: baseHash.slice(0, 8) },
              { label: 'Commit-Anzahl', value: String(rangeOldestFirst.length) },
            ],
            irreversible: false,
            consequences: 'Commits werden lokal umgeschrieben. Bei Konflikten Rebase continue/abort im Working Directory nutzen.',
            confirmLabel: 'Rebase starten',
            onSubmit: async (values) => {
              const lines = (values.todo || '')
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(Boolean);

              if (lines.length === 0 || !window.electronAPI) return;

              const result = await window.electronAPI.startInteractiveRebase(baseHash, lines);
              if (!result.success) {
                setToast({ msg: result.error || 'Interaktiver Rebase fehlgeschlagen.', isError: true });
                return;
              }

              setToast({ msg: 'Interaktiver Rebase gestartet.', isError: false });
              refreshCommits();
              refreshWorkingTreeStatus();
            },
          });
        },
      },
      {
        label: '', icon: '', separator: true, action: () => {},
      },
      {
        label: 'Commit-Hash kopieren',
        icon: 'ID',
        action: () => {
          navigator.clipboard.writeText(hash);
          setToast({ msg: 'Hash kopiert!', isError: false });
        },
      },
    ];

    if (isMerge) {
      actions.splice(5, 0, {
        label: `Revert Merge ${shortHash}`,
        icon: 'MR',
        action: () => {
          setConfirmDialog({
            variant: 'confirm',
            title: 'Merge-Revert ausfuehren?',
            message: 'Der Merge-Commit wird mit Parent 1 als Hauptlinie reverted.',
            contextItems: [
              { label: 'Merge-Commit', value: shortHash },
              { label: 'Parent', value: '1' },
            ],
            irreversible: false,
            consequences: 'Es entsteht ein neuer Revert-Commit und moegliche Konflikte muessen geloest werden.',
            confirmLabel: 'Merge-Revert',
            onConfirm: async () => {
              await runGitAction(['revert', '-m', '1', '--no-edit', hash], `Merge-Revert von ${shortHash} erfolgreich.`);
            },
          });
        },
      });
    }

    return actions;
  };

  const formatCommitDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return formatTime(d, locale, { hour: '2-digit', minute: '2-digit' });
      }
      if (diffDays < 7) return formatRelativeTime(d, locale, now);
      return formatDate(d, locale, { day: '2-digit', month: 'short' });
    } catch { return ''; }
  };

  const formatCommitStats = (files: number, additions: number, deletions: number) => {
    if (files === 0 && additions === 0 && deletions === 0) {
      return '0f +0 -0';
    }
    return `${files}f +${additions} -${deletions}`;
  };

  if (!repoPath) {
    return <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>{tr('Bitte waehle ein Repository aus, um den Graphen zu sehen.', 'Please select a repository to view the graph.')}</div>;
  }
  if (loading) {
    return (
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: 1 - i * 0.09 }}>
            <div className="skeleton-circle" style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0 }} />
            <div className="skeleton-line" style={{ height: 10, width: `${45 + (i % 3) * 15}%`, borderRadius: 4 }} />
            <div className="skeleton-line" style={{ height: 10, width: 70, borderRadius: 4, marginLeft: 'auto', flexShrink: 0 }} />
          </div>
        ))}
      </div>
    );
  }
  if (!layout || layout.nodes.length === 0) {
    return (
      <EmptyState
        title={tr('Keine Commits gefunden.', 'No commits found.')}
        description={tr('Erstelle deinen ersten Commit im Staging-Bereich.', 'Create your first commit in the staging area.')}
      />
    );
  }

  const hasWorkingTreeChanges = Boolean(
    workingTreeStatus &&
    (workingTreeStatus.staged.length > 0 || workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0)
  );
  const workingTreeRowOffset = hasWorkingTreeChanges ? 1 : 0;
  const graphWidth = Math.max((layout.maxLane + 1) * LANE_WIDTH + GRAPH_PADDING * 2, 60);
  const totalHeight = (layout.nodes.length + workingTreeRowOffset) * ROW_HEIGHT;
  const laneX = (lane: number) => GRAPH_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;

  const OVERSCAN = 8;
  const visibleStartIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT - workingTreeRowOffset) - OVERSCAN);
  const visibleEndIdx = Math.min(layout.nodes.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT - workingTreeRowOffset) + OVERSCAN);
  const visibleNodes = layout.nodes.slice(visibleStartIdx, visibleEndIdx);
  const topSpacerHeight = visibleStartIdx * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (layout.nodes.length - visibleEndIdx) * ROW_HEIGHT);
  const visibleEdges = layout.edges.filter(
    (e) => Math.min(e.fromRow, e.toRow) <= visibleEndIdx && Math.max(e.fromRow, e.toRow) >= visibleStartIdx
  );
  const nodeByHash = new Map(layout.nodes.map(node => [node.commit.hash, node]));
  const headNode = layout.nodes.find(node => (
    node.commit.refs.some(ref => ref.startsWith('HEAD ->') || ref === 'HEAD')
  )) ?? layout.nodes[0];
  const reachableFromHead = new Set<string>();
  const workingTreeLabel = !workingTreeStatus ? ''
    : workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0
      ? 'Uncommitted Changes'
      : 'Staged Changes';
  const workingTreeCount = !workingTreeStatus ? 0
    : workingTreeStatus.staged.length + workingTreeStatus.unstaged.length + workingTreeStatus.untracked.length;
  const isWorkingTreeSelected = hasWorkingTreeChanges && selectedHash === null;

  if (headNode) {
    const stack = [headNode.commit.hash];
    while (stack.length > 0) {
      const hash = stack.pop();
      if (!hash || reachableFromHead.has(hash)) continue;
      reachableFromHead.add(hash);
      const currentNode = nodeByHash.get(hash);
      if (!currentNode) continue;
      currentNode.commit.parentHashes.forEach(parentHash => {
        if (nodeByHash.has(parentHash) && !reachableFromHead.has(parentHash)) {
          stack.push(parentHash);
        }
      });
    }
  }

  const buildEdgePath = (edge: GraphEdge): string => {
    const x1 = laneX(edge.fromLane);
    const y1 = (edge.fromRow + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2;
    const x2 = laneX(edge.toLane);
    const y2 = Math.min((edge.toRow + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2, totalHeight);

    if (x1 === x2) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    const verticalSpan = Math.max(8, y2 - y1);
    const turnY = y1 + Math.min(ROW_HEIGHT * 0.8, Math.max(10, verticalSpan * 0.42));
    const direction = x2 > x1 ? 1 : -1;
    const controlInset = Math.min(14, Math.abs(x2 - x1) * 0.45);

    return `M ${x1} ${y1} L ${x1} ${turnY} C ${x1 + direction * controlInset} ${turnY}, ${x2 - direction * controlInset} ${turnY}, ${x2} ${turnY} L ${x2} ${y2}`;
  };

  const isSecondaryCommit = (hash: string) => !reachableFromHead.has(hash);

  const getEdgeStroke = (edge: GraphEdge) => {
    const fromNode = layout.nodes[edge.fromRow];
    if (!fromNode) return edge.color;
    if (!showSecondaryHistory || !isSecondaryCommit(fromNode.commit.hash)) {
      return edge.color;
    }
    return edge.kind === 'merge' ? SECONDARY_GRAPH_ACCENT : edge.color;
  };

  return (
    <>
      <div className="commit-search-toolbar" style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-darker)', borderBottom: '1px solid var(--border-color)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {activeSearchPanel === 'commits' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {tr('Suchmodus:', 'Search mode:')}
                <select
                  value={activeSearchPanel}
                  onChange={(e) => {
                    const mode = e.target.value as SearchPanel;
                    setActiveSearchPanel(mode);
                    if (mode === 'forensic') setForensicError(null);
                  }}
                  style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.78rem' }}
                >
                  <option value="commits">{tr('Commit-Suche', 'Commit search')}</option>
                  <option value="forensic">{tr('Forensische Historie', 'Forensic history')}</option>
                </select>
              </label>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {tr('Feld:', 'Field:')}
                <select
                  value={searchScope}
                  onChange={(e) => setSearchScope(e.target.value as SearchScope)}
                  style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.78rem' }}
                >
                  {(Object.keys(searchScopeLabels) as SearchScope[]).map((scope) => (
                    <option key={scope} value={scope}>{searchScopeLabels[scope]}</option>
                  ))}
                </select>
              </label>
              <input
                className="commit-search-input" style={{ flex: 1, minWidth: '240px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.82rem' }}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr('Commits durchsuchen (Hash, Autor, Nachricht, Ref)', 'Search commits (hash, author, message, ref)')}
              />
              <button
                className="commit-search-nav"
                style={{ border: '1px solid var(--border-color)', backgroundColor: showRecoveryCenter ? 'var(--accent-primary-soft)' : 'var(--bg-panel)', color: showRecoveryCenter ? 'var(--text-accent)' : 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                onClick={onToggleRecoveryCenter}
              >
                {showRecoveryCenter ? tr('Verlauf', 'History') : tr('Recovery Center', 'Recovery Center')}
              </button>
              {normalizedSearch && (
                <div className="commit-search-meta" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  <span>{matchedNodes.length} {tr('Treffer', 'matches')}</span>
                  <button className="commit-search-nav" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem' }} onClick={() => jumpToMatch(-1)} disabled={matchedNodes.length === 0}>{tr('Zurueck', 'Prev')}</button>
                  <button className="commit-search-nav" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem' }} onClick={() => jumpToMatch(1)} disabled={matchedNodes.length === 0}>{tr('Weiter', 'Next')}</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>


      <div style={{ borderBottom: '1px solid var(--border-color)', padding: '8px', display: activeSearchPanel === 'forensic' ? 'flex' : 'none', flexDirection: 'column', gap: '8px', background: 'var(--bg-dark)' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {tr('Suchmodus:', 'Search mode:')}
            <select
              value={activeSearchPanel}
              onChange={(e) => {
                const mode = e.target.value as SearchPanel;
                setActiveSearchPanel(mode);
                if (mode === 'forensic') setForensicError(null);
              }}
              style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.78rem' }}
            >
              <option value="commits">{tr('Commit-Suche', 'Commit search')}</option>
              <option value="forensic">{tr('Forensische Historie', 'Forensic history')}</option>
            </select>
          </label>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {tr('Forensik-Modus:', 'Forensics mode:')}
            <select
              value={forensicType}
              onChange={(e) => {
                setForensicType(e.target.value as ForensicSearchType);
                setForensicError(null);
              }}
              style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.78rem' }}
            >
              {(Object.keys(forensicSearchTypeLabels) as ForensicSearchType[]).map((type) => (
                <option key={type} value={type}>{forensicSearchTypeLabels[type]}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={forensicPath}
            onChange={(e) => setForensicPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runForensicSearch(); }}
            list="forensic-path-suggestions"
            placeholder={tr('Dateipfad (z.B. src/components/CommitGraph.tsx)', 'File path (e.g. src/components/CommitGraph.tsx)')}
            style={{ flex: 1, minWidth: 260, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem' }}
          />
          <datalist id="forensic-path-suggestions">
            {forensicPathSuggestions.map((pathValue) => (
              <option key={pathValue} value={pathValue} />
            ))}
          </datalist>
          {forensicType === 'line' ? (
            <>
              <input type="number" min={1} value={forensicStartLine} onChange={(e) => setForensicStartLine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runForensicSearch(); }} placeholder={tr('Startzeile', 'Start line')} style={{ width: 120, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem' }} />
              <input type="number" min={1} value={forensicEndLine} onChange={(e) => setForensicEndLine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runForensicSearch(); }} placeholder={tr('Endzeile', 'End line')} style={{ width: 120, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem' }} />
            </>
          ) : (
            <input
              type="text"
              value={forensicValue}
              onChange={(e) => setForensicValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void runForensicSearch(); }}
              placeholder={forensicType === 'regex' ? tr('Regex-Muster (git -G)', 'Regex pattern (git -G)') : tr('Suchstring im Dateiinhalt (git -S)', 'Search string in file content (git -S)')}
              style={{ flex: 1, minWidth: 220, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem' }}
            />
          )}
          <button onClick={() => void runForensicSearch()} disabled={forensicLoading} style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>
            {forensicLoading ? tr('Suche...', 'Searching...') : tr('Forensisch suchen', 'Run forensic search')}
          </button>
        </div>
        {forensicError && <div style={{ fontSize: '0.76rem', color: 'var(--status-danger)' }}>{forensicError}</div>}
        {forensicResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 180, overflowY: 'auto' }}>
            {forensicResults.map((node) => (
              <div key={`forensic-${node.commit.hash}`} style={{ border: '1px solid var(--border-color)', borderRadius: 6, backgroundColor: 'var(--bg-panel)', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => onSelectCommit?.(node.commit.hash)} style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'monospace' }}>{node.commit.abbrevHash}</button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{node.commit.subject}</span>
                <button onClick={() => onOpenDiff?.({ source: 'commit', path: forensicPath.trim(), commitHash: node.commit.hash, title: `${node.commit.abbrevHash} · ${forensicPath.trim()}` })} style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', borderRadius: 4, padding: '3px 6px', fontSize: '0.72rem', cursor: 'pointer' }}>{tr('Diff', 'Diff')}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={logContainerRef} className="commit-graph-container">
        <svg
          width={graphWidth}
          height={totalHeight}
          className="commit-graph-svg"
        >
          {Array.from({ length: layout.maxLane + 1 }).map((_, lane) => {
            const x = laneX(lane);
            return (
              <line
                key={`lane-${lane}`}
                x1={x}
                y1={0}
                x2={x}
                y2={totalHeight}
                stroke="var(--line-subtle)"
                strokeWidth={1}
              />
            );
          })}
          {hasWorkingTreeChanges && headNode && (
            <>
              <path
                d={`M ${laneX(headNode.lane)} ${ROW_HEIGHT / 2} L ${laneX(headNode.lane)} ${ROW_HEIGHT + ROW_HEIGHT / 2}`}
                stroke={headNode.color}
                strokeWidth={5}
                strokeOpacity={0.1}
                fill="none"
                strokeLinecap="round"
              />
              <path
                d={`M ${laneX(headNode.lane)} ${ROW_HEIGHT / 2} L ${laneX(headNode.lane)} ${ROW_HEIGHT + ROW_HEIGHT / 2}`}
                stroke={headNode.color}
                strokeWidth={2.2}
                strokeOpacity={0.92}
                fill="none"
                strokeLinecap="round"
              />
              <circle
                cx={laneX(headNode.lane)}
                cy={ROW_HEIGHT / 2}
                r={NODE_RADIUS + 2}
                fill="var(--bg-darker)"
                stroke="var(--status-warning)"
                strokeWidth={2.2}
              />
            </>
          )}
          {visibleEdges.map((edge, i) => (
            <path
              key={`eg${i}`}
              d={buildEdgePath(edge)}
              stroke={getEdgeStroke(edge)}
              strokeWidth={edge.kind === 'merge' ? 2.8 : 3.2}
              strokeOpacity={0.1}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={edge.kind === 'merge' ? '4 4' : undefined}
            />
          ))}
          {visibleEdges.map((edge, i) => (
            <path
              key={`em${i}`}
              d={buildEdgePath(edge)}
              stroke={getEdgeStroke(edge)}
              strokeWidth={edge.kind === 'merge' ? 1.35 : 1.9}
              strokeOpacity={edge.kind === 'merge' ? 0.86 : 0.97}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={edge.kind === 'merge' ? '4 4' : undefined}
            />
          ))}
          {visibleNodes.map((node) => {
            const cx = laneX(node.lane);
            const cy = (node.row + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2;
            const isSelected = selectedHash === node.commit.hash;
            const r = node.isMerge ? MERGE_NODE_RADIUS : NODE_RADIUS;
            const fillColor = node.color;

            return (
              <g key={node.commit.hash}>
                {isSelected && (
                  <circle
                    cx={cx} cy={cy} r={r + 6}
                    fill={fillColor} opacity={0.15}
                  />
                )}
                {isSelected && (
                  <circle
                    cx={cx} cy={cy} r={r + 3}
                    fill="none" stroke={fillColor} strokeWidth={1.5} opacity={0.6}
                  />
                )}
                {node.isMerge && (
                  <>
                    <rect
                      x={cx - r}
                      y={cy - r}
                      width={r * 2}
                      height={r * 2}
                      transform={`rotate(45 ${cx} ${cy})`}
                      fill={fillColor}
                      stroke="var(--bg-darker)"
                      strokeWidth={2.5}
                      rx={1.5}
                    />
                    <circle cx={cx} cy={cy} r={r * 0.34} fill="var(--bg-darker)" />
                  </>
                )}
                {!node.isMerge && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={fillColor}
                    stroke="var(--bg-darker)"
                    strokeWidth={2.5}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {hasWorkingTreeChanges && (
          <div
            className={`commit-row working-tree-row ${isWorkingTreeSelected ? 'selected' : ''}`}
            onClick={() => onSelectCommit && onSelectCommit(null)}
            style={{ height: ROW_HEIGHT, paddingLeft: graphWidth }}
          >
            <div className="commit-info">
              <span className="commit-hash">WORKDIR</span>
              <div className="commit-main">
                <div className="commit-refs">
                  {workingTreeStatus!.staged.length > 0 && (
                    <span className="branch-label tag">
                      {workingTreeStatus!.staged.length} staged
                    </span>
                  )}
                  {workingTreeStatus!.unstaged.length > 0 && (
                    <span className="branch-label working-tree">
                      {workingTreeStatus!.unstaged.length} unstaged
                    </span>
                  )}
                  {workingTreeStatus!.untracked.length > 0 && (
                    <span className="branch-label remote">
                      {workingTreeStatus!.untracked.length} untracked
                    </span>
                  )}
                </div>
                <div className="commit-subject-row">
                  <span className="commit-subject">{workingTreeLabel}</span>
                  <span className="commit-meta">
                    <span className="commit-author">{tr('Klicken zum Stage / Commit', 'Click to stage / commit')}</span>
                    <span className="commit-date">{workingTreeCount}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} aria-hidden="true" />}
        {visibleNodes.map((node) => {
          const isSelected = selectedHash === node.commit.hash;
          const isSecondary = isSecondaryCommit(node.commit.hash);
          const isSearchMatch = normalizedSearch ? matchedHashSet.has(node.commit.hash) : false;
          const sortedRefs = sortRefs(node.commit.refs);
          return (
            <div
              key={node.commit.hash}
              className={`commit-row ${isSelected ? 'selected' : ''} ${showSecondaryHistory && isSecondary ? 'secondary-history' : ''}`}
              onClick={() => onSelectCommit && onSelectCommit(node.commit.hash)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              style={{ height: ROW_HEIGHT, paddingLeft: graphWidth, ...(isSearchMatch ? { boxShadow: 'inset 0 0 0 1px var(--accent-primary-strong)' } : {}) }}
              data-commit-hash={node.commit.hash}
            >
              <div className="commit-info">
                <span className="commit-hash">{node.commit.abbrevHash}</span>
                <div className="commit-main">
                  {sortedRefs.length > 0 && (
                    <div className="commit-refs">
                      {sortedRefs.map((ref, ri) => (
                        <span key={ri} className={`branch-label ${getRefKind(ref)}`}>
                          {ref}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="commit-subject-row">
                    <span className="commit-subject">{node.commit.subject}</span>
                    <span className="commit-meta">
                      <span className="commit-author">{node.commit.author}</span>
                      <span className="commit-stats" title={`${node.commit.stats.files} files changed, ${node.commit.stats.additions} additions, ${node.commit.stats.deletions} deletions`}>
                        {formatCommitStats(node.commit.stats.files, node.commit.stats.additions, node.commit.stats.deletions)}
                      </span>
                      <span className="commit-date">{formatCommitDate(node.commit.date)}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />}
        {(loadingMore || hasMoreCommits) && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 18px', paddingLeft: graphWidth }}>
            <button
              type="button"
              onClick={() => loadMoreCommits()}
              disabled={loadingMore}
              style={{
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.78rem',
                cursor: loadingMore ? 'default' : 'pointer',
                opacity: loadingMore ? 0.7 : 1,
              }}
            >
              {loadingMore ? 'Lade weitere Commits...' : 'Mehr laden'}
            </button>
          </div>
        )}
      </div>

      {contextMenu && (() => {
        const menuActions = getMenuActions(contextMenu.node);
        const primaryMenu = menuActions.slice(0, 4);
        const tailMenu = menuActions.slice(4);
        const showMergePanel = Boolean(mergeContextPayload && onMergeBranch && currentBranch);

        const renderMenuRow = (item: MenuAction, idx: number) => {
          if (item.separator) {
            return <div key={`sep-${idx}`} className="ctx-menu-sep" />;
          }
          return (
            <button
              key={`act-${idx}`}
              type="button"
              className={`ctx-menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => { setContextMenu(null); item.action(); }}
            >
              <span className="ctx-menu-icon">{item.icon}</span>
              {item.label}
            </button>
          );
        };

        return (
          <div
            className="ctx-menu-backdrop"
            onClick={(e) => { e.stopPropagation(); setContextMenu(null); }}
          >
            <div
              className="ctx-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ctx-menu-header">
                {contextMenu.node.commit.abbrevHash} - {contextMenu.node.commit.subject.slice(0, 30)}{contextMenu.node.commit.subject.length > 30 ? '...' : ''}
              </div>
              {primaryMenu.map(renderMenuRow)}
              {showMergePanel && mergeContextPayload && (
                <div className="ctx-menu-merge-wrap">
                  <button
                    type="button"
                    className="ctx-menu-merge-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMergeCtxExpanded(v => !v);
                    }}
                  >
                    {mergeCtxExpanded
                      ? <ChevronDown size={14} className="ctx-menu-merge-chevron" />
                      : <ChevronRight size={14} className="ctx-menu-merge-chevron" />}
                    {tr('In aktuellen Branch mergen', 'Merge into current branch')}
                  </button>
                  {mergeCtxExpanded && (
                    <div className="ctx-menu-merge-body">
                      <div className="ctx-menu-merge-group">
                        <div className="ctx-menu-merge-group-label">{tr('Dieser Commit', 'This commit')}</div>
                        <button
                          type="button"
                          className="ctx-menu-merge-item"
                          onClick={() => {
                            setContextMenu(null);
                            const { hash, shortHash } = mergeContextPayload;
                            setConfirmDialog({
                              variant: 'confirm',
                              title: tr('Commit mergen?', 'Merge commit?'),
                              message: tr(
                                'git merge fuegt diesen Commit-Stand in den aktuellen Branch ein (ggf. Merge-Commit).',
                                'git merge merges this commit into the current branch (may create a merge commit).',
                              ),
                              contextItems: [
                                { label: tr('Commit', 'Commit'), value: shortHash },
                                { label: tr('Befehl', 'Command'), value: `git merge ${hash}` },
                              ],
                              irreversible: false,
                              consequences: tr(
                                'Bei Konflikten loest du sie im Working Directory und setzt den Merge fort.',
                                'If conflicts occur, resolve them in the working tree and continue the merge.',
                              ),
                              confirmLabel: tr('Merge starten', 'Start merge'),
                              onConfirm: async () => {
                                await runGitAction(
                                  ['merge', hash],
                                  tr(`Merge von ${shortHash} abgeschlossen.`, `Merge of ${shortHash} completed.`),
                                );
                              },
                            });
                          }}
                        >
                          {tr('Merge', 'Merge')} {mergeContextPayload.shortHash}
                          <span className="ctx-menu-merge-item-hint">
                            {tr('git merge (Commit-Hash)', 'git merge (commit hash)')}
                          </span>
                        </button>
                      </div>
                      {mergeContextPayload.refsHere.length > 0 && (
                        <div className="ctx-menu-merge-group">
                          <div className="ctx-menu-merge-group-label">{tr('Refs auf diesem Commit', 'Refs at this commit')}</div>
                          {mergeContextPayload.refsHere.map(ref => (
                            <button
                              key={ref}
                              type="button"
                              className="ctx-menu-merge-item"
                              onClick={() => {
                                setContextMenu(null);
                                if (onMergeBranch) onMergeBranch(ref, 'default');
                              }}
                            >
                              {ref}
                              <span className="ctx-menu-merge-item-hint">
                                {tr('Branch-Ref mergen', 'Merge branch ref')}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {mergeContextPayload.branchExtras.length > 0 && (
                        <div className="ctx-menu-merge-group">
                          <div className="ctx-menu-merge-group-label">{tr('Weitere Branches', 'More branches')}</div>
                          {mergeContextPayload.branchExtras.map(row => (
                            <button
                              key={row.raw}
                              type="button"
                              className="ctx-menu-merge-item"
                              onClick={() => {
                                setContextMenu(null);
                                if (onMergeBranch) onMergeBranch(row.raw, 'default');
                              }}
                            >
                              {row.label}
                              <span className="ctx-menu-merge-item-hint">
                                {row.scope === 'remote' ? tr('Remote-Tracking', 'Remote-tracking') : tr('Lokal', 'Local')}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {tailMenu.map(renderMenuRow)}
            </div>
          </div>
        );
      })()}

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
    </>
  );
};
