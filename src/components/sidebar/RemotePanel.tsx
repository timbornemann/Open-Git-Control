import React, { useState } from 'react';
import { Edit2, Globe, Plus, RefreshCw, X } from 'lucide-react';
import type { RemoteInfo, RemoteSyncState } from '@/types/git';
import { useI18n } from '@/i18n';
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
  const trimmed = url
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
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
  const isHealthy =
    (remoteStatus.title === 'Remote ist aktuell' || remoteStatus.title === 'Remote is up to date') && !remoteSync.lastFetchError && remoteSync.hasUpstream;
  const statusVariant: 'success' | 'warning' | 'danger' = remoteSync.lastFetchError ? 'danger' : !remoteSync.hasUpstream ? 'warning' : 'success';
  const { t } = useI18n();

  return (
    <RepoCard>
      <RepoCardHeader
        title={t('generated.components.sidebar.remotepanel.remotes_339488fe')}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        toggleTitle={
          collapsed
            ? t('generated.components.sidebar.remotepanel.show_remotes_dc296466')
            : t('generated.components.sidebar.remotepanel.collapse_remotes_7e486557')
        }
        actions={
          <>
            <button
              className="icon-btn sidebar-row-action-icon"
              onClick={onAddRemote}
              title={t('generated.components.sidebar.remotepanel.add_remote_e2bcff09')}
            >
              <Plus size={13} />
            </button>
            <button
              className="icon-btn sidebar-row-action-icon"
              onClick={onRefreshRemote}
              title={t('generated.components.sidebar.remotepanel.refresh_remote_e97c388d')}
              disabled={remoteSync.isFetching}
            >
              <RefreshCw size={13} className={remoteSync.isFetching ? 'spin' : ''} />
            </button>
          </>
        }
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
                  {t('generated.components.sidebar.remotepanel.set_upstream_18b707c4')}
                </button>
              )}
            </div>
          </div>

          <div className="repo-card-scroll repo-scroll-sm remote-list-scroll">
            {remotes.length > 0 ? (
              <div className="remote-list">
                {remotes.map((remote) => {
                  const compactUrl = toCompactRemoteUrl(remote.url);

                  return (
                    <div
                      key={remote.name}
                      className="repo-list-row remote-row"
                      title={remote.url}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setRemoteCtxMenu({ x: e.clientX, y: e.clientY, remote });
                      }}
                    >
                      <Globe size={13} className="remote-row-icon" />
                      <span className="remote-row-copy">
                        <span className="remote-row-name">{remote.name}</span>
                        <span className="remote-row-url">{compactUrl}</span>
                      </span>
                      <span className="remote-row-actions">
                        <button
                          onClick={() => setRemoteCtxMenu({ x: 0, y: 0, remote })}
                          className="icon-btn repo-close-btn remote-row-action"
                          title={t('generated.components.sidebar.remotepanel.edit_remote_df039292')}
                        >
                          <Edit2 size={11} />
                        </button>
                        <button
                          onClick={() => onRemoveRemote(remote.name)}
                          className="icon-btn repo-close-btn remote-row-action"
                          title={t('generated.components.sidebar.remotepanel.remove_remote_7e7dee87')}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="repo-state-text">{t('generated.components.sidebar.remotepanel.no_remotes_configured_95a4103d')}</div>
            )}
          </div>

          {remoteCtxMenu && (
            <div className="ctx-menu-backdrop" onClick={() => setRemoteCtxMenu(null)}>
              <div
                className="ctx-menu"
                style={remoteCtxMenu.x > 0 ? { left: remoteCtxMenu.x, top: remoteCtxMenu.y } : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="ctx-menu-header remote-menu-header" title={remoteCtxMenu.remote.url}>
                  <span className="remote-menu-name">{remoteCtxMenu.remote.name}</span>
                  <span className="remote-menu-url">{toCompactRemoteUrl(remoteCtxMenu.remote.url)}</span>
                </div>
                <button
                  className="ctx-menu-item"
                  title={t('generated.components.sidebar.remotepanel.renames_this_remote_entry_a234cf05')}
                  onClick={() => {
                    const r = remoteCtxMenu.remote;
                    setRemoteCtxMenu(null);
                    onRenameRemote(r.name);
                  }}
                >
                  <span className="ctx-menu-icon">RN</span>
                  <MenuLabel
                    label={t('generated.components.layout.branchcontextmenu.rename_cd5280ff')}
                    help={t('generated.components.sidebar.remotepanel.changes_only_the_local_name_like_origin_or_upstream_7a662b12')}
                  />
                </button>
                <button
                  className="ctx-menu-item"
                  title={t('generated.components.sidebar.remotepanel.changes_the_url_this_remote_points_to_704788ac')}
                  onClick={() => {
                    const r = remoteCtxMenu.remote;
                    setRemoteCtxMenu(null);
                    onSetRemoteUrl(r.name, r.url);
                  }}
                >
                  <span className="ctx-menu-icon">URL</span>
                  <MenuLabel
                    label={t('generated.components.sidebar.remotepanel.change_url_0b212601')}
                    help={t('generated.components.sidebar.remotepanel.changes_the_target_for_fetch_pull_and_push_for_this_remo_ac8ea662')}
                  />
                </button>
                <div className="ctx-menu-sep" />
                <button
                  className="ctx-menu-item danger"
                  title={t('generated.components.sidebar.remotepanel.removes_this_remote_from_the_local_repository_configurat_dd7d558f')}
                  onClick={() => {
                    const r = remoteCtxMenu.remote;
                    setRemoteCtxMenu(null);
                    onRemoveRemote(r.name);
                  }}
                >
                  <span className="ctx-menu-icon">DEL</span>
                  <MenuLabel
                    label={t('generated.components.layout.sidebar.settingssidebarcontent.remove_d54fc957')}
                    help={t('generated.components.sidebar.remotepanel.deletes_only_the_local_remote_entry_the_remote_repositor_49a1b70d')}
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
