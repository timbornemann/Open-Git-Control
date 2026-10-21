import { plannerWorkReferenceKey } from '../../src/shared/plannerWork';
import type { PlannerItemReferences } from '../../src/types/projectPlanner';
import type { PlannerWorkDetails } from '../../src/types/plannerWork';
import { WORK_OID, type WorkGit } from './plannerWorkInspection';

// Recording workflow links/status must not create more task work after a PR has merged.
// Check each first-parent change, not just the final tree: real work followed by a
// revert still needs review. Empty integration merges are harmless too.
async function onlyPlanningChanges(git: WorkGit, repo: string, mergedHead: string, head: string) {
  if (mergedHead === head) return true;
  // A non-ancestor is a normal result after rebasing. Use a successful query
  // instead of an exit-code probe that the Git runner would log as an error.
  if ((await git.run(repo, ['rev-list', '--max-count=1', mergedHead, '--not', head])).trim()) return false;
  const output = await git.run(repo, ['rev-list', '--first-parent', '--max-count=101', `${mergedHead}..${head}`]);
  const commits = output.trim().split('\n').filter(Boolean);
  if (!commits.length || commits.length > 100 || commits.some((sha) => !WORK_OID.test(sha))) return false;
  for (const sha of commits) {
    const paths = await git.run(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', `${sha}^1`, sha, '--']);
    if (paths.split('\0').some((file) => file && file !== '.Open-Git-Control/planning.json')) return false;
  }
  return true;
}

export async function checkWorkCompletion(git: WorkGit, repo: string, references: PlannerItemReferences, details: PlannerWorkDetails) {
  const merged = details.requests.filter(
    (entry) =>
      entry.state === 'merged' &&
      references.pullRequests.some(
        (reference) => reference.workflowId === details.workflowId && plannerWorkReferenceKey(reference) === plannerWorkReferenceKey(entry),
      ),
  );
  const result = (completion?: PlannerWorkDetails['completion']) => ({ completion, request: undefined as (typeof merged)[number] | undefined });
  if (!merged.length) return result();
  const unused = merged.filter((entry) => !references.branches.some((branch) => branch.completedBy === plannerWorkReferenceKey(entry)));
  if (!unused.length) return result('already-processed');
  if (details.branchMissing) return result('branch-missing');
  if (details.historyIncomplete || !details.headSha) return result('incomplete-history');
  const matching = [];
  for (const request of unused) {
    if (await onlyPlanningChanges(git, repo, request.headSha, details.headSha)) matching.push(request);
  }
  if (!matching.length) return result('new-work');
  if (matching.length !== 1) return result('ambiguous');
  return { completion: 'ready' as const, request: matching[0] };
}
