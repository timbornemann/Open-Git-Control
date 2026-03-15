import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Globe, Plus, RefreshCw, X } from 'lucide-react';
import { RemoteInfo, RemoteSyncState } from '../../types/git';
import { DialogFrame } from '../DialogFrame';
import { useI18n } from '../../i18n';

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
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
  collapsed,
  onToggleCollapsed,
}) => {
  const [isRemoteBranchesDialogOpen, setIsRemoteBranchesDialogOpen] = useState(false);
  const remoteOnlyPreview = remoteOnlyBranches.slice(0, 3);
  const isHealthy = (remoteStatus.title === 'Remote ist aktuell' || remoteStatus.title === 'Remote is up to date') && remoteOnlyBranchesCount === 0 && !remoteSync.lastFetchError && remoteSync.hasUpstream;
  const { tr } = useI18n();

  return (
    <section className="repo-card">
      <div className="repo-card-header">
        <button
          className="icon-btn"
          onClick={onToggleCollapsed}
          style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px' }}
          title={collapsed ? tr('Remotes anzeigen', 'Show remotes') : tr('Remotes einklappen', 'Collapse remotes')}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span className="repo-card-title">{tr('Remotes', 'Remotes')}</span>
        </button>
        <div className="repo-card-actions">
          <button className="icon-btn" style={{ padding: '2px' }} onClick={onAddRemote} title={tr('Remote hinzufuegen', 'Add remote')}><Plus size={13} /></button>
          <button className="icon-btn" style={{ padding: '2px' }} onClick={onRefreshRemote} title={tr('Remote aktualisieren', 'Refresh remote')} disabled={remoteSync.isFetching}><RefreshCw size={13} className={remoteSync.isFetching ? 'spin' : ''} /></button>
        </div>
      </div>

      {!collapsed && (
        <div className="repo-card-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {isHealthy ? (
            <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: 'var(--status-success-soft)', border: '1px solid var(--status-success-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--status-success)' }}>{remoteStatus.title}</span>
              <span style={{ fontSize: '0.69rem', color: 'var(--text-secondary)' }}>{remoteStatus.detail}</span>
            </div>
          ) : (
            <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: remoteStatus.backgroundColor, border: `1px solid ${remoteStatus.borderColor}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: remoteStatus.color }}>{remoteStatus.title}</span>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{remoteStatus.detail}</span>

              {!remoteSync.hasUpstream && (
                <button className="staging-tool-btn" onClick={onSetUpstreamForCurrentBranch} style={{ alignSelf: 'flex-start' }}>
                  {tr('Upstream setzen', 'Set upstream')}
                </button>
              )}

              {remoteOnlyBranchesCount > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                    {tr(`${remoteOnlyBranchesCount} Branches nur auf Remote. Schnell auschecken:`, `${remoteOnlyBranchesCount} branches only on remote. Quick checkout:`)}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {remoteOnlyPreview.map(branch => (
                      <button key={branch} className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={() => onCheckoutRemoteBranch(branch)}>
                        {toShortRemoteBranch(branch)}
                      </button>
                    ))}
                    {remoteOnlyBranchesCount > remoteOnlyPreview.length && (
                      <button className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={() => setIsRemoteBranchesDialogOpen(true)}>
                        {tr(`Alle anzeigen (${remoteOnlyBranchesCount})`, `Show all (${remoteOnlyBranchesCount})`)}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {remoteSync.lastFetchError && <span style={{ fontSize: '0.73rem', color: 'var(--status-danger)' }}>{remoteSync.lastFetchError}</span>}
            </div>
          )}

          <div className="repo-card-scroll" style={{ maxHeight: '220px', paddingRight: '2px' }}>
            {remotes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {remotes.map(remote => (
                  <div key={remote.name} className="repo-list-row">
                    <Globe size={13} style={{ color: 'var(--text-accent)', opacity: 0.7, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 500, flexShrink: 0 }}>{remote.name}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={remote.url}>{remote.url}</span>
                    <button onClick={() => onRemoveRemote(remote.name)} className="icon-btn repo-close-btn" style={{ padding: '2px', opacity: 0 }} title={tr('Remote entfernen', 'Remove remote')}><X size={11} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="repo-state-text">{tr('Keine Remotes konfiguriert.', 'No remotes configured.')}</div>
            )}
          </div>
        </div>
      )}

      <DialogFrame
        open={isRemoteBranchesDialogOpen}
        title={tr('Remote-Branches ohne lokales Gegenstueck', 'Remote branches without local counterpart')}
        onClose={() => setIsRemoteBranchesDialogOpen(false)}
        cancelLabel={tr('Schliessen', 'Close')}
      >
        <p className="dialog-message">
          {tr('Diese Branches existieren auf dem Remote, aber nicht lokal. Du kannst sie direkt auschecken.', 'These branches exist on the remote, but not locally. You can check them out directly.')}
        </p>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', maxHeight: '320px' }}>
          {remoteOnlyBranches.map((branch) => (
            <div key={branch} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 9px', borderBottom: '1px solid var(--line-subtle)' }}>
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
                {tr('Auschecken', 'Checkout')}
              </button>
            </div>
          ))}
        </div>
      </DialogFrame>
    </section>
  );
};
