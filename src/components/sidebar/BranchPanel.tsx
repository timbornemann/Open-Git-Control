import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, Plus, Search, Brush } from 'lucide-react';
import type { BranchInfo } from '@/types/git';
import { useI18n } from '@/i18n';
import { RepoCard, RepoCardContent, RepoCardHeader, RepoCardToolbar } from './RepoCard';
import { SidebarActionsMenu } from './SidebarActionsMenu';

type ContextMenuState = { x: number; y: number; branch: string; isHead: boolean; isProtected?: boolean } | null;

type Props = {
  branches: BranchInfo[];
  isCreatingBranch: boolean;
  onSetCreatingBranch: (value: boolean) => void;
  onCreateBranch: (branchName: string) => void;
  onCheckoutBranch: (name: string) => void;
  onSetBranchContextMenu: (value: ContextMenuState) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCleanup?: () => void;
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
  onCleanup,
}) => {
  const { t, tr } = useI18n();
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
      .filter((branch) => branch.scope === 'local')
      .filter((branch) => !normalizedQuery || branch.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.name.localeCompare(b.name));
    const remotes = branches
      .filter((branch) => branch.scope === 'remote')
      .filter((branch) => !normalizedQuery || branch.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { localBranches: locals, remoteBranches: remotes };
  }, [branches, query]);

  const renderBranchRow = (branch: BranchInfo) => {
    const isLocal = branch.scope === 'local';
    const displayName = isLocal ? branch.name : branch.name.split('/').filter(Boolean).pop() || branch.name;

    return (
      <div
        key={branch.name}
        className={`repo-list-row branch-row ${isLocal ? 'branch-row-local' : 'branch-row-remote'} ${branch.isHead ? 'branch-row-current' : ''}`}
        title={branch.name}
        role="button"
        tabIndex={0}
        aria-label={branch.name}
        aria-haspopup="menu"
        aria-current={branch.isHead ? 'true' : undefined}
        data-branch-name={branch.name}
        data-branch-scope={branch.scope}
        data-branch-head={branch.isHead}
        onKeyDown={(event) => {
          if (event.repeat || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10') || (!isLocal && event.key === 'Enter')) {
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            onSetBranchContextMenu({
              x: bounds.left + 12,
              y: bounds.top + bounds.height / 2,
              branch: branch.name,
              isHead: branch.isHead,
              isProtected: branch.isProtected,
            });
          } else if (isLocal && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            if (!branch.isHead) onCheckoutBranch(branch.name);
          }
        }}
        onClick={() => !branch.isHead && isLocal && onCheckoutBranch(branch.name)}
        onContextMenu={(event) => {
          event.preventDefault();
          onSetBranchContextMenu({
            x: event.clientX,
            y: event.clientY,
            branch: branch.name,
            isHead: branch.isHead,
            ...(branch.isProtected ? { isProtected: true } : {}),
          });
        }}
      >
        <GitBranch size={13} className="branch-row-icon" />
        <span className="branch-row-name">{displayName}</span>
        {branch.isHead && <span className="branch-head-badge">HEAD</span>}
      </div>
    );
  };

  return (
    <RepoCard tutorialTarget="branches">
      <RepoCardHeader
        title={t('generated.components.sidebar.branchpanel.branches_4d013a68')}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        toggleTitle={
          collapsed
            ? t('generated.components.sidebar.branchpanel.show_branches_cfab3e39')
            : t('generated.components.sidebar.branchpanel.collapse_branches_b4d0333a')
        }
        actions={
          <>
            <SidebarActionsMenu
              actions={[
                {
                  id: 'cleanup',
                  label: tr('Branches aufräumen …', 'Clean up branches …'),
                  icon: <Brush size={14} />,
                  disabled: !onCleanup,
                  run: () => onCleanup?.(),
                },
              ]}
            />
            <button
              type="button"
              className="icon-btn sidebar-row-action-icon"
              onClick={() => {
                onSetCreatingBranch(true);
              }}
              title={t('generated.components.sidebar.branchpanel.create_new_branch_7f015dbf')}
              data-tutorial="create-branch"
            >
              <Plus size={13} />
            </button>
          </>
        }
      />

      {!collapsed && (
        <>
          <RepoCardToolbar>
            <div className="sidebar-search-wrap branch-search-wrap">
              <Search size={12} className="sidebar-search-icon" />
              <input
                className="repo-filter-input sidebar-filter-input"
                data-tutorial="branch-filter"
                aria-label={t('generated.components.sidebar.branchpanel.filter_branches_d57dded7')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('generated.components.sidebar.branchpanel.filter_branches_d57dded7')}
              />
            </div>
          </RepoCardToolbar>

          {isCreatingBranch && (
            <RepoCardContent>
              <input
                ref={newBranchInputRef}
                type="text"
                placeholder="branch-name"
                data-tutorial="branch-name"
                aria-label={tr('Branch-Name', 'Branch name')}
                value={newBranchName}
                onChange={(event) => setNewBranchName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.repeat || event.nativeEvent.isComposing) return;
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCreateBranch(newBranchName);
                  }
                  if (event.key === 'Escape') {
                    onSetCreatingBranch(false);
                    setNewBranchName('');
                  }
                }}
                onBlur={(event) => {
                  const explaining =
                    window.tutorialHost && !window.electronAPI && event.relatedTarget instanceof Element && event.relatedTarget.closest('.tutorial-coach');
                  if (!newBranchName.trim() && !explaining) onSetCreatingBranch(false);
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--accent-primary)',
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                }}
              />
            </RepoCardContent>
          )}

          <RepoCardContent className="repo-card-scroll">
            <div className="sidebar-group-wrap">
              <div>
                <div className="sidebar-group-label">
                  {t('generated.components.layout.sidebar.githubconnectedcontent.local_0a3c619d')} ({localBranches.length})
                </div>
                <div className="sidebar-group-stack">
                  {localBranches.map(renderBranchRow)}
                  {localBranches.length === 0 && (
                    <span className="repo-state-text" style={{ padding: '3px 8px' }}>
                      {t('generated.components.sidebar.branchpanel.no_local_branches_e65093da')}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="sidebar-group-label">
                  {t('generated.components.sidebar.branchpanel.remote_8a6f1451')} ({remoteBranches.length})
                </div>
                <div className="sidebar-group-stack">
                  {remoteBranches.map(renderBranchRow)}
                  {remoteBranches.length === 0 && (
                    <span className="repo-state-text" style={{ padding: '3px 8px' }}>
                      {t('generated.components.sidebar.branchpanel.no_remote_branches_595b2860')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {query.trim() && localBranches.length + remoteBranches.length === 0 && (
              <div className="repo-state-text" style={{ paddingTop: '8px' }}>
                {t('generated.components.layout.sidebar.repogithubactionscontent.no_matches_for_this_filter_c66c3d48')}
              </div>
            )}
          </RepoCardContent>
        </>
      )}
    </RepoCard>
  );
};
