import { FolderOpen } from 'lucide-react';
import { useGitStore, useUIStore } from '@/contexts/AppStateContext';
import { RepositoryIcon } from '@/components/repository-icon/RepositoryIcon';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { AnalyticsNavigation } from './AnalyticsNavigation';
import { RepositoryAnalyticsFilters } from './AnalyticsFilters';

export function RepositoryAnalyticsSidebar() {
  const activeRepo = useGitStore((state) => state.activeRepo);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const { tr } = useI18n();
  const repoName = activeRepo?.split(/[\\/]/).pop() ?? '';
  return (
    <div className="analytics-sidebar">
      <div className="analytics-sidebar-repository">
        {activeRepo ? (
          <>
            <div className="analytics-sidebar-repository-title">
              <RepositoryIcon repoPath={activeRepo} name={repoName} size={26} />
              <strong title={repoName}>{repoName}</strong>
            </div>
            <small className="analytics-sidebar-repository-path" title={activeRepo}>
              {activeRepo}
            </small>
          </>
        ) : (
          <>
            <p>{tr('Wähle ein lokales Repository für die Auswertung.', 'Choose a local repository to analyze.')}</p>
            <Button size="sm" variant="secondary" icon={<FolderOpen size={14} />} onClick={() => setActiveTab('localRepos')}>
              {tr('Repository auswählen', 'Choose repository')}
            </Button>
          </>
        )}
      </div>
      <AnalyticsNavigation repoPath={activeRepo} />
      {activeRepo && <RepositoryAnalyticsFilters key={normalizeRepoPathKey(activeRepo)} repoPath={activeRepo} />}
    </div>
  );
}
