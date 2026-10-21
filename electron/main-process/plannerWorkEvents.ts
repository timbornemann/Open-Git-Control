let rename: ((repo: string, before: string, after: string) => Promise<void>) | undefined;
let detach: ((repo: string, itemIds: string[]) => Promise<void>) | undefined;
export function registerPlannerWorkDetach(handler: typeof detach) {
  detach = handler;
}
export function plannerWorkDetached(repo: string | null, itemIds: string[]) {
  if (repo) void detach?.(repo, itemIds).catch((error: unknown) => console.warn('[planner] Could not update branch protection:', error));
}
export function registerPlannerBranchRename(handler: typeof rename) {
  rename = handler;
}
export async function plannerBranchRename(repo: string, before: string, after: string) {
  await rename?.(repo, before, after);
}
export function observesPlannerBranchRename() {
  return Boolean(rename);
}
