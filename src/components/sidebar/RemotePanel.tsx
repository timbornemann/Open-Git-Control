import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Globe, Plus, RefreshCw, X } from 'lucide-react';
import { RemoteInfo, RemoteSyncState } from '../../types/git';
import { DialogFrame } from '../DialogFrame';

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
  remoteOnlyBranches: string[];
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  onRefreshRemote: () => void;
  onSetUpstreamForCurrentBranch: () => void;
  onCheckoutRemoteBranch: (remoteBranchName: string) => void;
};

const toShortRemoteBranch = (name: string) => name.replace(/^remotes\//, '');

export const RemotePanel: React.FC<Props> = ({
  remotes,
  remoteSync,
  remoteStatus,
  remoteOnlyBranchesCount,
  remoteOnlyBranches,
  onAddRemote,
  onRemoveRemote,
  onRefreshRemote,
  onSetUpstreamForCurrentBranch,
  onCheckoutRemoteBranch,
}) => {
  const [isRemoteBranchesDialogOpen, setIsRemoteBranchesDialogOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const remoteOnlyPreview = remoteOnlyBranches.slice(0, 3);
  const isHealthy = remoteStatus.title === 'Remote ist aktuell' && remoteOnlyBranchesCount === 0 && !remoteSync.lastFetchError && remoteSync.hasUpstream;

  return (
    <>
      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 6px' }}>
        <button
          className="icon-btn"
          onClick={() => setCollapsed(previous => !previous)}
          style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px' }}
          title={collapsed ? 'Remotes anzeigen' : 'Remotes einklappen'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Remotes</span>
        </button>
        <div style={{ display: 'flex', gap: '2px' }}>
          <button className="icon-btn" style={{ padding: '2px' }} onClick={onAddRemote} title="Remote hinzufuegen"><Plus size={13} /></button>
          <button className="icon-btn" style={{ padding: '2px' }} onClick={onRefreshRemote} title="Remote aktualisieren" disabled={remoteSync.isFetching}><RefreshCw size={13} className={remoteSync.isFetching ? 'spin' : ''} /></button>
        </div>
      </div>

      {!collapsed && (
        <>
          {isHealthy ? (
            <div style={{ padding: '6px 8px', borderRadius: '6px', marginBottom: '6px', backgroundColor: 'rgba(63, 185, 80, 0.1)', border: '1px solid rgba(63, 185, 80, 0.22)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '0.76rem', color: '#9fe7aa' }}>{remoteStatus.title}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{remoteStatus.detail}</span>
            </div>
          ) : (
            <div style={{ padding: '8px', borderRadius: '6px', marginBottom: '6px', backgroundColor: remoteStatus.backgroundColor, border: `1px solid ${remoteStatus.borderColor}`, display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: remoteStatus.color }}>{remoteStatus.title}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{remoteStatus.detail}</span>

              {!remoteSync.hasUpstream && (
                <button
                  className="staging-tool-btn"
                  onClick={onSetUpstreamForCurrentBranch}
                  style={{ alignSelf: 'flex-start' }}
                  title="Setzt den aktuellen Branch auf origin/<branch> als Tracking-Branch"
                >
                  Upstream setzen
                </button>
              )}

              {remoteOnlyBranchesCount > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    {remoteOnlyBranchesCount} Branches nur auf Remote. Schnell auschecken:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {remoteOnlyPreview.map(branch => (
                      <button
                        key={branch}
                        className="staging-tool-btn"
                        style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                        onClick={() => onCheckoutRemoteBranch(branch)}
                        title={`Checkout von ${toShortRemoteBranch(branch)}`}
                      >
                        {toShortRemoteBranch(branch)}
                      </button>
                    ))}
                    {remoteOnlyBranchesCount > remoteOnlyPreview.length && (
                      <button
                        className="staging-tool-btn"
                        style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                        onClick={() => setIsRemoteBranchesDialogOpen(true)}
                        title="Alle Remote-Branches anzeigen"
                      >
                        Alle anzeigen ({remoteOnlyBranchesCount})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {remoteSync.lastFetchError && <span style={{ fontSize: '0.75rem', color: '#f85149' }}>{remoteSync.lastFetchError}</span>}
            </div>
          )}

          {remotes.map(r => (
            <div key={r.name} className="repo-list-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '4px' }}>
              <Globe size={13} style={{ color: 'var(--text-accent)', opacity: 0.7, flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 500, flexShrink: 0 }}>{r.name}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={r.url}>{r.url}</span>
              <button onClick={() => onRemoveRemote(r.name)} className="icon-btn repo-close-btn" style={{ padding: '2px', opacity: 0 }} title="Remote entfernen"><X size={11} /></button>
            </div>
          ))}
        </>
      )}

      <DialogFrame
        open={isRemoteBranchesDialogOpen}
        title="Remote-Branches ohne lokales Gegenstueck"
        onClose={() => setIsRemoteBranchesDialogOpen(false)}
        cancelLabel="Schliessen"
      >
        <p className="dialog-message">
          Diese Branches existieren auf dem Remote, aber nicht lokal. Du kannst sie direkt auschecken.
        </p>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', maxHeight: '320px' }}>
          {remoteOnlyBranches.map((branch) => (
            <div
              key={branch}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 9px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '0.77rem', color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {toShortRemoteBranch(branch)}
              </span>
              <button
                className="staging-tool-btn"
                onClick={() => {
                  onCheckoutRemoteBranch(branch);
                  setIsRemoteBranchesDialogOpen(false);
                }}
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              >
                Auschecken
              </button>
            </div>
          ))}
        </div>
      </DialogFrame>
    </>
  );
};
