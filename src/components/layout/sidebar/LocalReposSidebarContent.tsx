import React from 'react';
import { Download, FolderGit2, FolderPlus } from 'lucide-react';
import { useI18n } from '@/i18n';

type Props = {
  activeRepo: string | null;
  count: number;
  isRestoringRepos: boolean;
  onOpenRepoTab: () => void;
  onOpenFolder: () => void;
  onCloneByUrl: () => void;
};

export const LocalReposSidebarContent: React.FC<Props> = ({ activeRepo, count, isRestoringRepos, onOpenRepoTab, onOpenFolder, onCloneByUrl }) => {
  const { tr } = useI18n();
  const activeName = activeRepo?.split(/[\\/]/).filter(Boolean).pop() || activeRepo;

  return (
    <div className="local-repos-sidebar">
      <div className="local-repos-sidebar__count">
        <span>{tr('Gespeichert', 'Saved')}</span>
        <strong>{count}</strong>
      </div>
      {activeRepo ? (
        <button type="button" className="local-repos-sidebar__active" onClick={onOpenRepoTab} title={activeRepo}>
          <FolderGit2 size={17} />
          <span>
            <small>{tr('Aktives Repository', 'Active repository')}</small>
            <strong>{activeName}</strong>
            <em>{activeRepo}</em>
          </span>
        </button>
      ) : (
        <p className="local-repos-sidebar__empty">
          {isRestoringRepos ? tr('Repositories werden wiederhergestellt …', 'Restoring repositories …') : tr('Kein Repository aktiv.', 'No active repository.')}
        </p>
      )}
      <div className="local-repos-sidebar__actions">
        <button type="button" onClick={onOpenFolder}>
          <FolderPlus size={15} /> {tr('Repository hinzufügen', 'Add repository')}
        </button>
        <button type="button" onClick={onCloneByUrl}>
          <Download size={15} /> {tr('Per URL klonen', 'Clone from URL')}
        </button>
      </div>
    </div>
  );
};
