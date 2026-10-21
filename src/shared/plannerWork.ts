import type { PlannerItem } from '../types/projectPlanner';

export function activePlannerBranch(item: Pick<PlannerItem, 'projectId' | 'references'>) {
  return item.references?.branches.find((branch) => branch.id === item.references?.activeWorkflowId && branch.projectId === item.projectId);
}
export function pausePlannerAutomation(item: PlannerItem) {
  return item.references
    ? {
        ...item.references,
        branches: item.references.branches.map((branch) => (branch.id === item.references!.activeWorkflowId ? { ...branch, automationPaused: true } : branch)),
      }
    : undefined;
}

/** Versioned references must never contain machine-local account IDs or paths. */
export const plannerWorkReferenceKey = (reference: { provider: string; server: string; repositoryId: string; id: string }) =>
  JSON.stringify([reference.provider, reference.server, reference.repositoryId, reference.id]);
