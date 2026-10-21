import { create } from 'zustand';
import type { PlannerItem } from '@/types/projectPlanner';

export type PlannerWorkDialogTarget = { repoPath: string; item: PlannerItem; onNavigate?: () => void; setup?: boolean };

export const usePlannerWorkDialogState = create<{
  target: PlannerWorkDialogTarget | null;
  open(repoPath: string, item: PlannerItem, onNavigate?: () => void, setup?: boolean): void;
  close(): void;
}>((set) => ({
  target: null,
  open: (repoPath, item, onNavigate, setup) => set({ target: { repoPath, item, onNavigate, setup } }),
  close: () => set({ target: null }),
}));

export const requestPlannerWork = (repoPath: string, item: PlannerItem, onNavigate?: () => void) =>
  usePlannerWorkDialogState.getState().open(repoPath, item, onNavigate);
