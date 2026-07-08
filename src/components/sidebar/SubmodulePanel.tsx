import React from 'react';
import { Box, ExternalLink, RefreshCw, Wrench } from 'lucide-react';
import type { GitSubmoduleInfo } from '@/types/git';
import { useI18n } from '@/i18n';
import { RepoCard, RepoCardContent, RepoCardHeader } from './RepoCard';

type Props = {
  submodules: GitSubmoduleInfo[];
  onInitUpdate: () => void;
  onSync: () => void;
  onOpenSubmodule: (submodulePath: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

const stateColor = (entry: GitSubmoduleInfo): string => {
  if (entry.stateCode === 'conflicted') return 'var(--status-danger)';
  if (entry.stateCode === 'dirty') return 'var(--status-warning)';
  if (entry.stateCode === 'uninitialized') return 'var(--text-secondary)';
  return 'var(--status-success)';
};

export const SubmodulePanel: React.FC<Props> = ({ submodules, onInitUpdate, onSync, onOpenSubmodule, collapsed, onToggleCollapsed }) => {
  const { t } = useI18n();

  return (
    <RepoCard>
      <RepoCardHeader
        title={t('generated.components.sidebar.submodulepanel.submodules_1802c546')}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        toggleTitle={
          collapsed
            ? t('generated.components.sidebar.submodulepanel.show_submodules_96e676ee')
            : t('generated.components.sidebar.submodulepanel.collapse_submodules_654168fd')
        }
        actions={
          <>
            <button className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={onInitUpdate}>
              <RefreshCw size={11} /> {t('generated.components.sidebar.submodulepanel.init_update_1183a60c')}
            </button>
            <button className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={onSync}>
              <Wrench size={11} /> {t('generated.components.sidebar.submodulepanel.sync_2e16551b')}
            </button>
          </>
        }
      />

      {!collapsed && (
        <RepoCardContent className="repo-card-scroll repo-scroll-sm">
          {submodules.length === 0 ? (
            <div className="repo-state-text">{t('generated.components.sidebar.submodulepanel.no_submodules_found_0261816e')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {submodules.map((entry) => (
                <div
                  key={entry.path}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '7px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    backgroundColor: 'var(--bg-dark)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Box size={12} style={{ opacity: 0.8 }} />
                    <span
                      style={{ fontSize: '0.78rem', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {entry.path}
                    </span>
                    <button
                      className="icon-btn"
                      style={{ padding: '2px 5px' }}
                      onClick={() => onOpenSubmodule(entry.path)}
                      title={t('generated.components.sidebar.submodulepanel.open_submodule_7b936549')}
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{entry.commit}</div>
                  <div style={{ fontSize: '0.72rem', color: stateColor(entry) }}>
                    {entry.isDirty
                      ? t('generated.components.sidebar.submodulepanel.dirty_fc0b4270')
                      : t('generated.components.sidebar.submodulepanel.clean_e0f04064')}
                    {entry.summary ? ` | ${entry.summary}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </RepoCardContent>
      )}
    </RepoCard>
  );
};
