import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, Plus, Search } from 'lucide-react';
import { BranchInfo } from '../../types/git';
import { useI18n } from '../../i18n';
import { RepoCard, RepoCardContent, RepoCardHeader, RepoCardToolbar } from './RepoCard';

type ContextMenuState = { x: number; y: number; branch: string; isHead: boolean } | null;

type Props = {
  branches: BranchInfo[];
  isCreatingBranch: boolean;
  onSetCreatingBranch: (value: boolean) => void;
  onCreateBranch: (branchName: string) => void;
  onCheckoutBranch: (name: string) => void;
  onSetBranchContextMenu: (value: ContextMenuState) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export const BranchPanel: React.FC<Props> = ({
  branches,
  isCreatingBranch,
  onSetCreatingBranch,
  onCreateBranch,
  onCheckoutBranch,
  onSetBranchContextMenu,
  collapsed,
  onToggleCollapsed,
}) => {
  const { tr } = useI18n();
  const [query, setQuery] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const newBranchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isCreatingBranch) return;
    setNewBranchName('');
    window.setTimeout(() => newBranchInputRef.current?.focus(), 0);
  }, [isCreatingBranch]);

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
    const displayName = isLocal ? branch.name : (branch.name.split('/').filter(Boolean).pop() || branch.name);

    return (
      <div
        key={branch.name}
        className={`repo-list-row branch-row ${isLocal ? 'branch-row-local' : 'branch-row-remote'} ${branch.isHead ? 'branch-row-current' : ''}`}
        title={branch.name}
        onClick={() => !branch.isHead && isLocal && onCheckoutBranch(branch.name)}
        onContextMenu={event => {
          event.preventDefault();
          onSetBranchContextMenu({ x: event.clientX, y: event.clientY, branch: branch.name, isHead: branch.isHead });
        }}
      >
        <GitBranch size={13} className="branch-row-icon" />
        <span className="branch-row-name">{displayName}</span>
        {branch.isHead && <span className="branch-head-badge">HEAD</span>}
      </div>
    );
  };

  return (
    <RepoCard>
      <RepoCardHeader
        title={tr('Branches', 'Branches')}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        toggleTitle={collapsed ? tr('Branches anzeigen', 'Show branches') : tr('Branches einklappen', 'Collapse branches')}
        actions={(
          <button
            className="icon-btn sidebar-row-action-icon"
            onClick={() => {
              onSetCreatingBranch(true);
            }}
            title={tr('Neuen Branch erstellen', 'Create new branch')}
          >
            <Plus size={13} />
          </button>
        )}
      />

      {!collapsed && (
        <>
          <RepoCardToolbar>
            <div className="sidebar-search-wrap branch-search-wrap">
              <Search size={12} className="sidebar-search-icon" />
              <input
                className="repo-filter-input sidebar-filter-input"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={tr('Branches filtern...', 'Filter branches...')}
              />
            </div>
          </RepoCardToolbar>

          {isCreatingBranch && (
            <RepoCardContent>
              <input
                ref={newBranchInputRef}
                type="text"
                placeholder="branch-name"
                value={newBranchName}
                onChange={event => setNewBranchName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') onCreateBranch(newBranchName);
                  if (event.key === 'Escape') {
                    onSetCreatingBranch(false);
                    setNewBranchName('');
                  }
                }}
                onBlur={() => {
                  if (!newBranchName.trim()) onSetCreatingBranch(false);
                }}
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--accent-primary)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'monospace' }}
              />
            </RepoCardContent>
          )}

          <RepoCardContent className="repo-card-scroll">
            <div className="sidebar-group-wrap">
              <div>
                <div className="sidebar-group-label">
                  {tr('Lokal', 'Local')} ({localBranches.length})
                </div>
                <div className="sidebar-group-stack">
                  {localBranches.map(renderBranchRow)}
                  {localBranches.length === 0 && <span className="repo-state-text" style={{ padding: '3px 8px' }}>{tr('Keine lokalen Branches.', 'No local branches.')}</span>}
                </div>
              </div>

              <div>
                <div className="sidebar-group-label">
                  {tr('Remote', 'Remote')} ({remoteBranches.length})
                </div>
                <div className="sidebar-group-stack">
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
          </RepoCardContent>
        </>
      )}
    </RepoCard>
  );
};
