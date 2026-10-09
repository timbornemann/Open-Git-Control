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
  const openRepos = useGitStore((state) => state.openRepos);
  const onSwitchRepo = useGitStore((state) => state.onSwitchRepo);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const { tr } = useI18n();
  const repoName = activeRepo?.split(/[\\/]/).pop() ?? '';
  const repositories = activeRepo ? [activeRepo, ...openRepos.filter((repo) => normalizeRepoPathKey(repo) !== normalizeRepoPathKey(activeRepo))] : openRepos;
  return (
    <div className="analytics-sidebar">
      <div className="analytics-sidebar-repository">
        {activeRepo ? (
          <>
            <div className="analytics-sidebar-repository-title">
              <RepositoryIcon repoPath={activeRepo} name={repoName} size={26} />
              {repositories.length > 1 ? (
                <select
                  className="ui-field"
                  aria-label={tr('Aktives Repository', 'Active repository')}
                  title={activeRepo}
                  value={activeRepo}
                  onChange={(event) => void onSwitchRepo(event.target.value)}
                >
                  {repositories.map((repo) => (
                    <option key={repo} value={repo}>
                      {repo.split(/[\\/]/).pop()}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{repoName}</strong>
              )}
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
