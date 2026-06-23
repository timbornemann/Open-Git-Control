import React, { useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  isMergeInProgressError,
  mergeTargetFromDecoratedRef,
  mergeableDecoratedRefs,
  normalizeBranchRefForMerge,
  parseRemoteBranchRef,
  parseGitLog,
  resolveConflictPathAfterGitFailure,
  type GitStatusDetailed,
} from '../utils/gitParsing';
import { validateBranchName } from '../utils/gitRefValidation';
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
  navigationRequest?: { hash: string; requestId: number } | null;
  refreshTrigger?: number;
  commitRefreshTrigger?: number;
  showSecondaryHistory?: boolean;
  onOpenDiff?: (request: DiffRequest) => void;
  showRecoveryCenter?: boolean;
  onToggleRecoveryCenter?: () => void;
  currentBranch?: string;
  branches?: BranchInfo[];
  onMergeBranch?: (branchName: string, mode: GitMergeMode) => void;
  onRunGitCommand?: (args: string[], successMsg: string, actionLabel?: string) => Promise<boolean>;
  /** Wenn ein Git-Befehl hier direkt fehlschlaegt (Fallback ohne zentralen Runner), Konflikt-Resolver oeffnen */
  onOpenConflictResolverForPath?: (path: string) => void;
  workingTreeStatus?: GitStatusDetailed | null;
  onRefreshWorkingTree?: () => Promise<void>;
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

type ContextMenuPlacement = {
  left: number;
  top: number;
  maxHeight: number;
  ready: boolean;
};

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

const resolveHighlightableBranchRef = (ref: string): string | null => {
  const target = mergeTargetFromDecoratedRef(ref);
  if (!target) return null;
  const normalized = normalizeBranchRefForMerge(target.trim());
  if (!normalized || normalized.endsWith('/HEAD')) return null;
  return normalized;
};

const graphEdgeKey = (edge: GraphEdge) => (
  `${edge.fromRow}:${edge.fromLane}->${edge.toRow}:${edge.toLane}:${edge.kind}`
);

