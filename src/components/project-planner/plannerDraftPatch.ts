import type { PlannerItem, PlannerItemInput } from '@/types/projectPlanner';

/** Rebase only fields edited in the form; background references/status stay intact. */
export function plannerDraftPatch(original: PlannerItem, live: PlannerItem, input: PlannerItemInput): Partial<PlannerItemInput> {
  const patch: Partial<PlannerItemInput> = { expectedUpdatedAt: live.updatedAt };
  for (const key of ['title', 'description', 'priority', 'status', 'tags'] as const) {
    if (JSON.stringify(input[key]) === JSON.stringify(original[key])) continue;
    if (JSON.stringify(live[key]) !== JSON.stringify(original[key]) && JSON.stringify(live[key]) !== JSON.stringify(input[key])) throw new Error('conflict');
    Object.assign(patch, { [key]: input[key] });
  }
  return patch;
}
