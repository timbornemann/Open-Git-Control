import React from 'react';
import { Globe, Plus, RefreshCw, X } from 'lucide-react';
import { RemoteInfo, RemoteSyncState } from '../../types/git';

type RemoteStatus = {
  title: string;
  detail: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
};

type Props = {
  remotes: RemoteInfo[];
  remoteSync: RemoteSyncState;
  remoteStatus: RemoteStatus;
  remoteOnlyBranchesCount: number;
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  onRefreshRemote: () => void;
};

export const RemotePanel: React.FC<Props> = ({ remotes, remoteSync, remoteStatus, remoteOnlyBranchesCount, onAddRemote, onRemoveRemote, onRefreshRemote }) => (
  <>
    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 6px' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Remotes</span>
      <div style={{ display: 'flex', gap: '2px' }}>
        <button className="icon-btn" style={{ padding: '2px' }} onClick={onAddRemote} title="Remote hinzufügen"><Plus size={13} /></button>
        <button className="icon-btn" style={{ padding: '2px' }} onClick={onRefreshRemote} title="Remote aktualisieren" disabled={remoteSync.isFetching}><RefreshCw size={13} className={remoteSync.isFetching ? 'spin' : ''} /></button>
      </div>
    </div>
    <div style={{ padding: '8px', borderRadius: '6px', marginBottom: '6px', backgroundColor: remoteStatus.backgroundColor, border: `1px solid ${remoteStatus.borderColor}`, display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: remoteStatus.color }}>{remoteStatus.title}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{remoteStatus.detail}</span>
      {remoteOnlyBranchesCount > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{remoteOnlyBranchesCount} Branches nur auf Remote.</span>}
      {remoteSync.lastFetchError && <span style={{ fontSize: '0.75rem', color: '#f85149' }}>{remoteSync.lastFetchError}</span>}
    </div>
    {remotes.map(r => (
      <div key={r.name} className="repo-list-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '4px' }}>
        <Globe size={13} style={{ color: 'var(--text-accent)', opacity: 0.7, flexShrink: 0 }} />
        <span style={{ fontSize: '0.82rem', fontWeight: 500, flexShrink: 0 }}>{r.name}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={r.url}>{r.url}</span>
        <button onClick={() => onRemoveRemote(r.name)} className="icon-btn repo-close-btn" style={{ padding: '2px', opacity: 0 }} title="Remote entfernen"><X size={11} /></button>
      </div>
    ))}
  </>
);
