import { useEffect, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostingCapabilities } from '@/types/hostingDtos';
import { useHostingState, hostedRepositoryKey } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { useRepositoryHosting } from './useRepositoryHosting';
import { HostingChangeRequests } from './HostingChangeRequests';
import { HostingCiPanel } from './HostingCiPanel';
import { HostingReleases } from './HostingReleases';

export function HostingRepositoryDetail({
  repository,
  onClone,
  cloneBusy = false,
}: {
  repository: HostedRepository;
  onClone?: (repository: HostedRepository, useSsh?: boolean) => void;
  cloneBusy?: boolean;
}) {
  const { tr } = useI18n();
  const state = useHostingState();
  const activeRepo = useGitStore((s) => s.activeRepo);
  const local = useRepositoryHosting(activeRepo);
  const task = useHostingTask(hostedRepositoryKey(repository));
  const { run } = task;
  const [capabilities, setCapabilities] = useState<HostingCapabilities | null>(repository.capabilities ?? null);
  const [forkNamespace, setForkNamespace] = useState('');
  const [forkName, setForkName] = useState('');
  const [defaultBranchOnly, setDefaultBranchOnly] = useState(false);
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
  const section = ['changes', 'ci', 'releases'].includes(state.section) ? state.section : 'changes';
  return (
    <section className="hosting-detail">
      <header className="hosting-heading">
        <div>
          <h2>{repository.fullName}</h2>
          <small>{state.connections.find((c) => c.id === repository.ref.connectionId)?.label}</small>
        </div>
        <button onClick={() => state.select(null)}>×</button>
      </header>
      <p>{repository.description}</p>
      <div className="hosting-actions">
        <button onClick={() => void appClient.openExternalUrl(repository.htmlUrl)}>{tr('Im Browser öffnen', 'Open in browser')}</button>
        {onClone && (
          <button disabled={cloneBusy} onClick={() => onClone(repository)}>
            {tr('Dieses Repository klonen', 'Clone this repository')}
          </button>
        )}
        {onClone && repository.sshUrl && (
          <button disabled={cloneBusy} onClick={() => onClone(repository, true)}>
            {tr('Dieses Repository über SSH klonen', 'Clone this repository with SSH')}
          </button>
        )}
        {endpoint && (
          <button disabled={task.busy} onClick={() => void task.run(() => local.choose(endpoint))}>
            {tr('Als Hosting-Ziel für das lokale Repository setzen', 'Set as hosting target for local repository')}
          </button>
        )}
      </div>
      {capabilities?.reason && <p role="status">{capabilities.reason}</p>}
      {capabilities?.fork && (
        <details className="hosting-card">
          <summary>Fork</summary>
          <form
            className="hosting-form"
            onSubmit={(event) => {
              event.preventDefault();
              void task.run(
                () =>
                  hostingClient.request('fork', {
                    repository: repository.ref,
                    namespace: forkNamespace || undefined,
                    name: forkName || undefined,
                    defaultBranchOnly,
                  }),
                (fork) => {
                  state.refresh();
                  state.select(fork);
                },
              );
            }}
          >
            <label>
              {tr('Zielnamespace', 'Destination namespace')}
              <input value={forkNamespace} onChange={(e) => setForkNamespace(e.target.value)} />
            </label>
            <label>
              {tr('Optionaler Name', 'Optional name')}
              <input value={forkName} onChange={(e) => setForkName(e.target.value)} />
            </label>
            {capabilities.defaultBranchOnlyFork && (
              <label className="hosting-checkbox">
                <input type="checkbox" checked={defaultBranchOnly} onChange={(e) => setDefaultBranchOnly(e.target.checked)} />
                {tr('Nur Standardbranch', 'Default branch only')}
              </label>
            )}
            <button disabled={task.busy}>{tr('Fork erstellen', 'Create fork')}</button>
          </form>
        </details>
      )}
      <nav className="hosting-tabs">
        <button aria-pressed={section === 'changes'} onClick={() => state.navigate('changes')}>
          {capabilities?.changeRequestLabel ?? 'PR / MR'}
        </button>
        <button aria-pressed={section === 'ci'} onClick={() => state.navigate('ci')}>
          {capabilities?.ciLabel ?? 'CI'}
        </button>
        <button aria-pressed={section === 'releases'} onClick={() => state.navigate('releases')}>
          {capabilities?.releases === 'native'
            ? 'Releases'
            : capabilities?.releases === 'downloads'
              ? tr('Tags & Downloads', 'Tags & downloads')
              : tr('Tags & Notes', 'Tags & notes')}
        </button>
      </nav>
      {capabilities &&
        (section === 'ci' ? (
          <HostingCiPanel repository={repository} capabilities={capabilities} />
        ) : section === 'releases' ? (
          <HostingReleases repository={repository} capabilities={capabilities} repoPath={localPath} remoteName={endpoint?.remoteName ?? ''} />
        ) : (
          <HostingChangeRequests repository={repository} capabilities={capabilities} repoPath={localPath} />
        ))}
      {task.busy && <p role="status">{tr('Laden …', 'Loading …')}</p>}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </section>
  );
}
