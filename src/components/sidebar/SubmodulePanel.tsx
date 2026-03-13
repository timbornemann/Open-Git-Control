import React from 'react';
import { Box, ChevronDown, ChevronRight, ExternalLink, RefreshCw, Wrench } from 'lucide-react';
import { GitSubmoduleInfo } from '../../types/git';
import { useI18n } from '../../i18n';

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
    <>
      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 6px' }}>
        <button className="icon-btn" onClick={onToggleCollapsed} style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
            {tr('Submodule', 'Submodules')}
          </span>
        </button>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={onInitUpdate}>
            <RefreshCw size={11} /> {tr('Init/Update', 'Init/Update')}
          </button>
          <button className="staging-tool-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={onSync}>
            <Wrench size={11} /> {tr('Sync', 'Sync')}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {submodules.length === 0 ? (
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', padding: '2px 8px 8px' }}>
              {tr('Keine Submodule gefunden.', 'No submodules found.')}
            </div>
          ) : (
            submodules.map((entry) => (
              <div key={entry.path} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '7px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Box size={12} style={{ opacity: 0.8 }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, flex: 1 }}>{entry.path}</span>
                  <button className="icon-btn" style={{ padding: '2px 5px' }} onClick={() => onOpenSubmodule(entry.path)} title={tr('Submodule öffnen', 'Open submodule')}>
                    <ExternalLink size={12} />
                  </button>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {entry.commit}
                </div>
                <div style={{ fontSize: '0.72rem', color: stateColor(entry) }}>
                  {entry.isDirty ? tr('Dirty', 'Dirty') : tr('Sauber', 'Clean')}
                  {entry.summary ? ` · ${entry.summary}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
};
