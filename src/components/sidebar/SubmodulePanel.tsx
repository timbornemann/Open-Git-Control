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
  if (entry.stateCode === 'uninitialized' || entry.stateCode === 'unknown') return 'var(--text-secondary)';
  return 'var(--status-success)';
};

const stateLabels: Record<GitSubmoduleInfo['stateCode'], readonly [string, string]> = {
  clean: ['Zielcommit ausgecheckt', 'Recorded commit checked out'],
  uninitialized: ['Nicht initialisiert', 'Not initialized'],
  dirty: ['Anderer Commit ausgecheckt', 'Different commit checked out'],
  conflicted: ['Konflikt', 'Conflict'],
  unknown: ['Status unbekannt', 'Unknown status'],
};

export const SubmodulePanel: React.FC<Props> = ({ submodules, onInitUpdate, onSync, onOpenSubmodule, collapsed, onToggleCollapsed }) => {
  const { t, tr } = useI18n();
  const openFolderLabel = tr('Submodulordner im Dateimanager öffnen', 'Open submodule folder in file manager');

  return (
    <RepoCard tutorialTarget="submodules">
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
            <button data-tutorial="submodule-update" className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={onInitUpdate}>
              <RefreshCw size={11} /> {t('generated.components.sidebar.submodulepanel.init_update_1183a60c')}
            </button>
            <button data-tutorial="submodule-sync" className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={onSync}>
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
                  data-submodule-path={entry.path}
                  data-submodule-state={entry.stateCode}
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
                      data-tutorial="submodule-open"
                      className="icon-btn"
                      style={{ padding: '2px 5px' }}
                      onClick={() => onOpenSubmodule(entry.path)}
                      title={openFolderLabel}
                      aria-label={openFolderLabel}
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                  <div data-submodule-field="commit" style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {entry.commit}
                  </div>
                  <div
                    data-submodule-field="state"
                    style={{ fontSize: '0.72rem', color: stateColor(entry) }}
                    title={tr(
                      'Vergleicht den ausgecheckten Submodul-Commit mit dem Zielcommit im Index des übergeordneten Repositorys.',
                      'Compares the checked-out submodule commit with the target commit in the parent repository’s index.',
                    )}
                  >
                    {tr(...stateLabels[entry.stateCode])}
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
