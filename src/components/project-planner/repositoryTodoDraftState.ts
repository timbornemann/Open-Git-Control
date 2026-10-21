import { create } from 'zustand';
import type { PlannerItemInput } from '@/types/projectPlanner';

export type RepositoryTodoDraftRequest = { repoPath: string; input: PlannerItemInput };

export const useRepositoryTodoDraftState = create<{
  request: RepositoryTodoDraftRequest | null;
  open: (request: RepositoryTodoDraftRequest) => void;
  consume: (request: RepositoryTodoDraftRequest) => void;
}>((set) => ({
  request: null,
  open: (request) => set({ request }),
  consume: (request) => set((state) => (state.request === request ? { request: null } : state)),
}));

export const requestRepositoryTodoDraft = (request: RepositoryTodoDraftRequest) => useRepositoryTodoDraftState.getState().open(request);
