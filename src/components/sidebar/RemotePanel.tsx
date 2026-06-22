import React, { useState } from 'react';
import { Edit2, Globe, Plus, RefreshCw, X } from 'lucide-react';
import { RemoteInfo, RemoteSyncState } from '../../types/git';
import { useI18n } from '../../i18n';
import { RepoCard, RepoCardContent, RepoCardHeader } from './RepoCard';

type RemoteStatus = {
  title: string;
  detail: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
};

type RemoteContextMenu = { x: number; y: number; remote: RemoteInfo } | null;

type MenuLabelProps = {
  label: React.ReactNode;
  help: React.ReactNode;
};

type Props = {
  remotes: RemoteInfo[];
  remoteSync: RemoteSyncState;
  remoteStatus: RemoteStatus;
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  onRenameRemote: (name: string) => void;
  onSetRemoteUrl: (name: string, currentUrl: string) => void;
  onRefreshRemote: () => void;
  onSetUpstreamForCurrentBranch: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

const toCompactRemoteUrl = (url: string) => {
  const trimmed = url.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

  try {
    const parsed = new URL(trimmed);
    return `${parsed.hostname}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').replace(/^ssh:\/\//i, '');
  }
};

const MenuLabel: React.FC<MenuLabelProps> = ({ label, help }) => (
  <span className="ctx-menu-label">
    <span>{label}</span>
    <span className="ctx-menu-help">{help}</span>
  </span>
);

export const RemotePanel: React.FC<Props> = ({
  remotes,
  remoteSync,
  remoteStatus,
  onAddRemote,
  onRemoveRemote,
  onRenameRemote,
  onSetRemoteUrl,
  onRefreshRemote,
  onSetUpstreamForCurrentBranch,
  collapsed,
  onToggleCollapsed,
}) => {
  const [remoteCtxMenu, setRemoteCtxMenu] = useState<RemoteContextMenu>(null);
  const isHealthy = (remoteStatus.title === 'Remote ist aktuell' || remoteStatus.title === 'Remote is up to date') && !remoteSync.lastFetchError && remoteSync.hasUpstream;
  const statusVariant: 'success' | 'warning' | 'danger' =
    remoteSync.lastFetchError ? 'danger' : !remoteSync.hasUpstream ? 'warning' : 'success';
  const { tr } = useI18n();

  return (
    <RepoCard>
      <RepoCardHeader
        title={tr('Remotes', 'Remotes')}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        toggleTitle={collapsed ? tr('Remotes anzeigen', 'Show remotes') : tr('Remotes einklappen', 'Collapse remotes')}
        actions={(
          <>
            <button className="icon-btn sidebar-row-action-icon" onClick={onAddRemote} title={tr('Remote hinzufuegen', 'Add remote')}><Plus size={13} /></button>
            <button className="icon-btn sidebar-row-action-icon" onClick={onRefreshRemote} title={tr('Remote aktualisieren', 'Refresh remote')} disabled={remoteSync.isFetching}><RefreshCw size={13} className={remoteSync.isFetching ? 'spin' : ''} /></button>
          </>
        )}
      />

      {!collapsed && (
        <RepoCardContent className="remote-card-content">
          <div className="remote-overview-list">
            <div className={`remote-overview-row remote-overview-row-${isHealthy ? 'success' : statusVariant}`}>
              <span className="remote-overview-marker" />
              <span className="remote-overview-copy">
                <span className="remote-overview-title">{remoteStatus.title}</span>
                {remoteStatus.detail && <span className="remote-overview-detail">{remoteStatus.detail}</span>}
              </span>
              {!remoteSync.hasUpstream && (
                <button className="staging-tool-btn remote-overview-action" onClick={onSetUpstreamForCurrentBranch}>
                  {tr('Upstream setzen', 'Set upstream')}
                </button>
              )}
            </div>

          </div>

          <div className="repo-card-scroll repo-scroll-sm remote-list-scroll">
            {remotes.length > 0 ? (
              <div className="remote-list">
                {remotes.map(remote => {
                  const compactUrl = toCompactRemoteUrl(remote.url);

                  return (
                    <div
                      key={remote.name}
                      className="repo-list-row remote-row"
                      title={remote.url}
                      onContextMenu={e => { e.preventDefault(); setRemoteCtxMenu({ x: e.clientX, y: e.clientY, remote }); }}
                    >
                      <Globe size={13} className="remote-row-icon" />
                      <span className="remote-row-copy">
                        <span className="remote-row-name">{remote.name}</span>
                        <span className="remote-row-url">{compactUrl}</span>
                      </span>
                      <span className="remote-row-actions">
                        <button onClick={() => setRemoteCtxMenu({ x: 0, y: 0, remote })} className="icon-btn repo-close-btn remote-row-action" title={tr('Remote bearbeiten', 'Edit remote')}><Edit2 size={11} /></button>
                        <button onClick={() => onRemoveRemote(remote.name)} className="icon-btn repo-close-btn remote-row-action" title={tr('Remote entfernen', 'Remove remote')}><X size={11} /></button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="repo-state-text">{tr('Keine Remotes konfiguriert.', 'No remotes configured.')}</div>
            )}
          </div>

          {remoteCtxMenu && (
            <div className="ctx-menu-backdrop" onClick={() => setRemoteCtxMenu(null)}>
              <div
                className="ctx-menu"
                style={remoteCtxMenu.x > 0 ? { left: remoteCtxMenu.x, top: remoteCtxMenu.y } : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="ctx-menu-header remote-menu-header" title={remoteCtxMenu.remote.url}>
                  <span className="remote-menu-name">{remoteCtxMenu.remote.name}</span>
                  <span className="remote-menu-url">{toCompactRemoteUrl(remoteCtxMenu.remote.url)}</span>
                </div>
                <button
                  className="ctx-menu-item"
                  title={tr('Benennt diesen Remote-Eintrag um.', 'Renames this remote entry.')}
                  onClick={() => { const r = remoteCtxMenu.remote; setRemoteCtxMenu(null); onRenameRemote(r.name); }}
                >
                  <span className="ctx-menu-icon">RN</span>
                  <MenuLabel
                    label={tr('Umbenennen', 'Rename')}
                    help={tr('Aendert nur den lokalen Namen wie origin oder upstream.', 'Changes only the local name like origin or upstream.')}
                  />
                </button>
                <button
                  className="ctx-menu-item"
                  title={tr('Aendert die URL, zu der dieser Remote zeigt.', 'Changes the URL this remote points to.')}
                  onClick={() => { const r = remoteCtxMenu.remote; setRemoteCtxMenu(null); onSetRemoteUrl(r.name, r.url); }}
                >
                  <span className="ctx-menu-icon">URL</span>
                  <MenuLabel
                    label={tr('URL aendern', 'Change URL')}
                    help={tr('Wechselt das Ziel fuer Fetch, Pull und Push dieses Remotes.', 'Changes the target for fetch, pull, and push for this remote.')}
                  />
                </button>
                <div className="ctx-menu-sep" />
                <button
                  className="ctx-menu-item danger"
                  title={tr('Entfernt diesen Remote aus der lokalen Repository-Konfiguration.', 'Removes this remote from the local repository configuration.')}
                  onClick={() => { const r = remoteCtxMenu.remote; setRemoteCtxMenu(null); onRemoveRemote(r.name); }}
                >
                  <span className="ctx-menu-icon">DEL</span>
                  <MenuLabel
                    label={tr('Entfernen', 'Remove')}
                    help={tr('Loescht nur den Remote-Eintrag lokal. Das entfernte Repository bleibt bestehen.', 'Deletes only the local remote entry. The remote repository remains untouched.')}
                  />
                </button>
              </div>
            </div>
          )}
        </RepoCardContent>
      )}
    </RepoCard>
  );
};
