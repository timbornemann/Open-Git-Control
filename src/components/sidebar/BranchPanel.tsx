import React, { useMemo } from 'react';
import { ChevronDown, ChevronRight, GitBranch, Plus } from 'lucide-react';
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

  const { localBranches, remoteBranches } = useMemo(() => {
    const locals = branches
      .filter(branch => branch.scope === 'local')
      .sort((a, b) => a.name.localeCompare(b.name));
    const remotes = branches
      .filter(branch => branch.scope === 'remote')
      .sort((a, b) => a.name.localeCompare(b.name));

    return { localBranches: locals, remoteBranches: remotes };
  }, [branches]);

  const renderBranchRow = (b: BranchInfo) => {
    const isLocal = b.scope === 'local';
    return (
      <div
        key={b.name}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 8px',
          color: b.isHead ? 'var(--accent-primary)' : isLocal ? 'var(--text-primary)' : 'var(--text-secondary)',
          backgroundColor: b.isHead ? 'var(--bg-hover)' : 'transparent',
          borderRadius: '4px',
          cursor: !b.isHead && isLocal ? 'pointer' : 'default',
        }}
        onClick={() => !b.isHead && isLocal && onCheckoutBranch(b.name)}
        onContextMenu={event => {
          event.preventDefault();
          onSetBranchContextMenu({ x: event.clientX, y: event.clientY, branch: b.name, isHead: b.isHead });
        }}
      >
        <GitBranch size={13} style={{ opacity: b.isHead ? 1 : 0.65, flexShrink: 0 }} />
        <span style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{b.name}</span>
        {b.isHead && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>HEAD</span>}
      </div>
    );
  };

  return (
    <>
      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 6px' }}>
        <button
          className="icon-btn"
          onClick={onToggleCollapsed}
          style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px' }}
          title={collapsed ? tr('Branches anzeigen', 'Show branches') : tr('Branches einklappen', 'Collapse branches')}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
            {tr('Branches', 'Branches')}
          </span>
        </button>
        <button className="icon-btn" style={{ padding: '2px' }} onClick={() => { onSetCreatingBranch(true); onSetNewBranchName(''); }} title={tr('Neuen Branch erstellen', 'Create new branch')}><Plus size={13} /></button>
      </div>

      {!collapsed && (
        <>
          {isCreatingBranch && (
            <div style={{ padding: '2px 8px 6px' }}>
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
                style={{ width: '100%', boxSizing: 'border-box', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--accent-primary)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'monospace' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ padding: '0 8px' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                {tr('Lokal', 'Local')} ({localBranches.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {localBranches.map(renderBranchRow)}
                {localBranches.length === 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '3px 8px' }}>{tr('Keine lokalen Branches.', 'No local branches.')}</span>
                )}
              </div>
            </div>

            <div style={{ padding: '0 8px' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                {tr('Remote', 'Remote')} ({remoteBranches.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {remoteBranches.map(renderBranchRow)}
                {remoteBranches.length === 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '3px 8px' }}>{tr('Keine Remote-Branches.', 'No remote branches.')}</span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
