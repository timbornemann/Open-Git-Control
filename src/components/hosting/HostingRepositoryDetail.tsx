import { useEffect, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, FolderGit2, GitFork, GitPullRequest, LayoutDashboard, Tag, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostingCapabilities } from '@/types/hostingDtos';
import { useHostingState, hostedRepositoryKey, providerLabels } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { useRepositoryHosting } from './useRepositoryHosting';
import { hostingRepositoryLabels } from './hostingLabels';
import { HostingChangeRequests } from './HostingChangeRequests';
import { HostingCiPanel } from './HostingCiPanel';
import { HostingReleases } from './HostingReleases';
import { HostingRepositoryOverview } from './HostingRepositoryOverview';
import { HostingForkDialog } from './HostingForkDialog';
import { HostingActiveRepositoryMark, HostingRepositoryIcon, hostingLocalRepositoryIdentity } from './HostingRepositoryIdentity';

export function HostingRepositoryDetail({
  repository,
  onClone,
  cloneBusy = false,
  localPaths = [],
  onActivateLocal,
}: {
  repository: HostedRepository;
  onClone?: (repository: HostedRepository, useSsh?: boolean) => void;
  cloneBusy?: boolean;
  localPaths?: string[];
  onActivateLocal?: (path: string) => void;
}) {
  const { tr } = useI18n();
  const state = useHostingState();
  const activeRepo = useGitStore((s) => s.activeRepo);
  const local = useRepositoryHosting(activeRepo);
  const task = useHostingTask(hostedRepositoryKey(repository));
  const { run } = task;
  const [capabilities, setCapabilities] = useState<HostingCapabilities | null>(repository.capabilities ?? null);
  const [forkOpen, setForkOpen] = useState(false);
  useEffect(() => {
    void run(() => hostingClient.request('capabilities', { connectionId: repository.ref.connectionId, repository: repository.ref }), setCapabilities);
  }, [repository, state.revision, run]);
  const endpoint = local.endpoints.find(
    (e) =>
      e.repository?.connectionId === repository.ref.connectionId &&
      e.repository?.repositoryId === repository.ref.repositoryId &&
      e.repository?.fullPath === repository.ref.fullPath,
  );
  const localPath = endpoint ? activeRepo : null;
  const localIdentity = hostingLocalRepositoryIdentity(localPath ? [localPath, ...localPaths] : localPaths, activeRepo);
  const connection = state.connections.find((c) => c.id === repository.ref.connectionId);
  const labels = hostingRepositoryLabels(connection?.provider, capabilities, tr);
  const section = ['changes', 'ci', 'releases'].includes(state.section) ? state.section : 'overview';
  return (
    <section className="hosting-detail">
      <div className="hosting-detail__back">
        <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => state.navigate('repositories')}>
          {tr('Alle Repositories', 'All repositories')}
        </Button>
      </div>
      <header className="hosting-page-header hosting-detail__header">
        <div className="hosting-detail__identity">
          <HostingRepositoryIcon path={localIdentity.path} name={repository.name} size={32} />
          <div>
            <div className="hosting-detail__account">
              <StatusBadge tone="accent">{connection ? providerLabels[connection.provider] : 'Hosting'}</StatusBadge>
              {localIdentity.isActive && <HostingActiveRepositoryMark />}
              <span>{connection?.label}</span>
              {connection && (
                <span className="hosting-detail__server" title={connection.baseUrl}>
                  {connection.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </span>
              )}
            </div>
            <h1>{repository.fullName}</h1>
            <p>{repository.description || tr('Keine Beschreibung vorhanden.', 'No description available.')}</p>
          </div>
        </div>
        <div className="hosting-header-actions">
          <Button variant="ghost" icon={<ExternalLink size={14} />} onClick={() => void appClient.openExternalUrl(repository.htmlUrl)}>
            {tr('Im Browser öffnen', 'Open in browser')}
          </Button>
          {onClone && (
            <Button
              icon={<Download size={14} />}
              aria-label={tr('Dieses Repository klonen', 'Clone this repository')}
              disabled={cloneBusy}
              onClick={() => onClone(repository)}
            >
              {tr('Klonen', 'Clone')}
            </Button>
          )}
          {onClone && repository.sshUrl && (
            <Button
              aria-label={tr('Dieses Repository über SSH klonen', 'Clone this repository with SSH')}
              disabled={cloneBusy}
              onClick={() => onClone(repository, true)}
            >
              SSH
            </Button>
          )}
          {capabilities?.fork && (
            <Button icon={<GitFork size={14} />} disabled={task.busy} onClick={() => setForkOpen(true)}>
              Fork
            </Button>
          )}
        </div>
      </header>
      {endpoint && (
        <div className="hosting-detail__binding">
          <FolderGit2 size={14} />
          <span title={activeRepo ?? ''}>{activeRepo}</span>
          <Button size="xs" disabled={task.busy} onClick={() => void task.run(() => local.choose(endpoint))}>
            {tr('Als Hosting-Ziel für das lokale Repository setzen', 'Set as hosting target for local repository')}
          </Button>
        </div>
      )}
      {capabilities?.reason && (
        <p className="hosting-notice" role="status">
          {capabilities.reason}
        </p>
      )}
      <div className="hosting-detail__tabs">
        <SegmentedControl
          ariaLabel={tr('Repository-Bereiche', 'Repository sections')}
          value={section}
          onChange={state.navigate}
          options={[
            {
              value: 'overview',
              label: (
                <>
                  <LayoutDashboard size={14} />
                  {tr('Überblick', 'Overview')}
                </>
              ),
            },
            {
              value: 'changes',
              label: (
                <>
                  <GitPullRequest size={14} />
                  {labels.changes}
                </>
              ),
            },
            {
              value: 'ci',
              label: (
                <>
                  <Workflow size={14} />
                  {labels.ci}
                </>
              ),
            },
            {
              value: 'releases',
              label: (
                <>
                  <Tag size={14} />
                  {labels.releases}
                </>
              ),
            },
          ]}
        />
      </div>
      <div className={`hosting-detail__content${section === 'overview' ? ' hosting-detail__content--overview' : ''}`}>
        {section === 'overview' ? (
          <HostingRepositoryOverview
            repository={repository}
            connection={connection}
            localPaths={localPaths}
            activeRepo={activeRepo}
            onActivateLocal={onActivateLocal}
            busy={cloneBusy}
          />
        ) : (
          capabilities &&
          (section === 'ci' ? (
            <HostingCiPanel repository={repository} capabilities={capabilities} />
          ) : section === 'releases' ? (
            <HostingReleases
              repository={repository}
              capabilities={capabilities}
              repoPath={localPath}
              remoteName={endpoint?.remoteName ?? ''}
              endpointUrl={endpoint?.url}
            />
          ) : (
            <HostingChangeRequests repository={repository} capabilities={capabilities} repoPath={localPath} />
          ))
        )}
      </div>
      {task.busy && (
        <p className="hosting-notice" role="status">
          {tr('Laden …', 'Loading …')}
        </p>
      )}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
      {capabilities?.fork && <HostingForkDialog repository={repository} capabilities={capabilities} open={forkOpen} onClose={() => setForkOpen(false)} />}
    </section>
  );
}
