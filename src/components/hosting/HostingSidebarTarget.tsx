import { ChevronDown, Globe, User } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostingConnection, RepositoryEndpoint } from '@/types/hostingDtos';
import { providerLabels } from './hostingState';

type Props = {
  repository: HostedRepository | null;
  remoteName: string;
  endpoints: RepositoryEndpoint[];
  connections: HostingConnection[];
  loading: boolean;
  error: string | null;
  choose: (endpoint: RepositoryEndpoint) => void;
};

export function HostingSidebarTarget({ repository, remoteName, endpoints, connections, loading, error, choose }: Props) {
  const { tr } = useI18n();
  const connection = connections.find((candidate) => candidate.id === repository?.ref.connectionId);
  const selected = endpoints.findIndex(
    (endpoint) =>
      endpoint.remoteName === remoteName &&
      endpoint.repository?.connectionId === repository?.ref.connectionId &&
      endpoint.repository?.repositoryId === repository?.ref.repositoryId &&
      endpoint.repository?.fullPath === repository?.ref.fullPath,
  );
  return (
    <div className="hosting-sidebar__target">
      {repository ? (
        <>
          <div className="hosting-sidebar__provider">
            <Globe size={13} aria-hidden="true" />
            <span>{connection ? providerLabels[connection.provider] : 'Hosting'}</span>
            <span className="hosting-sidebar__remote" title={remoteName}>
              {remoteName}
            </span>
          </div>
          <strong className="hosting-sidebar__repository" title={repository.fullName}>
            {repository.fullName}
          </strong>
          {connection && (
            <>
              <span className="hosting-sidebar__server" title={connection.baseUrl}>
                {connection.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </span>
              <span className="hosting-sidebar__account" title={connection.label}>
                <User size={12} aria-hidden="true" />
                <span>{connection.username ? `@${connection.username}` : connection.label}</span>
              </span>
            </>
          )}
        </>
      ) : (
        <p className="hosting-sidebar__hint" role="status">
          {loading
            ? tr('Hosting-Ziel laden …', 'Loading hosting target …')
            : tr(
                'Wähle ein Hosting-Ziel für PRs, CI und Releases. Lokale Git-Funktionen bleiben verfügbar.',
                'Choose a hosting target for PRs, CI and releases. Local Git features remain available.',
              )}
        </p>
      )}
      {(endpoints.length > 1 || (!repository && endpoints.length > 0)) && (
        <label className="hosting-sidebar__target-picker">
          <span>{tr('Hosting-Ziel wechseln', 'Switch hosting target')}</span>
          <div className="hosting-sidebar__select">
            <select
              aria-label={tr('Hosting-Ziel', 'Hosting target')}
              disabled={loading}
              value={selected}
              onChange={(event) => {
                const endpoint = endpoints[Number(event.target.value)];
                if (endpoint) choose(endpoint);
              }}
            >
              {selected < 0 && <option value={-1}>{tr('Ziel auswählen', 'Select target')}</option>}
              {endpoints.map((endpoint, index) => (
                <option
                  key={`${endpoint.remoteName}-${endpoint.repository?.connectionId}-${endpoint.repository?.repositoryId}-${endpoint.repository?.fullPath}`}
                  value={index}
                >
                  {endpoint.remoteName} ·{' '}
                  {connections.find((account) => account.id === endpoint.repository?.connectionId)?.label ?? endpoint.repository?.fullPath}
                </option>
              ))}
            </select>
            <ChevronDown size={12} aria-hidden="true" />
          </div>
        </label>
      )}
      {error && (
        <p className="hosting-sidebar__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
