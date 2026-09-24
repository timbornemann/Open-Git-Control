import React from 'react';
import { GitFork, Github, LogOut, RefreshCw, Download } from 'lucide-react';
import { useGithubContext, useRepositoryContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';

export const GITHUB_CATALOG_REFRESH_EVENT = 'ogc:github-catalog-refresh';

export const GithubSidebarContainer: React.FC = React.memo(() => {
  const github = useGithubContext();
  const repository = useRepositoryContext();
  const { tr } = useI18n();

  return (
    <div className="github-sidebar-compact">
      <div className="github-account-summary">
        <div className="github-account-summary__identity">
          <Github size={16} />
          <span className="github-account-summary__name">{github.isAuthenticated ? github.githubUser || 'GitHub' : tr('Nicht verbunden', 'Not connected')}</span>
        </div>
        {github.isAuthenticated && (
          <button className="icon-btn" aria-label={tr('Von GitHub abmelden', 'Sign out of GitHub')} title={tr('Abmelden', 'Sign out')} onClick={github.onLogout}><LogOut size={15} /></button>
        )}
      </div>
      {github.isAuthenticated ? (
        <div className="github-sidebar-compact__actions">
          <button onClick={repository.onCloneByUrl}><Download size={15} /> {tr('Klonen per URL', 'Clone by URL')}</button>
          <button onClick={github.onForkByUrl}><GitFork size={15} /> {tr('Forken per URL', 'Fork by URL')}</button>
          <button onClick={() => window.dispatchEvent(new window.Event(GITHUB_CATALOG_REFRESH_EVENT))}><RefreshCw size={15} /> {tr('Aktualisieren', 'Refresh')}</button>
        </div>
      ) : <p className="sidebar-meta-text">{tr('Verbinde dein Konto im Hauptbereich, um Repositories und Aktivitäten zu sehen.', 'Connect your account in the main area to see repositories and activity.')}</p>}
    </div>
  );
});

GithubSidebarContainer.displayName = 'GithubSidebarContainer';
