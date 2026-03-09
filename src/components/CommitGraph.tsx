import React, { useEffect, useState, useRef, useCallback } from 'react';
import { parseGitLog } from '../utils/gitParsing';
import { computeGraphLayout, GraphLayout, GraphNode } from '../utils/graphLayout';

interface CommitGraphProps {
  repoPath: string | null;
  onSelectCommit?: (hash: string) => void;
  selectedHash?: string | null;
}

const ROW_HEIGHT = 36;
const LANE_WIDTH = 16;
const GRAPH_PADDING = 12;
const NODE_RADIUS = 5;
const MERGE_NODE_RADIUS = 6;

// ── Context Menu ──
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

export const CommitGraph: React.FC<CommitGraphProps> = ({ repoPath, onSelectCommit, selectedHash }) => {
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [actionResult, setActionResult] = useState<{ message: string; isError: boolean } | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const refreshCommits = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    setLoading(true);
    try {
      const { success, data, error } = await window.electronAPI.runGitCommand('log', '100');
      if (success && data) {
        setLayout(computeGraphLayout(parseGitLog(data)));
      } else {
        console.error('Failed to fetch commits:', error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) {
      setLayout(null);
      return;
    }
    refreshCommits();
  }, [repoPath, refreshCommits]);

  // Close context menu on click anywhere or Escape
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

  // Auto-hide action result toast
  useEffect(() => {
    if (!actionResult) return;
    const t = setTimeout(() => setActionResult(null), 4000);
    return () => clearTimeout(t);
  }, [actionResult]);

  // ── Git Actions ──
  const runGitAction = async (args: string[], successMsg: string) => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (result.success) {
        setActionResult({ message: successMsg, isError: false });
        refreshCommits();
      } else {
        setActionResult({ message: result.error || 'Unbekannter Fehler', isError: true });
      }
    } catch (e: any) {
      setActionResult({ message: e.message, isError: true });
    }
  };

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
        label: `Checkout ${shortHash}`,
        icon: '↩',
        action: () => runGitAction(['checkout', hash], `Checkout zu ${shortHash} erfolgreich.`),
      },
      {
        label: 'Neuen Branch erstellen...',
        icon: '⑂',
        action: async () => {
          const name = prompt('Branch-Name:');
          if (name && name.trim()) {
            runGitAction(['checkout', '-b', name.trim(), hash], `Branch "${name.trim()}" erstellt.`);
          }
        },
      },
      {
        label: '', icon: '', separator: true, action: () => {},
      },
      {
        label: `Cherry-Pick ${shortHash}`,
        icon: '🍒',
        action: () => runGitAction(['cherry-pick', hash], `Cherry-Pick von ${shortHash} erfolgreich.`),
      },
      {
        label: `Revert ${shortHash}`,
        icon: '↶',
        action: () => runGitAction(['revert', '--no-edit', hash], `Revert von ${shortHash} erfolgreich.`),
      },
      {
        label: '', icon: '', separator: true, action: () => {},
      },
      {
        label: `Reset --soft auf ${shortHash}`,
        icon: '⟲',
        action: () => {
          if (confirm(`Soft-Reset auf ${shortHash}? Änderungen bleiben staged.`)) {
            runGitAction(['reset', '--soft', hash], `Soft-Reset auf ${shortHash} erfolgreich.`);
          }
        },
      },
      {
        label: `Reset --mixed auf ${shortHash}`,
        icon: '⟲',
        action: () => {
          if (confirm(`Mixed-Reset auf ${shortHash}? Änderungen bleiben unstaged.`)) {
            runGitAction(['reset', '--mixed', hash], `Mixed-Reset auf ${shortHash} erfolgreich.`);
          }
        },
      },
      {
        label: `Reset --hard auf ${shortHash}`,
        icon: '⟲',
        danger: true,
        action: () => {
          if (confirm(`⚠️ ACHTUNG: Hard-Reset auf ${shortHash}? Alle Änderungen gehen verloren!`)) {
            runGitAction(['reset', '--hard', hash], `Hard-Reset auf ${shortHash} erfolgreich.`);
          }
        },
      },
      {
        label: '', icon: '', separator: true, action: () => {},
      },
      {
        label: 'Commit-Hash kopieren',
        icon: '📋',
        action: () => {
          navigator.clipboard.writeText(hash);
          setActionResult({ message: 'Hash kopiert!', isError: false });
        },
      },
    ];

    // Add merge-specific option
    if (isMerge) {
      actions.splice(5, 0, {
        label: `Revert Merge ${shortHash}`,
        icon: '↶',
        action: () => {
          if (confirm(`Merge-Revert von ${shortHash}? (Parent 1 wird beibehalten)`)) {
            runGitAction(['revert', '-m', '1', '--no-edit', hash], `Merge-Revert von ${shortHash} erfolgreich.`);
          }
        },
      });
    }

    return actions;
  };

  // ── Render helpers ──
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

  const graphWidth = (layout.maxLane + 1) * LANE_WIDTH + GRAPH_PADDING * 2;
  const laneX = (lane: number) => GRAPH_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;

  return (
    <>
      <div ref={logContainerRef} className="commit-graph-container">
        {layout.nodes.map((node) => {
          const isSelected = selectedHash === node.commit.hash;
          return (
            <div
              key={node.commit.hash}
              className={`commit-row ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectCommit && onSelectCommit(node.commit.hash)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              style={{ height: ROW_HEIGHT }}
            >
              {/* Graph SVG column */}
              <div className="commit-graph-col" style={{ width: graphWidth, minWidth: graphWidth }}>
                <svg width={graphWidth} height={ROW_HEIGHT} style={{ display: 'block' }}>
                  {layout.edges
                    .filter(e => e.fromRow <= node.row && e.toRow >= node.row)
                    .map((edge, i) => {
                      const x1 = laneX(edge.fromLane);
                      const x2 = laneX(edge.toLane);

                      if (edge.fromRow === node.row && edge.toRow === node.row + 1 && edge.fromLane === edge.toLane) {
                        return <line key={i} x1={x1} y1={0} x2={x2} y2={ROW_HEIGHT} stroke={edge.color} strokeWidth={2} strokeOpacity={0.6} />;
                      }
                      if (edge.fromRow === node.row) {
                        if (edge.fromLane === edge.toLane) {
                          return <line key={i} x1={x1} y1={ROW_HEIGHT / 2} x2={x1} y2={ROW_HEIGHT} stroke={edge.color} strokeWidth={2} strokeOpacity={0.6} />;
                        }
                        const cx1 = laneX(edge.fromLane);
                        const cx2 = laneX(edge.toLane);
                        const d = `M ${cx1} ${ROW_HEIGHT / 2} C ${cx1} ${ROW_HEIGHT}, ${cx2} ${ROW_HEIGHT}, ${cx2} ${ROW_HEIGHT}`;
                        return <path key={i} d={d} stroke={edge.color} strokeWidth={2} strokeOpacity={0.6} fill="none" />;
                      }
                      if (edge.toRow === node.row) {
                        if (edge.fromLane === edge.toLane) {
                          return <line key={i} x1={x1} y1={0} x2={x2} y2={ROW_HEIGHT / 2} stroke={edge.color} strokeWidth={2} strokeOpacity={0.6} />;
                        }
                        const cx1 = laneX(edge.fromLane);
                        const cx2 = laneX(edge.toLane);
                        const d = `M ${cx1} 0 C ${cx1} 0, ${cx2} 0, ${cx2} ${ROW_HEIGHT / 2}`;
                        return <path key={i} d={d} stroke={edge.color} strokeWidth={2} strokeOpacity={0.6} fill="none" />;
                      }
                      const x = laneX(edge.fromLane);
                      return <line key={i} x1={x} y1={0} x2={x} y2={ROW_HEIGHT} stroke={edge.color} strokeWidth={2} strokeOpacity={0.4} />;
                    })}
                  <circle
                    cx={laneX(node.lane)} cy={ROW_HEIGHT / 2}
                    r={node.isMerge ? MERGE_NODE_RADIUS : NODE_RADIUS}
                    fill={node.color} stroke="var(--bg-darker)" strokeWidth={2}
                  />
                  {isSelected && (
                    <circle
                      cx={laneX(node.lane)} cy={ROW_HEIGHT / 2}
                      r={(node.isMerge ? MERGE_NODE_RADIUS : NODE_RADIUS) + 3}
                      fill="none" stroke={node.color} strokeWidth={1.5} opacity={0.6}
                    />
                  )}
                </svg>
              </div>

              {/* Commit info */}
              <div className="commit-info">
                {node.commit.refs.length > 0 && (
                  <div className="commit-refs">
                    {node.commit.refs.map((ref, ri) => (
                      <span key={ri} className={`branch-label ${ref.startsWith('HEAD') ? 'head' : ''} ${ref.startsWith('tag:') ? 'tag' : ''}`}>
                        {ref}
                      </span>
                    ))}
                  </div>
                )}
                <span className="commit-hash">{node.commit.abbrevHash}</span>
                <span className="commit-subject">{node.commit.subject}</span>
                <span className="commit-meta">
                  <span className="commit-author">{node.commit.author}</span>
                  <span className="commit-date">{formatDate(node.commit.date)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
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

      {/* Action Result Toast */}
      {actionResult && (
        <div className={`action-toast ${actionResult.isError ? 'error' : 'success'}`}>
          {actionResult.isError ? '✗' : '✓'} {actionResult.message}
        </div>
      )}
    </>
  );
};
