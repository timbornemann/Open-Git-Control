import React from 'react';
import { ChevronRight, Download, FolderPlus } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { RepositoryIcon } from '@/components/repository-icon/RepositoryIcon';
import { useRepositoryIconMenu } from '@/components/repository-icon/RepositoryIconMenu';

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
  const logoMenu = useRepositoryIconMenu();
  const activeName = activeRepo?.split(/[\\/]/).filter(Boolean).pop() || activeRepo;

  return (
    <div className="local-repos-sidebar">
      <div className="local-repos-sidebar__count">
        <span>{tr('Gespeichert', 'Saved')}</span>
        <strong>{count}</strong>
      </div>
      <section className="local-repos-sidebar__workspace" aria-label={tr('Aktives Repository', 'Active repository')}>
        <h2 className="local-repos-sidebar__group-label">{tr('Aktives Repository', 'Active repository')}</h2>
        {activeRepo ? (
          <Button
            variant="ghost"
            className="local-repos-sidebar__active"
            icon={<RepositoryIcon repoPath={activeRepo} name={activeName || activeRepo} size={26} />}
            onClick={onOpenRepoTab}
            title={activeRepo}
            onContextMenu={(event) => logoMenu.open(event, activeRepo)}
            onKeyDown={(event) => logoMenu.keyboard(event, activeRepo)}
          >
            <span className="local-repos-sidebar__active-label">
              <strong>{activeName}</strong>
              <em>{activeRepo}</em>
            </span>
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        ) : (
          <p className="local-repos-sidebar__empty" role="status">
            {isRestoringRepos
              ? tr('Repositories werden wiederhergestellt …', 'Restoring repositories …')
              : tr('Kein Repository aktiv.', 'No active repository.')}
          </p>
        )}
      </section>
      <nav className="local-repos-sidebar__actions" aria-label={tr('Repository-Aktionen', 'Repository actions')}>
        <h2 className="local-repos-sidebar__group-label">{tr('Aktionen', 'Actions')}</h2>
        <Button variant="ghost" icon={<FolderPlus size={15} />} onClick={onOpenFolder}>
          {tr('Repository hinzufügen', 'Add repository')}
        </Button>
        <Button variant="ghost" icon={<Download size={15} />} onClick={onCloneByUrl}>
          {tr('Per URL klonen', 'Clone from URL')}
        </Button>
      </nav>
      {logoMenu.menu}
    </div>
  );
};
