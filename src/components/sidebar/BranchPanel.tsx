import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GitBranch, Plus, Search } from 'lucide-react';
import { BranchInfo } from '../../types/git';
import { useI18n } from '../../i18n';

type ContextMenuState = { x: number; y: number; branch: string; isHead: boolean } | null;

type Props = {
  branches: BranchInfo[];
  isCreatingBranch: boolean;
  newBranchName: string;
  newBranchInputRef: React.RefObject<HTMLInputElement>;
  onSetCreatingBranch: (value: boolean) => void;
  onSetNewBranchName: (value: string) => void;
  onCreateBranch: () => void;
  onCheckoutBranch: (name: string) => void;
  onSetBranchContextMenu: (value: ContextMenuState) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export const BranchPanel: React.FC<Props> = ({
  branches,
  isCreatingBranch,
  newBranchName,
  newBranchInputRef,
  onSetCreatingBranch,
  onSetNewBranchName,
  onCreateBranch,
  onCheckoutBranch,
  onSetBranchContextMenu,
  collapsed,
  onToggleCollapsed,
}) => {
  const { tr } = useI18n();
  const [query, setQuery] = useState('');

  const { localBranches, remoteBranches } = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const locals = branches
      .filter(branch => branch.scope === 'local')
      .filter(branch => !normalizedQuery || branch.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.name.localeCompare(b.name));
    const remotes = branches
      .filter(branch => branch.scope === 'remote')
      .filter(branch => !normalizedQuery || branch.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { localBranches: locals, remoteBranches: remotes };
  }, [branches, query]);

  const renderBranchRow = (branch: BranchInfo) => {
    const isLocal = branch.scope === 'local';

    return (
      <div
        key={branch.name}
        className="repo-list-row"
        style={{
          color: branch.isHead ? 'var(--accent-primary)' : isLocal ? 'var(--text-primary)' : 'var(--text-secondary)',
          cursor: !branch.isHead && isLocal ? 'pointer' : 'default',
          backgroundColor: branch.isHead ? 'var(--accent-primary-soft)' : undefined,
          border: branch.isHead ? '1px solid var(--accent-primary-border)' : '1px solid transparent',
        }}
        onClick={() => !branch.isHead && isLocal && onCheckoutBranch(branch.name)}
        onContextMenu={event => {
          event.preventDefault();
          onSetBranchContextMenu({ x: event.clientX, y: event.clientY, branch: branch.name, isHead: branch.isHead });
        }}
      >
        <GitBranch size={13} style={{ opacity: branch.isHead ? 1 : 0.65, flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{branch.name}</span>
        {branch.isHead && <span style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', fontWeight: 700 }}>HEAD</span>}
      </div>
    );
  };

  return (
    <section className="repo-card">
      <div className="repo-card-header">
        <button
          className="icon-btn"
          onClick={onToggleCollapsed}
          style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px' }}
          title={collapsed ? tr('Branches anzeigen', 'Show branches') : tr('Branches einklappen', 'Collapse branches')}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span className="repo-card-title">{tr('Branches', 'Branches')}</span>
        </button>
        <div className="repo-card-actions">
          <button
            className="icon-btn"
            style={{ padding: '2px' }}
            onClick={() => {
              onSetCreatingBranch(true);
              onSetNewBranchName('');
            }}
            title={tr('Neuen Branch erstellen', 'Create new branch')}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="repo-card-toolbar">
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                className="repo-filter-input"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={tr('Branches filtern...', 'Filter branches...')}
                style={{ paddingLeft: '26px' }}
              />
            </div>
          </div>

          {isCreatingBranch && (
            <div className="repo-card-content">
              <input
                ref={newBranchInputRef}
                type="text"
                placeholder="branch-name"
                value={newBranchName}
                onChange={event => onSetNewBranchName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') onCreateBranch();
                  if (event.key === 'Escape') {
                    onSetCreatingBranch(false);
                    onSetNewBranchName('');
                  }
                }}
                onBlur={() => {
                  if (!newBranchName.trim()) onSetCreatingBranch(false);
                }}
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--accent-primary)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'monospace' }}
              />
            </div>
          )}

          <div className="repo-card-content repo-card-scroll">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                  {tr('Lokal', 'Local')} ({localBranches.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {localBranches.map(renderBranchRow)}
                  {localBranches.length === 0 && <span className="repo-state-text" style={{ padding: '3px 8px' }}>{tr('Keine lokalen Branches.', 'No local branches.')}</span>}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                  {tr('Remote', 'Remote')} ({remoteBranches.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {remoteBranches.map(renderBranchRow)}
                  {remoteBranches.length === 0 && <span className="repo-state-text" style={{ padding: '3px 8px' }}>{tr('Keine Remote-Branches.', 'No remote branches.')}</span>}
                </div>
              </div>
            </div>

            {query.trim() && localBranches.length + remoteBranches.length === 0 && (
              <div className="repo-state-text" style={{ paddingTop: '8px' }}>
                {tr('Keine Treffer fuer den Filter.', 'No matches for this filter.')}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};
