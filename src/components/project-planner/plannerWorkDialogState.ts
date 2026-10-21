import { create } from 'zustand';
import type { PlannerItem } from '@/types/projectPlanner';

export const usePlannerWorkDialogState = create<{
  target: { repoPath: string; item: PlannerItem } | null;
  open(repoPath: string, item: PlannerItem): void;
  close(): void;
}>((set) => ({ target: null, open: (repoPath, item) => set({ target: { repoPath, item } }), close: () => set({ target: null }) }));

export const requestPlannerWork = (repoPath: string, item: PlannerItem) => usePlannerWorkDialogState.getState().open(repoPath, item);
