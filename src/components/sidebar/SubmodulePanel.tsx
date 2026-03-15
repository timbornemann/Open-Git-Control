import React from 'react';
import { Box, ExternalLink, RefreshCw, Wrench } from 'lucide-react';
import { GitSubmoduleInfo } from '../../types/git';
import { useI18n } from '../../i18n';
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

export const SubmodulePanel: React.FC<Props> = ({
  submodules,
  onInitUpdate,
  onSync,
  onOpenSubmodule,
  collapsed,
  onToggleCollapsed,
}) => {
  const { tr } = useI18n();

  return (
    <RepoCard>
      <RepoCardHeader
        title={tr('Submodule', 'Submodules')}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        toggleTitle={collapsed ? tr('Submodule anzeigen', 'Show submodules') : tr('Submodule einklappen', 'Collapse submodules')}
        actions={(
          <>
            <button className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={onInitUpdate}><RefreshCw size={11} /> {tr('Init/Update', 'Init/Update')}</button>
            <button className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={onSync}><Wrench size={11} /> {tr('Sync', 'Sync')}</button>
          </>
        )}
      />

      {!collapsed && (
        <RepoCardContent className="repo-card-scroll repo-scroll-sm">
          {submodules.length === 0 ? (
            <div className="repo-state-text">{tr('Keine Submodule gefunden.', 'No submodules found.')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {submodules.map((entry) => (
                <div key={entry.path} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '7px 8px', display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: 'var(--bg-dark)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Box size={12} style={{ opacity: 0.8 }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.path}</span>
                    <button className="icon-btn" style={{ padding: '2px 5px' }} onClick={() => onOpenSubmodule(entry.path)} title={tr('Submodule oeffnen', 'Open submodule')}>
                      <ExternalLink size={12} />
                    </button>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{entry.commit}</div>
                  <div style={{ fontSize: '0.72rem', color: stateColor(entry) }}>
                    {entry.isDirty ? tr('Dirty', 'Dirty') : tr('Sauber', 'Clean')}
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
