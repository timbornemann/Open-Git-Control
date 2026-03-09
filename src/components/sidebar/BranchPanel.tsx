import React from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { BranchInfo } from '../../types/git';

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
};

export const BranchPanel: React.FC<Props> = ({ branches, isCreatingBranch, newBranchName, newBranchInputRef, onSetCreatingBranch, onSetNewBranchName, onCreateBranch, onCheckoutBranch, onSetBranchContextMenu }) => (
  <>
    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 6px' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Branches</span>
      <button className="icon-btn" style={{ padding: '2px' }} onClick={() => { onSetCreatingBranch(true); onSetNewBranchName(''); }} title="Neuen Branch erstellen"><Plus size={13} /></button>
    </div>
    {isCreatingBranch && (
      <div style={{ padding: '2px 8px 6px' }}>
        <input ref={newBranchInputRef} type="text" placeholder="branch-name" value={newBranchName} onChange={e => onSetNewBranchName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onCreateBranch(); if (e.key === 'Escape') { onSetCreatingBranch(false); onSetNewBranchName(''); } }} onBlur={() => { if (!newBranchName.trim()) onSetCreatingBranch(false); }} style={{ width: '100%', boxSizing: 'border-box', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--accent-primary)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'monospace' }} />
      </div>
    )}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {branches.map(b => (
        <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', color: b.isHead ? 'var(--accent-primary)' : b.scope === 'remote' ? 'var(--text-secondary)' : 'var(--text-primary)', backgroundColor: b.isHead ? 'var(--bg-hover)' : 'transparent', borderRadius: '4px', cursor: !b.isHead && b.scope === 'local' ? 'pointer' : 'default' }} onClick={() => !b.isHead && b.scope === 'local' && onCheckoutBranch(b.name)} onContextMenu={e => { e.preventDefault(); onSetBranchContextMenu({ x: e.clientX, y: e.clientY, branch: b.name, isHead: b.isHead }); }}>
          <GitBranch size={13} style={{ opacity: b.isHead ? 1 : 0.65, flexShrink: 0 }} />
          <span style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{b.name}</span>
          {b.isHead && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>HEAD</span>}
        </div>
      ))}
    </div>
  </>
);
