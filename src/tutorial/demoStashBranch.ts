import { ok, unavailable, type DemoRepository } from './demoRepository';
import { demoCheckout } from './demoBranchCommands';
import { applyDemoStash, dropDemoStash } from './demoStashState';

export function demoStashBranch(repo: DemoRepository, reference: string, branch: string) {
  const entry = repo.stashes.find((stash) => stash.name === reference);
  const snapshot = entry && repo.stashSnapshots.get(entry.hash);
  if (!snapshot || repo.changeCount() || repo.conflicted || repo.mergeState) return unavailable();
  const checkout = demoCheckout(repo, ['-b', branch, snapshot.baseHash]);
  if (!checkout.success) return checkout;
  try {
    applyDemoStash(repo, snapshot);
    dropDemoStash(repo, snapshot.hash);
    return ok('');
  } catch (cause) {
    // A refused restoration retains the saved objects and the new branch,
    // matching the two distinct phases of the normal stash-branch operation.
    return { success: false as const, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
