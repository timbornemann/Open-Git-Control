import { create } from 'zustand';
import type { HostedRepository, HostingConnection, HostingProvider } from '@/types/hostingDtos';
import { queryClient } from '@/data/queryClient';

export const providerLabels: Record<HostingProvider, string> = {
  github: 'GitHub',
  forgejo: 'Forgejo',
  gitlab: 'GitLab',
  'bitbucket-cloud': 'Bitbucket Cloud',
  'bitbucket-data-center': 'Bitbucket Data Center',
};
export type HostingSection = 'repositories' | 'connections' | 'overview' | 'changes' | 'ci' | 'releases' | 'remotes';
interface HostingState {
  connections: HostingConnection[];
  selected: HostedRepository | null;
  section: HostingSection;
  connectionFilter: string;
  revision: number;
  setConnections: (connections: HostingConnection[]) => void;
  select: (repository: HostedRepository | null) => void;
  navigate: (section: HostingSection) => void;
  setConnectionFilter: (connectionId: string) => void;
  refresh: () => void;
}
export const useHostingState = create<HostingState>((set) => ({
  connections: [],
  selected: null,
  section: 'repositories',
  connectionFilter: '',
  revision: 0,
  setConnections: (connections) =>
    set((state) =>
      JSON.stringify(state.connections) === JSON.stringify(connections)
        ? {}
        : {
            connections,
            selected: state.selected && connections.some((c) => c.id === state.selected?.ref.connectionId && c.authenticated) ? state.selected : null,
          },
    ),
  select: (selected) => set({ selected, section: selected ? 'overview' : 'repositories' }),
  navigate: (section) => set({ section, ...(['repositories', 'connections', 'remotes'].includes(section) ? { selected: null } : {}) }),
  setConnectionFilter: (connectionFilter) => set({ connectionFilter, selected: null }),
  refresh: () => {
    void queryClient.invalidateQueries({ queryKey: ['hosting'], refetchType: 'none' });
    set((state) => ({ revision: state.revision + 1 }));
  },
}));
export const hostedRepositoryKey = (repository: HostedRepository) => `${repository.ref.connectionId}:${repository.ref.repositoryId}:${repository.ref.fullPath}`;
