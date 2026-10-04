import { useEffect } from 'react';
import { useGitStore, useUIStore } from '@/contexts/AppStateContext';
import { hostingClient } from '@/services/hostingClient';
import { useI18n } from '@/i18n';
import { useHostingState, type HostingSection } from './hostingState';
import { useRepositoryHosting } from './useRepositoryHosting';
import './hosting.css';
import { useHostingConnections } from './useHostingConnections';

export function HostingSidebar({ local = false }: { local?: boolean }) {
  useHostingConnections();
  const { tr } = useI18n();
  const state = useHostingState();
  const { revision, setConnections } = state;
  const activeRepo = useGitStore((s) => s.activeRepo);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
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
  return (
    <div className="hosting-sidebar">
      <strong>Hosting</strong>
      {local && (
        <>
          <small>{target.repository?.fullName ?? tr('Hosting-Ziel auswählen', 'Select hosting target')}</small>
          <select
            aria-label={tr('Hosting-Ziel', 'Hosting target')}
            value={unique.findIndex(
              (e) =>
                e.remoteName === target.remoteName &&
                e.repository?.connectionId === target.repository?.ref.connectionId &&
                e.repository?.repositoryId === target.repository?.ref.repositoryId &&
                e.repository?.fullPath === target.repository?.ref.fullPath,
            )}
            onChange={(event) => {
              const endpoint = unique[Number(event.target.value)];
              if (endpoint) void target.choose(endpoint).catch((error: Error) => window.alert(error.message));
            }}
          >
            <option value={-1}>{tr('Ziel auswählen', 'Select target')}</option>
            {unique.map((e, index) => (
              <option key={`${e.remoteName}-${e.repository?.connectionId}-${e.repository?.repositoryId}`} value={index}>
                {e.remoteName} · {state.connections.find((c) => c.id === e.repository?.connectionId)?.label} · {e.repository?.fullPath}
              </option>
            ))}
          </select>
          {target.error && <small className="hosting-error">{target.error}</small>}
        </>
      )}
      <button onClick={() => open('repositories')}>{tr('Repository-Katalog', 'Repository catalog')}</button>
      <button onClick={() => open('connections')}>{tr('Konten & Server', 'Accounts & servers')}</button>
      {activeRepo && <button onClick={() => open('remotes')}>{tr('Remotes & Übertragungen', 'Remotes & transfers')}</button>}
      {local && target.repository && (
        <>
          <button onClick={() => open('changes')}>PR / MR</button>
          <button onClick={() => open('ci')}>CI</button>
          <button onClick={() => open('releases')}>{tr('Releases / Tags', 'Releases / tags')}</button>
        </>
      )}
    </div>
  );
}
