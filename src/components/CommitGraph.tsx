import React, { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react';
import { GitStatusDetailed, parseGitLog, parseGitStatusDetailed } from '../utils/gitParsing';
import { computeGraphLayout, GraphLayout, GraphNode, GraphEdge } from '../utils/graphLayout';
import { useToastQueue } from '../hooks/useToastQueue';
import { Confirm, DialogContextItem } from './Confirm';
import { DangerConfirm } from './DangerConfirm';
import { Input, InputDialogField } from './Input';

interface CommitGraphProps {
  repoPath: string | null;
  onSelectCommit?: (hash: string | null) => void;
  selectedHash?: string | null;
  refreshTrigger?: number;
  showSecondaryHistory?: boolean;
}

const LOG_LIMIT = 200;
const ROW_HEIGHT = 44;
const LANE_WIDTH = 24;
const GRAPH_PADDING = 16;
const NODE_RADIUS = 4;
const MERGE_NODE_RADIUS = 6;
const SECONDARY_GRAPH_COLOR = 'rgba(139, 148, 158, 0.78)';

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

const SEARCH_SCOPE_LABELS: Record<SearchScope, string> = {
  all: 'Alles',
  subject: 'Nachricht',
  author: 'Autor',
  hash: 'Hash',
  refs: 'Refs',
};

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

export const CommitGraph: React.FC<CommitGraphProps> = ({ repoPath, onSelectCommit, selectedHash, refreshTrigger, showSecondaryHistory = true }) => {
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [workingTreeStatus, setWorkingTreeStatus] = useState<GitStatusDetailed | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const { toast, setToast } = useToastQueue(4000);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [matchCursor, setMatchCursor] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<GraphLayout | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);

  const refreshCommits = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    const shouldShowLoadingState = !layoutRef.current;
    const scrollContainer = logContainerRef.current?.parentElement ?? null;
    pendingScrollTopRef.current = scrollContainer ? scrollContainer.scrollTop : null;

    if (shouldShowLoadingState) {
      setLoading(true);
    }

    try {
      const { success, data, error } = await window.electronAPI.runGitCommand('log', String(LOG_LIMIT));
      if (success && data) {
        setLayout(computeGraphLayout(parseGitLog(data)));
      } else {
        console.error('Failed to fetch commits:', error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (shouldShowLoadingState) {
        setLoading(false);
      }
    }
  }, [repoPath]);

  const refreshWorkingTreeStatus = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    try {
      const { success, data } = await window.electronAPI.runGitCommand('status', '-s');
      if (success) {
        setWorkingTreeStatus(parseGitStatusDetailed(data || ''));
      }
    } catch (e) {
      console.error(e);
    }
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) {
      setLayout(null);
      setWorkingTreeStatus(null);
      layoutRef.current = null;
      pendingScrollTopRef.current = null;
      return;
    }
    refreshCommits();
    refreshWorkingTreeStatus();
  }, [repoPath, refreshCommits, refreshWorkingTreeStatus, refreshTrigger]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useLayoutEffect(() => {
    if (pendingScrollTopRef.current === null) return;
    const scrollContainer = logContainerRef.current?.parentElement;
    if (!scrollContainer) {
      pendingScrollTopRef.current = null;
      return;
    }

    scrollContainer.scrollTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;
  }, [layout, workingTreeStatus]);

  useEffect(() => {
    if (!repoPath) return;
    const intervalId = window.setInterval(refreshWorkingTreeStatus, 3000);
    window.addEventListener('focus', refreshWorkingTreeStatus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWorkingTreeStatus);
    };
  }, [repoPath, refreshWorkingTreeStatus]);

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
  const runGitAction = async (args: string[], successMsg: string) => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (result.success) {
        setToast({ msg: successMsg, isError: false });
        refreshCommits();
        refreshWorkingTreeStatus();
      } else {
        setToast({ msg: result.error || 'Unbekannter Fehler', isError: true });
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

  const handleContextMenu = (e: React.MouseEvent, node: GraphNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

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

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      if (diffDays < 7) return `vor ${diffDays}d`;
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
    } catch { return ''; }
  };

  if (!repoPath) {
    return <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>Bitte wähle ein Repository aus, um den Graphen zu sehen.</div>;
  }
  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Lade Commit-Historie...</div>;
  }
  if (!layout || layout.nodes.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Keine Commits gefunden.</div>;
  }

  const hasWorkingTreeChanges = Boolean(
    workingTreeStatus &&
    (workingTreeStatus.staged.length > 0 || workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0)
  );
  const workingTreeRowOffset = hasWorkingTreeChanges ? 1 : 0;
  const graphWidth = Math.max((layout.maxLane + 1) * LANE_WIDTH + GRAPH_PADDING * 2, 60);
  const totalHeight = (layout.nodes.length + workingTreeRowOffset) * ROW_HEIGHT;
  const laneX = (lane: number) => GRAPH_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
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

    const span = y2 - y1;
    const verticalInset = Math.min(ROW_HEIGHT * 0.9, Math.max(10, span * 0.28));
    const bendStartY = y1 + verticalInset;
    const bendEndY = y2 - verticalInset;
    const midY = (bendStartY + bendEndY) / 2;

    if (bendStartY >= bendEndY) {
      return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    }

    return `M ${x1} ${y1} L ${x1} ${bendStartY} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${bendEndY} L ${x2} ${y2}`;
  };

  return (
    <>
      <div className="commit-search-toolbar" style={{ position: 'sticky', top: 0, zIndex: 3, background: 'linear-gradient(180deg, rgba(18,22,29,0.98), rgba(18,22,29,0.9))', borderBottom: '1px solid var(--border-color)', padding: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <input
          className="commit-search-input" style={{ flex: 1, minWidth: '240px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.82rem' }}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Commits durchsuchen (Hash, Autor, Nachricht, Ref)"
        />
        <div className="commit-search-filters" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(Object.keys(SEARCH_SCOPE_LABELS) as SearchScope[]).map(scope => (
            <button
              key={scope}
              className={`commit-search-chip ${searchScope === scope ? 'active' : ''}`}
              style={{
                border: '1px solid var(--border-color)',
                backgroundColor: searchScope === scope ? 'rgba(31, 111, 235, 0.2)' : 'var(--bg-panel)',
                color: searchScope === scope ? '#7cb8ff' : 'var(--text-secondary)',
                borderRadius: '999px',
                padding: '4px 9px',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
              onClick={() => setSearchScope(scope)}
            >
              {SEARCH_SCOPE_LABELS[scope]}
            </button>
          ))}
        </div>
        {normalizedSearch && (
          <div className="commit-search-meta" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            <span>{matchedNodes.length} Treffer</span>
            <button className="commit-search-nav" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem' }} onClick={() => jumpToMatch(-1)} disabled={matchedNodes.length === 0}>Prev</button>
            <button className="commit-search-nav" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem' }} onClick={() => jumpToMatch(1)} disabled={matchedNodes.length === 0}>Next</button>
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
                stroke="rgba(201, 209, 217, 0.06)"
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
                stroke="#d29922"
                strokeWidth={2.2}
              />
            </>
          )}
          {layout.edges.map((edge, i) => (
            <path
              key={`eg${i}`}
              d={buildEdgePath(edge)}
              stroke={showSecondaryHistory && !reachableFromHead.has(layout.nodes[edge.fromRow]?.commit.hash) ? SECONDARY_GRAPH_COLOR : edge.color}
              strokeWidth={edge.kind === 'merge' ? 4.5 : 5}
              strokeOpacity={0.1}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={edge.kind === 'merge' ? '4 4' : undefined}
            />
          ))}
          {layout.edges.map((edge, i) => (
            <path
              key={`em${i}`}
              d={buildEdgePath(edge)}
              stroke={showSecondaryHistory && !reachableFromHead.has(layout.nodes[edge.fromRow]?.commit.hash) ? SECONDARY_GRAPH_COLOR : edge.color}
              strokeWidth={edge.kind === 'merge' ? 1.5 : 2.2}
              strokeOpacity={edge.kind === 'merge' ? 0.72 : 0.92}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={edge.kind === 'merge' ? '4 4' : undefined}
            />
          ))}
          {layout.nodes.map((node) => {
            const cx = laneX(node.lane);
            const cy = (node.row + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2;
            const isSelected = selectedHash === node.commit.hash;
            const isSecondary = showSecondaryHistory && !reachableFromHead.has(node.commit.hash);
            const r = node.isMerge ? MERGE_NODE_RADIUS : NODE_RADIUS;
            const fillColor = isSecondary ? SECONDARY_GRAPH_COLOR : node.color;

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
                    <span className="commit-author">Klicken zum Stage / Commit</span>
                    <span className="commit-date">{workingTreeCount}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {layout.nodes.map((node) => {
          const isSelected = selectedHash === node.commit.hash;
          const isSecondary = showSecondaryHistory && !reachableFromHead.has(node.commit.hash);
          const isSearchMatch = normalizedSearch ? matchedHashSet.has(node.commit.hash) : false;
          const sortedRefs = sortRefs(node.commit.refs);
          return (
            <div
              key={node.commit.hash}
              className={`commit-row ${isSelected ? 'selected' : ''} ${isSecondary ? 'secondary-history' : ''}`}
              onClick={() => onSelectCommit && onSelectCommit(node.commit.hash)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              style={{ height: ROW_HEIGHT, paddingLeft: graphWidth, ...(isSearchMatch ? { boxShadow: 'inset 0 0 0 1px rgba(31, 111, 235, 0.45)' } : {}) }}
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
                      <span className="commit-date">{formatDate(node.commit.date)}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {contextMenu && (
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
              {contextMenu.node.commit.abbrevHash} — {contextMenu.node.commit.subject.slice(0, 30)}{contextMenu.node.commit.subject.length > 30 ? '...' : ''}
            </div>
            {getMenuActions(contextMenu.node).map((item, idx) => {
              if (item.separator) {
                return <div key={idx} className="ctx-menu-sep" />;
              }
              return (
                <button
                  key={idx}
                  className={`ctx-menu-item ${item.danger ? 'danger' : ''}`}
                  onClick={() => { setContextMenu(null); item.action(); }}
                >
                  <span className="ctx-menu-icon">{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
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
    </>
  );
};



