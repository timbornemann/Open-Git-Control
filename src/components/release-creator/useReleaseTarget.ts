import { useEffect, useMemo, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import type { HostedRepository, HostedRepositoryRef, HostingCapabilities, RepositoryEndpoint } from '@/types/hostingDtos';
import { useHostingConnections } from '@/components/hosting/useHostingConnections';
import { useRepositoryHosting } from '@/components/hosting/useRepositoryHosting';
import { useHostingState } from '@/components/hosting/hostingState';

export const sameReleaseRepository = (left: HostedRepositoryRef | null | undefined, right: HostedRepositoryRef | null | undefined) =>
  Boolean(left && right && left.connectionId === right.connectionId && left.repositoryId === right.repositoryId && left.fullPath === right.fullPath);
const endpointKey = (endpoint: RepositoryEndpoint) =>
  JSON.stringify([endpoint.remoteName, endpoint.repository?.connectionId, endpoint.repository?.repositoryId, endpoint.repository?.fullPath]);

export function useReleaseTarget(repoPath: string | null, requested: HostedRepositoryRef | null) {
  useHostingConnections();
  const local = useRepositoryHosting(repoPath);
  const connections = useHostingState((state) => state.connections);
  const [choice, setChoice] = useState<RepositoryEndpoint | null>(null);
  const requestKey = JSON.stringify([repoPath, requested]);
  useEffect(() => {
    setChoice(null);
  }, [requestKey]);
  const choices = useMemo(
    () =>
      local.endpoints.filter((endpoint, index, all) => endpoint.repository && all.findIndex((other) => endpointKey(other) === endpointKey(endpoint)) === index),
    [local.endpoints],
  );
  const configured = local.repository
    ? choices.find((endpoint) => endpoint.remoteName === local.remoteName && sameReleaseRepository(endpoint.repository, local.repository?.ref))
    : null;
  const endpoint = choice
    ? (choices.find((candidate) => endpointKey(candidate) === endpointKey(choice)) ?? null)
    : requested
      ? (choices.find((candidate) => sameReleaseRepository(candidate.repository, requested)) ?? null)
      : (configured ?? (choices.length === 1 ? choices[0] : null));
  const connection = connections.find((entry) => entry.id === endpoint?.repository?.connectionId);
  const scope = JSON.stringify([repoPath, endpoint?.remoteName, endpoint?.url, endpoint?.repository, connection]);
  const [data, setData] = useState<{
    scope: string;
    repository: HostedRepository | null;
    capabilities: HostingCapabilities | null;
    error: string;
    loading: boolean;
  }>({ scope, repository: null, capabilities: null, error: '', loading: false });
  useEffect(() => {
    let active = true;
    setData({ scope, repository: null, capabilities: null, error: '', loading: Boolean(endpoint?.repository) });
    if (endpoint?.repository) {
      const repository = endpoint.repository;
      void Promise.all([
        hostingClient.request('repository', { repository }),
        hostingClient.request('capabilities', { connectionId: repository.connectionId, repository }),
      ])
        .then(([resolved, capabilities]) => {
          if (active) setData({ scope, repository: resolved, capabilities, error: '', loading: false });
        })
        .catch((reason: Error) => {
          if (active) setData({ scope, repository: null, capabilities: null, error: reason.message, loading: false });
        });
    }
    return () => {
      active = false;
    };
  }, [scope, endpoint?.repository]);
  return {
    choices,
    endpoint,
    connection,
    choose: setChoice,
    repository: data.scope === scope ? data.repository : null,
    capabilities: data.scope === scope ? data.capabilities : null,
    loading: local.loading || data.scope !== scope || data.loading,
    error: data.scope === scope ? data.error || local.error : local.error,
    scope,
  };
}
