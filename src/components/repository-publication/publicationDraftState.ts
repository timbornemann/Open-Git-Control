import { create } from 'zustand';
import type { HostingConnection } from '@/types/hostingDtos';
import type { PublicationContext, PublicationSelection } from '@/types/repositoryPublication';

export const publicationDraftKey = (repoPath: string, connection?: HostingConnection) =>
  JSON.stringify([repoPath, connection?.id, connection?.provider, connection?.baseUrl, connection?.userId, connection?.username]);
export function newPublicationSelection(repoPath: string, connection?: HostingConnection, context?: PublicationContext): PublicationSelection {
  const names = new Set(context?.snapshot.remotes.map((remote) => remote.name) ?? []);
  const base = names.size ? connection?.provider || 'hosting' : 'origin';
  let remoteName = base,
    suffix = 2;
  while (names.has(remoteName)) remoteName = `${base}-${suffix++}`;
  const currentBranch = context?.branches.find((b) => b.name === context.snapshot.branch)?.name;
  return {
    repoPath,
    creation: {
      connectionId: connection?.id || '',
      name:
        repoPath
          .split(/[\\/]/)
          .filter(Boolean)
          .at(-1)
          ?.replace(/[^a-z\d._-]/gi, '-') || '',
      private: true,
    },
    remoteName,
    transport: 'https',
    credentialMode: 'connection',
    makePrimary: false,
    branches: currentBranch ? [{ sourceBranch: currentBranch, destinationBranch: currentBranch }] : [],
    tagNames: [],
  };
}
export const usePublicationDraftState = create<{
  drafts: Record<string, PublicationSelection>;
  put: (key: string, value: PublicationSelection) => void;
  remove: (key: string) => void;
}>((set) => ({
  drafts: {},
  put: (key, value) => set((state) => ({ drafts: { ...state.drafts, [key]: value } })),
  remove: (key) => set((state) => ({ drafts: Object.fromEntries(Object.entries(state.drafts).filter(([id]) => id !== key)) })),
}));