const buildGraphHighlightData = (
  layout: ReturnType<typeof useCommitGraphData>['layout'],
  currentBranch: string,
  selectedHash: string | null | undefined,
  highlightedBranchRef: string | null,
) => {
  const nodes = layout?.nodes || [];
  const nodeByHash = new Map(nodes.map((node) => [node.commit.hash, node]));
  const headNode = nodes.find((node) => (
    node.commit.refs.some((ref) => ref.startsWith('HEAD ->') || ref === 'HEAD')
  )) ?? nodes[0];
  const reachableFromHead = new Set<string>();

  if (headNode) {
    const stack = [headNode.commit.hash];
    while (stack.length > 0) {
      const hash = stack.pop();
      if (!hash || reachableFromHead.has(hash)) continue;
      reachableFromHead.add(hash);
      const currentNode = nodeByHash.get(hash);
      if (!currentNode) continue;
      currentNode.commit.parentHashes.forEach((parentHash) => {
        if (nodeByHash.has(parentHash) && !reachableFromHead.has(parentHash)) {
          stack.push(parentHash);
        }
      });
    }
  }

  const branchTipByRef = new Map<string, GraphNode>();
  for (const node of nodes) {
    for (const ref of node.commit.refs) {
      const target = resolveHighlightableBranchRef(ref);
      if (!target || branchTipByRef.has(target)) continue;
      branchTipByRef.set(target, node);
    }
  }

  const headArrow = headNode?.commit.refs.find((ref) => ref.startsWith('HEAD ->'));
  const headBranchFromGraph = headArrow ? resolveHighlightableBranchRef(headArrow) || '' : '';
  const normalizedCurrentBranch = normalizeBranchRefForMerge((headBranchFromGraph || currentBranch).trim());
  const buildFirstParentPath = (startNode: GraphNode | undefined) => {
    const path = new Set<string>();
    let cursor = startNode;
    while (cursor && !path.has(cursor.commit.hash)) {
      path.add(cursor.commit.hash);
      const firstParent = cursor.commit.parentHashes[0];
      if (!firstParent) break;
      cursor = nodeByHash.get(firstParent);
    }
    return path;
  };

  const manualHighlightedBranch = highlightedBranchRef && branchTipByRef.has(highlightedBranchRef)
    ? highlightedBranchRef
    : null;
  const defaultHighlightedBranch = normalizedCurrentBranch && branchTipByRef.has(normalizedCurrentBranch)
    ? normalizedCurrentBranch
    : null;
  const activeHighlightedBranch = manualHighlightedBranch ?? defaultHighlightedBranch;
  const currentPathHashes = activeHighlightedBranch
    ? buildFirstParentPath(branchTipByRef.get(activeHighlightedBranch))
    : new Set<string>();
  const selectedNode = selectedHash ? nodeByHash.get(selectedHash) : undefined;
  const selectedBranchTarget = selectedNode
    ? sortRefs(selectedNode.commit.refs)
      .map(resolveHighlightableBranchRef)
      .find((target): target is string => Boolean(target && branchTipByRef.has(target)))
    : undefined;

  const inferTipForSelectedCommit = (hash: string) => {
    let best: { tip: GraphNode; distance: number } | null = null;
    for (const tip of branchTipByRef.values()) {
      let cursor: GraphNode | undefined = tip;
      let distance = 0;
      const visited = new Set<string>();
      while (cursor && !visited.has(cursor.commit.hash)) {
        visited.add(cursor.commit.hash);
        if (cursor.commit.hash === hash) {
          if (!best || distance < best.distance) best = { tip, distance };
          break;
        }
        const firstParent = cursor.commit.parentHashes[0];
        if (!firstParent) break;
        cursor = nodeByHash.get(firstParent);
        distance += 1;
      }
    }
    return best?.tip;
  };
  const selectedPathStartNode = selectedBranchTarget
    ? branchTipByRef.get(selectedBranchTarget)
    : selectedNode
      ? (inferTipForSelectedCommit(selectedNode.commit.hash) ?? selectedNode)
      : undefined;
  const selectedPathHashes = buildFirstParentPath(selectedPathStartNode);
  const hasCurrentPathHighlight = currentPathHashes.size > 0;
  const hasSelectedPathHighlight = selectedPathHashes.size > 0;
  const currentPathColor = headNode && hasCurrentPathHighlight
    ? (branchTipByRef.get(activeHighlightedBranch || '')?.color ?? headNode.color)
    : headNode?.color ?? 'var(--accent-primary)';
  const selectedPathColor = hasSelectedPathHighlight
    ? (selectedPathStartNode?.color ?? currentPathColor)
    : currentPathColor;
  const buildPathEdgeKeys = (pathHashes: Set<string>) => {
    const keys = new Set<string>();
    if (!layout || pathHashes.size === 0) return keys;
    for (const edge of layout.edges) {
      if (edge.toRow < 0 || edge.toRow >= nodes.length) continue;
      const fromNode = nodes[edge.fromRow];
      const toNode = nodes[edge.toRow];
      if (!fromNode || !toNode) continue;
      if (!pathHashes.has(fromNode.commit.hash) || !pathHashes.has(toNode.commit.hash)) continue;
      if (fromNode.commit.parentHashes[0] !== toNode.commit.hash) continue;
      keys.add(graphEdgeKey(edge));
    }
    return keys;
  };

  return {
    nodeByHash,
    headNode,
    reachableFromHead,
    branchTipByRef,
    activeHighlightedBranch,
    currentPathHashes,
    selectedPathHashes,
    hasCurrentPathHighlight,
    hasSelectedPathHighlight,
    hasAnyPathHighlight: hasCurrentPathHighlight || hasSelectedPathHighlight,
    currentPathColor,
    selectedPathColor,
    currentPathEdgeKeys: buildPathEdgeKeys(currentPathHashes),
    selectedPathEdgeKeys: buildPathEdgeKeys(selectedPathHashes),
  };
};

