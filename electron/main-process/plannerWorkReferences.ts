import type { PlannerItemReferences } from '../../src/types/projectPlanner';
import { plannerWorkReferenceKey } from '../../src/shared/plannerWork';
import { workDigest } from './PlannerWorkStore';

/** Carry known workflow history, but never replace an unknown active assignment. */
export function mergeWorkReferences(source?: PlannerItemReferences, target?: PlannerItemReferences): PlannerItemReferences {
  const result = structuredClone(source || { branches: [], pullRequests: [] });
  const active = target?.branches.find((entry) => entry.id === target.activeWorkflowId && !entry.completedBy);
  if (active && !result.branches.some((entry) => entry.id === active.id))
    throw new Error('The base branch contains conflicting task references. Reconcile them before starting.');
  for (const branch of target?.branches || []) {
    const known = result.branches.find((entry) => entry.id === branch.id);
    if (!known) {
      result.branches.push(branch);
      continue;
    }
    if (
      known.projectId !== branch.projectId ||
      known.baseSha !== branch.baseSha ||
      known.baseRef !== branch.baseRef ||
      (known.repository && branch.repository && workDigest(known.repository) !== workDigest(branch.repository))
    )
      throw new Error('Conflicting workflow identity on the base branch. Reconcile it before starting.');
    if (!known.repository && branch.repository) known.repository = branch.repository;
  }
  for (const reference of target?.pullRequests || [])
    if (
      !result.pullRequests.some((entry) => entry.workflowId === reference.workflowId && plannerWorkReferenceKey(entry) === plannerWorkReferenceKey(reference))
    )
      result.pullRequests.push(reference);
  return result;
}
