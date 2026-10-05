import { useEffect, useState } from 'react';
import { BookOpen, ChevronRight, GitPullRequest, RefreshCw, Server, Settings2, Tag, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGitStore, useUIStore } from '@/contexts/AppStateContext';
import { RepoCard, RepoCardContent, RepoCardHeader } from '@/components/sidebar/RepoCard';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { hostingClient } from '@/services/hostingClient';
import { useI18n } from '@/i18n';
import { useHostingState, type HostingSection } from './hostingState';
import { useRepositoryHosting } from './useRepositoryHosting';
import { HostingSidebarTarget } from './HostingSidebarTarget';
import { hostingRepositoryLabels } from './hostingLabels';
import './hosting.css';
import './hosting-sidebar.css';
import { useHostingConnections } from './useHostingConnections';

export function HostingSidebar({ local = false }: { local?: boolean }) {
  useHostingConnections();
  const { tr } = useI18n();
  const state = useHostingState();
  const { revision, setConnections } = state;
  const activeRepo = useGitStore((s) => s.activeRepo);
  const onToast = useGitStore((s) => s.onToast);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const onOpenRemoteConfig = useUIStore((s) => s.onOpenRemoteConfig);
  const [collapsed, setCollapsed] = useState(false);
  const target = useRepositoryHosting(activeRepo);
  useEffect(() => {
    let active = true;
    void hostingClient
      .request('connections', undefined)
      .then((connections) => {
        if (active) setConnections(connections);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [revision, setConnections]);
  const open = (section: HostingSection) => {
    if (local) state.select(target.repository);
    state.navigate(section);
    setActiveTab('hosting');
  };
  const unique = target.endpoints.filter(
    (endpoint, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.remoteName === endpoint.remoteName &&
          candidate.repository?.connectionId === endpoint.repository?.connectionId &&
          candidate.repository?.repositoryId === endpoint.repository?.repositoryId &&
          candidate.repository?.fullPath === endpoint.repository?.fullPath,
      ) === index,
  );
  const connection = state.connections.find((candidate) => candidate.id === target.repository?.ref.connectionId);
  const labels = hostingRepositoryLabels(connection?.provider, target.repository?.capabilities, tr);
  const link = (section: HostingSection, label: string, icon: ReactNode, onClick = () => open(section)) => (
    <Button
      variant="ghost"
      className="hosting-sidebar__link"
      icon={icon}
      aria-current={activeTab === 'hosting' && state.section === section ? 'page' : undefined}
      onClick={onClick}
    >
      <span className="hosting-sidebar__link-label">{label}</span>
      <ChevronRight size={12} aria-hidden="true" />
    </Button>
  );
  return (
    <RepoCard className="hosting-sidebar">
      <RepoCardHeader
        title="Hosting"
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        toggleTitle={collapsed ? tr('Hosting aufklappen', 'Expand hosting') : tr('Hosting einklappen', 'Collapse hosting')}
        actions={
          <IconButton
            size="xs"
            aria-label={tr('Hosting aktualisieren', 'Refresh hosting')}
            icon={<RefreshCw size={13} />}
            disabled={target.loading}
            onClick={state.refresh}
          />
        }
      />
      {!collapsed && (
        <RepoCardContent className="hosting-sidebar__content">
          {local && (
            <HostingSidebarTarget
              repository={target.repository}
              remoteName={target.remoteName}
              endpoints={unique}
              connections={state.connections}
              loading={target.loading}
              error={target.error}
              choose={(endpoint) => void target.choose(endpoint).catch((error: Error) => onToast(error.message, true))}
            />
          )}
          {local && target.repository && (
            <nav className="hosting-sidebar__navigation" aria-label={tr('Hosting-Funktionen für dieses Repository', 'Hosting features for this repository')}>
              {link('changes', labels.changes, <GitPullRequest size={14} />)}
              {link('ci', labels.ci, <Workflow size={14} />)}
              {link('releases', labels.releases, <Tag size={14} />)}
            </nav>
          )}
          <nav className="hosting-sidebar__navigation hosting-sidebar__management" aria-label={tr('Hosting-Verwaltung', 'Hosting management')}>
            <span className="hosting-sidebar__group-label">{tr('Verwalten', 'Manage')}</span>
            {activeRepo && link('remotes', tr('Remote-Konfiguration', 'Remote configuration'), <Settings2 size={14} />, onOpenRemoteConfig)}
            {link('repositories', tr('Repository-Katalog', 'Repository catalog'), <BookOpen size={14} />)}
            {link('connections', tr('Konten & Server', 'Accounts & servers'), <Server size={14} />)}
          </nav>
        </RepoCardContent>
      )}
    </RepoCard>
  );
}
