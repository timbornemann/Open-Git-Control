import React from 'react';
import { FolderGit2, X } from 'lucide-react';

type Props = {
  openRepos: string[];
  activeRepo: string | null;
  onSwitchRepo: (repoPath: string) => void;
  onCloseRepo: (repoPath: string) => void;
  onOpenFolder: () => void;
};

export const RepoList: React.FC<Props> = ({ openRepos, activeRepo, onSwitchRepo, onCloseRepo, onOpenFolder }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
    {openRepos.map(repoPath => {
      const name = repoPath.split(/[\\/]/).pop() || repoPath;
      const isActive = repoPath === activeRepo;
      return (
        <div key={repoPath} className="repo-list-item" onClick={() => onSwitchRepo(repoPath)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent', borderRadius: '4px', cursor: 'pointer', border: isActive ? '1px solid var(--accent-primary)' : '1px solid transparent' }}>
          <FolderGit2 size={14} style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0, color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{name}</span>
          <button onClick={e => { e.stopPropagation(); onCloseRepo(repoPath); }} className="icon-btn repo-close-btn" style={{ padding: '2px', opacity: 0 }} title="Entfernen">
            <X size={12} />
          </button>
        </div>
      );
    })}
    {openRepos.length === 0 && (
      <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        <FolderGit2 size={36} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
        Kein Repository geöffnet.
        <button onClick={onOpenFolder} style={{ marginTop: '12px', display: 'block', width: '100%', padding: '8px 12px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
          Repository öffnen
        </button>
      </div>
    )}
  </div>
);
