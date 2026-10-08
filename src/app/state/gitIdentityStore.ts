import { create } from 'zustand';
import type { GitIdentityStatus } from '@/shared/ipc/gitIdentity';
import { gitIdentityClient } from '@/services/gitIdentityClient';

type IdentityRequest = {
  id: number;
  repoPath: string;
  generation: number;
  status: GitIdentityStatus;
  resolve: (ready: boolean) => void;
};
export const useGitIdentityStore = create<{
  activeRepo: string | null | undefined;
  generation: number;
  request: IdentityRequest | null;
}>(() => ({ activeRepo: undefined, generation: 0, request: null }));
let nextRequest = 0;
const preparations = new Map<string, Promise<boolean>>();

export function finishGitIdentitySetup(id: number, ready: boolean) {
  const state = useGitIdentityStore.getState();
  const request = state.request;
  if (!request || request.id !== id) return;
  useGitIdentityStore.setState({ request: null });
  request.resolve(ready && state.generation === request.generation && (state.activeRepo === undefined || state.activeRepo === request.repoPath));
}

export function setGitIdentityRepository(activeRepo: string | null) {
  const state = useGitIdentityStore.getState();
  if (state.activeRepo === activeRepo) return;
  if (state.request) finishGitIdentitySetup(state.request.id, false);
  useGitIdentityStore.setState({ activeRepo, generation: state.generation + 1 });
}

/** Every commit checks fresh Git configuration; only concurrent requests are coalesced. */
export function ensureCommitIdentity(repoPath: string): Promise<boolean> {
  const state = useGitIdentityStore.getState();
  if (state.activeRepo !== undefined && state.activeRepo !== repoPath) return Promise.resolve(false);
  const generation = state.generation;
  const key = `${generation}:${repoPath}`;
  const pending = preparations.get(key);
  if (pending) return pending;
  const current = () => {
    const next = useGitIdentityStore.getState();
    return next.generation === generation && (next.activeRepo === undefined || next.activeRepo === repoPath);
  };
  const preparation = (async () => {
    const result = await gitIdentityClient.read({ repoPath, scope: 'repository' });
    if (!current()) return false;
    if (!result.success) throw new Error(result.error);
    if (result.data.ready) return true;
    return new Promise<boolean>((resolve) => {
      const previous = useGitIdentityStore.getState().request;
      if (previous) finishGitIdentitySetup(previous.id, false);
      useGitIdentityStore.setState({ request: { id: ++nextRequest, repoPath, generation, status: result.data, resolve } });
    });
  })().finally(() => preparations.delete(key));
  preparations.set(key, preparation);
  return preparation;
}