export const CommitGraph: React.FC<CommitGraphProps> = ({
  repoPath,
  onSelectCommit,
  selectedHash,
  navigationRequest,
  refreshTrigger,
  commitRefreshTrigger,
  showSecondaryHistory = true,
  onOpenDiff,
  showRecoveryCenter = false,
  onToggleRecoveryCenter,
  currentBranch = '',
  branches = [],
  onMergeBranch,
  onRunGitCommand,
  onOpenConflictResolverForPath,
  workingTreeStatus: externalWorkingTreeStatus,
  onRefreshWorkingTree,
}) => {
  const { locale, tr } = useI18n();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuPlacement, setContextMenuPlacement] = useState<ContextMenuPlacement | null>(null);
  const [mergeCtxExpanded, setMergeCtxExpanded] = useState(false);
  const { toast, setToast } = useToastQueue(4000);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [activeSearchPanel, setActiveSearchPanel] = useState<SearchPanel>('commits');
  const [matchCursor, setMatchCursor] = useState(0);
  const [highlightedBranchRef, setHighlightedBranchRef] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [forensicType, setForensicType] = useState<ForensicSearchType>('string');
  const [forensicPath, setForensicPath] = useState('');
  const [forensicValue, setForensicValue] = useState('');
  const [forensicStartLine, setForensicStartLine] = useState('1');
  const [forensicEndLine, setForensicEndLine] = useState('1');
  const [forensicLoading, setForensicLoading] = useState(false);
  const [forensicError, setForensicError] = useState<string | null>(null);
  const [forensicResults, setForensicResults] = useState<GraphNode[]>([]);
  const [forensicPathHistory, setForensicPathHistory] = useState<string[]>([]);
  const didRunInitialBranchEffectRef = useRef(false);
  const navigationAttemptRef = useRef<{ requestId: number; attempts: number } | null>(null);
  const completedNavigationRequestIdRef = useRef<number | null>(null);

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
  const handleRepoCleared = useCallback(() => {
    setForensicResults([]);
    setForensicError(null);
    setForensicLoading(false);
  }, []);
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
    requestCommitStats,
  } = useCommitGraphData({
    repoPath,
    showSecondaryHistory,
    refreshTrigger,
    commitRefreshTrigger,
    logContainerRef,
    onRepoCleared: handleRepoCleared,
    externalWorkingTreeStatus,
    onRefreshWorkingTree,
  });

  const syncViewportMetrics = useCallback((container: HTMLElement) => {
    const nextTop = container.scrollTop;
    const nextHeight = container.clientHeight;
    setScrollTop((previous) => (previous === nextTop ? previous : nextTop));
    // Guard against transient zero-heights during mount/layout transitions.
    if (nextHeight > 0) {
      setContainerHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    }
  }, []);

  useLayoutEffect(() => {
    if (!layout) return;
    const container = logContainerRef.current?.parentElement;
    if (!container) return;

    const onScroll = () => {
      syncViewportMetrics(container);
    };
    const onWindowResize = () => {
      syncViewportMetrics(container);
    };

    syncViewportMetrics(container);
    const rafId = window.requestAnimationFrame(() => {
      syncViewportMetrics(container);
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncViewportMetrics(container);
      });
      resizeObserver.observe(container);
    }

    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onWindowResize);

    return () => {
      window.cancelAnimationFrame(rafId);
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onWindowResize);
      resizeObserver?.disconnect();
    };
  }, [layout, repoPath, syncViewportMetrics]);

  useLayoutEffect(() => {
    const container = logContainerRef.current?.parentElement;
    if (!container) return;

    // Hard reset viewport metrics on repository switch so virtualization always
    // starts from the newest commit row at the top.
    container.scrollTop = 0;
    setScrollTop(0);
    const nextHeight = container.clientHeight;
    if (nextHeight > 0) {
      setContainerHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    }
  }, [repoPath]);

  useEffect(() => {
    if (!selectedHash) return;
    void requestCommitStats([selectedHash], 'selected');
  }, [requestCommitStats, selectedHash]);

  useEffect(() => {
    if (!layout) return;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 20);
    const end = Math.min(
      layout.nodes.length,
      Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + 20,
    );
    const hashes = layout.nodes
      .slice(start, end)
      .filter((node) => node.commit.statsState === 'missing' || node.commit.statsState === 'error')
      .map((node) => node.commit.hash);
    if (hashes.length > 0) void requestCommitStats(hashes, 'visible');
  }, [containerHeight, layout, requestCommitStats, scrollTop]);

  useEffect(() => {
    if (!navigationRequest || !layout) return;
    if (completedNavigationRequestIdRef.current === navigationRequest.requestId) return;

    if (navigationAttemptRef.current?.requestId !== navigationRequest.requestId) {
      navigationAttemptRef.current = { requestId: navigationRequest.requestId, attempts: 0 };
    }

    const nodeIndex = layout.nodes.findIndex((node) => node.commit.hash === navigationRequest.hash);
    if (nodeIndex >= 0) {
      const container = logContainerRef.current?.parentElement;
      if (!container) return;

      const workingTreeRowOffset = workingTreeStatus && (
        workingTreeStatus.staged.length > 0
        || workingTreeStatus.unstaged.length > 0
        || workingTreeStatus.untracked.length > 0
      ) ? 1 : 0;
      const rowTop = (nodeIndex + workingTreeRowOffset) * ROW_HEIGHT;
      const targetTop = Math.max(0, rowTop - Math.max(0, (container.clientHeight - ROW_HEIGHT) / 2));
      container.scrollTo({ top: targetTop, behavior: 'smooth' });
      navigationAttemptRef.current = null;
      completedNavigationRequestIdRef.current = navigationRequest.requestId;
      return;
    }

    if (!hasMoreCommits) {
      navigationAttemptRef.current = null;
      completedNavigationRequestIdRef.current = navigationRequest.requestId;
      return;
    }
    if (loadingMore || loading) return;

    const attempts = navigationAttemptRef.current?.attempts ?? 0;
    if (attempts >= 25) {
      navigationAttemptRef.current = null;
      completedNavigationRequestIdRef.current = navigationRequest.requestId;
      return;
    }

    navigationAttemptRef.current = {
      requestId: navigationRequest.requestId,
      attempts: attempts + 1,
    };
    void loadMoreCommits();
  }, [
    hasMoreCommits,
    layout,
    loadMoreCommits,
    loading,
    loadingMore,
    navigationRequest,
    workingTreeStatus,
  ]);

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
    setHighlightedBranchRef(null);
  }, [repoPath, currentBranch]);

  useEffect(() => {
    if (!repoPath) {
      didRunInitialBranchEffectRef.current = false;
      return;
    }
    if (!didRunInitialBranchEffectRef.current) {
      didRunInitialBranchEffectRef.current = true;
      return;
    }
    void refreshCommits('sync');
    void refreshWorkingTreeStatus();
  }, [currentBranch, refreshCommits, refreshWorkingTreeStatus, repoPath]);

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

  const updateContextMenuPlacement = useCallback(() => {
    if (!contextMenu || !contextMenuRef.current) return;

    const margin = 8;
    const menu = contextMenuRef.current;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxHeight = Math.max(160, viewportHeight - margin * 2);
    const menuWidth = menu.offsetWidth;
    const fullMenuHeight = Math.max(menu.scrollHeight, menu.offsetHeight);
    const visibleMenuHeight = Math.min(fullMenuHeight, maxHeight);

    const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
    const maxTop = Math.max(margin, viewportHeight - visibleMenuHeight - margin);
    const left = Math.min(Math.max(margin, contextMenu.x), maxLeft);
    const top = Math.min(Math.max(margin, contextMenu.y), maxTop);

    setContextMenuPlacement((current) => {
      if (
        current
        && current.left === left
        && current.top === top
        && current.maxHeight === maxHeight
        && current.ready
      ) {
        return current;
      }
      return { left, top, maxHeight, ready: true };
    });
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu) {
      setContextMenuPlacement(null);
      return;
    }

    updateContextMenuPlacement();
    const frame = window.requestAnimationFrame(updateContextMenuPlacement);
    return () => window.cancelAnimationFrame(frame);
  }, [contextMenu, mergeCtxExpanded, updateContextMenuPlacement]);

  useEffect(() => {
    if (!contextMenu) return;
    window.addEventListener('resize', updateContextMenuPlacement);
    return () => window.removeEventListener('resize', updateContextMenuPlacement);
  }, [contextMenu, updateContextMenuPlacement]);


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
    if (onRunGitCommand) {
      const success = await onRunGitCommand(args, successMsg);
      if (success) {
        refreshCommits();
        refreshWorkingTreeStatus();
      }
      return;
    }

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
    setContextMenuPlacement({
      left: e.clientX,
      top: e.clientY,
      maxHeight: Math.max(160, window.innerHeight - 16),
      ready: false,
    });
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

  const branchNameValidationMessage = useCallback((value: string) => {
    const errorCode = validateBranchName(value);
    if (!errorCode) return null;

    if (errorCode === 'contains-space') {
      return tr(
        'Branch-Name darf keine Leerzeichen enthalten.',
        'Branch name must not contain spaces.',
      );
    }

    return tr(
      'Ungueltiger Branch-Name. Vermeide Sonderzeichen wie ~ ^ : ? * [ \\ sowie .. und @{.',
      'Invalid branch name. Avoid special characters like ~ ^ : ? * [ \\ and patterns like .. or @{.',
    );
  }, [tr]);

  const getMenuActions = (node: GraphNode): MenuAction[] => {
    const hash = node.commit.hash;
    const shortHash = node.commit.abbrevHash;
    const isMerge = node.isMerge;
    const localBranchNames = new Set(
      branches
        .filter(branch => branch.scope === 'local')
        .map(branch => branch.name),
    );
    const checkoutCandidates: { label: string; args: string[]; successMessage: string }[] = [];
    const seenCheckoutTargets = new Set<string>();

    for (const ref of sortRefs(node.commit.refs)) {
      const mergeTarget = mergeTargetFromDecoratedRef(ref);
      if (!mergeTarget) continue;
      const normalizedTarget = mergeTarget.trim();
      if (!normalizedTarget) continue;
      if (normalizedTarget === currentBranch) continue;
      if (normalizedTarget.endsWith('/HEAD')) continue;

      const parsedRemote = parseRemoteBranchRef(normalizedTarget);
      if (parsedRemote) {
        if (localBranchNames.has(parsedRemote.localBranchName)) {
          const localKey = `local:${parsedRemote.localBranchName}`;
          if (!seenCheckoutTargets.has(localKey)) {
            seenCheckoutTargets.add(localKey);
            checkoutCandidates.push({
              label: parsedRemote.localBranchName,
              args: ['checkout', parsedRemote.localBranchName],
              successMessage: `Branch "${parsedRemote.localBranchName}" ausgecheckt.`,
            });
          }
          continue;
        }

        const remoteKey = `remote:${parsedRemote.remoteRef}`;
        if (seenCheckoutTargets.has(remoteKey)) continue;
        seenCheckoutTargets.add(remoteKey);
        checkoutCandidates.push({
          label: parsedRemote.remoteRef,
          args: ['checkout', '--track', parsedRemote.remoteRef],
          successMessage: `Tracking-Branch "${parsedRemote.localBranchName}" aus "${parsedRemote.remoteRef}" ausgecheckt.`,
        });
        continue;
      }

      const localKey = `local:${normalizedTarget}`;
      if (seenCheckoutTargets.has(localKey)) continue;
      seenCheckoutTargets.add(localKey);
      checkoutCandidates.push({
        label: normalizedTarget,
        args: ['checkout', normalizedTarget],
        successMessage: `Branch "${normalizedTarget}" ausgecheckt.`,
      });
    }

    const checkoutRefActions: MenuAction[] = checkoutCandidates.map(candidate => ({
      label: `Branch auschecken: ${candidate.label}`,
      icon: 'CB',
      action: () => {
        void runGitAction(candidate.args, candidate.successMessage);
      },
    }));

    const actions: MenuAction[] = [
      ...checkoutRefActions,
      {
        label: `Neuen Branch von ${shortHash} erstellen...`,
        icon: 'NB',
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
                validate: (value) => branchNameValidationMessage(value.trim()),
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
                validate: (value) => branchNameValidationMessage(value.trim()),
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

  const hasWorkingTreeChanges = Boolean(
    workingTreeStatus &&
    (workingTreeStatus.staged.length > 0 || workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0)
  );
  const workingTreeRowOffset = hasWorkingTreeChanges ? 1 : 0;
  const visibleWindow = useMemo(() => {
    if (!layout) {
      return {
        visibleStartIdx: 0,
        visibleEndIdx: 0,
        visibleNodes: [] as GraphNode[],
        visibleEdges: [] as GraphEdge[],
      };
    }

    const overscan = 8;
    const visibleStartIdx = Math.max(
      0,
      Math.floor(scrollTop / ROW_HEIGHT - workingTreeRowOffset) - overscan,
    );
    const visibleEndIdx = Math.min(
      layout.nodes.length,
      Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT - workingTreeRowOffset) + overscan,
    );
    return {
      visibleStartIdx,
      visibleEndIdx,
      visibleNodes: layout.nodes.slice(visibleStartIdx, visibleEndIdx),
      visibleEdges: layout.edges.filter(
        (edge) => (
          Math.min(edge.fromRow, edge.toRow) <= visibleEndIdx &&
          Math.max(edge.fromRow, edge.toRow) >= visibleStartIdx
        ),
      ),
    };
  }, [containerHeight, layout, scrollTop, workingTreeRowOffset]);
  const highlightData = useMemo(
    () => buildGraphHighlightData(layout, currentBranch, selectedHash, highlightedBranchRef),
    [currentBranch, highlightedBranchRef, layout, selectedHash],
  );
  const {
    visibleStartIdx,
    visibleEndIdx,
    visibleNodes,
    visibleEdges,
  } = visibleWindow;
  const {
    headNode: memoizedHeadNode,
    reachableFromHead,
    branchTipByRef,
    activeHighlightedBranch,
    currentPathHashes,
    selectedPathHashes,
    hasAnyPathHighlight,
    currentPathColor,
    selectedPathColor,
    currentPathEdgeKeys,
    selectedPathEdgeKeys,
  } = highlightData;

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

  const headNode = memoizedHeadNode as GraphNode;
  const graphWidth = Math.max((layout.maxLane + 1) * LANE_WIDTH + GRAPH_PADDING * 2, 60);
  const totalHeight = (layout.nodes.length + workingTreeRowOffset) * ROW_HEIGHT;
  const laneX = (lane: number) => GRAPH_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
  const topSpacerHeight = visibleStartIdx * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (layout.nodes.length - visibleEndIdx) * ROW_HEIGHT);
  const workingTreeLabel = !workingTreeStatus ? ''
    : workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0
      ? 'Uncommitted Changes'
      : 'Staged Changes';
  const workingTreeCount = !workingTreeStatus ? 0
    : workingTreeStatus.staged.length + workingTreeStatus.unstaged.length + workingTreeStatus.untracked.length;
  const isWorkingTreeSelected = hasWorkingTreeChanges && selectedHash === null;

  const buildEdgePath = (edge: GraphEdge): string => {
    const x1 = laneX(edge.fromLane);
    const y1 = (edge.fromRow + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2;
    const x2 = laneX(edge.toLane);
    const y2 = Math.min((edge.toRow + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2, totalHeight);

    if (x1 === x2) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    const verticalSpan = Math.max(8, y2 - y1);
    const turnOffset = Math.min(ROW_HEIGHT * 0.8, Math.max(10, verticalSpan * 0.42));
    // Keep the lane change close to the parent row so branch origins remain visually anchored.
    const rawTurnY = y2 - turnOffset;
    const turnY = Math.max(y1 + 8, Math.min(y2 - 8, rawTurnY));
    const direction = x2 > x1 ? 1 : -1;
    const controlInset = Math.min(14, Math.abs(x2 - x1) * 0.45);

    return `M ${x1} ${y1} L ${x1} ${turnY} C ${x1 + direction * controlInset} ${turnY}, ${x2 - direction * controlInset} ${turnY}, ${x2} ${turnY} L ${x2} ${y2}`;
  };

  const isSecondaryCommit = (hash: string) => !reachableFromHead.has(hash);
  const isEdgeOnCurrentPath = (edge: GraphEdge) => currentPathEdgeKeys.has(graphEdgeKey(edge));
  const isEdgeOnSelectedPath = (edge: GraphEdge) => selectedPathEdgeKeys.has(graphEdgeKey(edge));

  const getBaseEdgeStroke = (edge: GraphEdge) => {
    const fromNode = layout.nodes[edge.fromRow];
    if (!fromNode) return edge.color;
    if (!showSecondaryHistory || !isSecondaryCommit(fromNode.commit.hash)) {
      return edge.color;
    }
    return edge.kind === 'merge' ? SECONDARY_GRAPH_ACCENT : edge.color;
  };

  const getEdgeStroke = (edge: GraphEdge) => {
    const onSelectedPath = isEdgeOnSelectedPath(edge);
    const onCurrentPath = isEdgeOnCurrentPath(edge);
    if (onSelectedPath) return selectedPathColor;
    if (onCurrentPath) return currentPathColor;
    return getBaseEdgeStroke(edge);
  };

  const getEdgeOpacity = (edge: GraphEdge, layer: 'glow' | 'core') => {
    const onSelectedPath = isEdgeOnSelectedPath(edge);
    const onCurrentPath = isEdgeOnCurrentPath(edge);
    if (layer === 'glow') {
      if (onSelectedPath) return 0.18;
      if (onCurrentPath) return 0.14;
      if (hasAnyPathHighlight) return 0.02;
      return 0.08;
    }

    if (onSelectedPath) return 0.88;
    if (onCurrentPath) return 0.8;
    if (hasAnyPathHighlight) return edge.kind === 'merge' ? 0.24 : 0.34;
    return edge.kind === 'merge' ? 0.78 : 0.9;
  };

  const getEdgeWidth = (edge: GraphEdge, layer: 'glow' | 'core') => {
    const onSelectedPath = isEdgeOnSelectedPath(edge);
    const onCurrentPath = isEdgeOnCurrentPath(edge);
    if (layer === 'glow') {
      if (onSelectedPath) return edge.kind === 'merge' ? 3.1 : 3.8;
      if (onCurrentPath) return edge.kind === 'merge' ? 2.8 : 3.5;
      if (hasAnyPathHighlight) return edge.kind === 'merge' ? 1.5 : 1.9;
      return edge.kind === 'merge' ? 2.4 : 2.8;
    }

    if (onSelectedPath) return edge.kind === 'merge' ? 1.9 : 2.5;
    if (onCurrentPath) return edge.kind === 'merge' ? 1.7 : 2.2;
    if (hasAnyPathHighlight) return edge.kind === 'merge' ? 0.9 : 1.2;
    return edge.kind === 'merge' ? 1.25 : 1.7;
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
              strokeWidth={getEdgeWidth(edge, 'glow')}
              strokeOpacity={getEdgeOpacity(edge, 'glow')}
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
              strokeWidth={getEdgeWidth(edge, 'core')}
              strokeOpacity={getEdgeOpacity(edge, 'core')}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={edge.kind === 'merge' ? '4 4' : undefined}
            />
          ))}
          {visibleNodes.map((node) => {
            const cx = laneX(node.lane);
            const cy = (node.row + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2;
            const isSelected = selectedHash === node.commit.hash;
            const isOnCurrentPath = currentPathHashes.has(node.commit.hash);
            const isOnSelectedPath = selectedPathHashes.has(node.commit.hash);
            const isOnAnyFocusedPath = isOnCurrentPath || isOnSelectedPath;
            const isHeadCommit = node.commit.refs.some(ref => ref.startsWith('HEAD ->') || ref === 'HEAD');
            const r = node.isMerge ? MERGE_NODE_RADIUS : NODE_RADIUS;
            const fillColor = node.color;
            const baseOpacity = hasAnyPathHighlight && !isOnAnyFocusedPath && !isSelected ? 0.72 : 1;
            const pathStroke = isOnSelectedPath
              ? selectedPathColor
              : isOnCurrentPath
                ? currentPathColor
                : fillColor;

            return (
              <g key={node.commit.hash}>
                {isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 8}
                    fill={fillColor}
                    opacity={0.16}
                  />
                )}
                {isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 5}
                    fill="none"
                    stroke={fillColor}
                    strokeWidth={2.2}
                    opacity={0.75}
                  />
                )}
                {isHeadCommit && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 5}
                    fill="none"
                    stroke={currentPathColor}
                    strokeWidth={1.8}
                    opacity={0.72}
                  />
                )}
                {isOnAnyFocusedPath && !isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isOnSelectedPath ? r + 4 : r + 3}
                    fill="none"
                    stroke={pathStroke}
                    strokeWidth={isOnSelectedPath ? 1.6 : 1.4}
                    opacity={isOnSelectedPath ? 0.66 : 0.58}
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
                      fillOpacity={baseOpacity}
                      stroke="var(--bg-darker)"
                      strokeWidth={2.5}
                      strokeOpacity={baseOpacity}
                      rx={1.5}
                    />
                    <circle cx={cx} cy={cy} r={r * 0.34} fill="var(--bg-darker)" fillOpacity={baseOpacity} />
                  </>
                )}
                {!node.isMerge && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={fillColor}
                    fillOpacity={baseOpacity}
                    stroke="var(--bg-darker)"
                    strokeWidth={2.5}
                    strokeOpacity={baseOpacity}
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
          const isOnCurrentPath = currentPathHashes.has(node.commit.hash);
          const isOnSelectedPath = selectedPathHashes.has(node.commit.hash);
          const isHeadCommit = node.commit.refs.some(ref => ref.startsWith('HEAD ->') || ref === 'HEAD');
          const isMutedByPathFocus = hasAnyPathHighlight && !isOnCurrentPath && !isOnSelectedPath && !isSelected;
          const sortedRefs = sortRefs(node.commit.refs);
          const rowStyle: React.CSSProperties = {
            height: ROW_HEIGHT,
            paddingLeft: graphWidth,
            ...(isSearchMatch ? { boxShadow: 'inset 0 0 0 1px var(--accent-primary-strong)' } : {}),
            ...(isOnCurrentPath ? ({ ['--path-highlight-color' as any]: currentPathColor } as React.CSSProperties) : {}),
            ...(isOnSelectedPath ? ({ ['--selected-path-color' as any]: selectedPathColor } as React.CSSProperties) : {}),
          };
          return (
            <div
              key={node.commit.hash}
              className={`commit-row ${isSelected ? 'selected' : ''} ${showSecondaryHistory && isSecondary ? 'secondary-history' : ''} ${isOnCurrentPath ? 'path-highlighted' : ''} ${isOnSelectedPath ? 'selected-branch-path' : ''} ${isMutedByPathFocus ? 'path-muted' : ''} ${isHeadCommit ? 'head-current' : ''}`}
              onClick={() => onSelectCommit && onSelectCommit(node.commit.hash)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              style={rowStyle}
              data-commit-hash={node.commit.hash}
            >
              <div className="commit-info">
                <span className="commit-hash">{node.commit.abbrevHash}</span>
                <div className="commit-main">
                  {sortedRefs.length > 0 && (
                    <div className="commit-refs">
                      {sortedRefs.map((ref, ri) => {
                        const branchTarget = resolveHighlightableBranchRef(ref);
                        const isActiveBranchRef = Boolean(branchTarget && activeHighlightedBranch === branchTarget);
                        const branchFocusColor = branchTarget ? (branchTipByRef.get(branchTarget)?.color ?? 'var(--text-accent)') : 'var(--text-accent)';

                        if (!branchTarget) {
                          return (
                            <span key={ri} className={`branch-label ${getRefKind(ref)}`}>
                              {ref}
                            </span>
                          );
                        }

                        return (
                          <button
                            key={ri}
                            type="button"
                            className={`branch-label ${getRefKind(ref)} branch-toggle ${isActiveBranchRef ? 'active' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setHighlightedBranchRef((previous) => (previous === branchTarget ? null : branchTarget));
                            }}
                            style={isActiveBranchRef ? ({ ['--branch-focus-color' as any]: branchFocusColor } as React.CSSProperties) : undefined}
                            title={tr('Branch-Pfad hervorheben', 'Highlight branch path')}
                          >
                            {ref}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="commit-subject-row">
                    <span className="commit-subject">{node.commit.subject}</span>
                    <span className="commit-meta">
                      <span className="commit-author">{node.commit.author}</span>
                      <span
                        className="commit-stats"
                        title={node.commit.stats
                          ? `${node.commit.stats.files} files changed, ${node.commit.stats.additions} additions, ${node.commit.stats.deletions} deletions`
                          : tr('Commit-Statistiken werden im Hintergrund geladen.', 'Commit statistics are loading in the background.')}
                      >
                        {node.commit.stats
                          ? formatCommitStats(node.commit.stats.files, node.commit.stats.additions, node.commit.stats.deletions)
                          : '...'}
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
              ref={contextMenuRef}
              className="ctx-menu"
              style={{
                left: contextMenuPlacement?.left ?? contextMenu.x,
                top: contextMenuPlacement?.top ?? contextMenu.y,
                maxHeight: contextMenuPlacement?.maxHeight,
                overflowY: 'auto',
                visibility: contextMenuPlacement?.ready ? 'visible' : 'hidden',
              }}
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
