import type { CommitEditGit } from '../git/CommitEditGit';
import type { BranchChangeService, BranchChangeContext } from './BranchChangeService';
import type { PlannerStartWorkRequest, PlannerWorkInspection } from '../../src/types/plannerWork';
import type { BranchChangeResult, BranchChangeTarget } from '../../src/shared/ipc/branchChange';
import { safeBranchChangeGit } from './branchChangeGit';

export const branchChangeNeedsReview = (result: BranchChangeResult | undefined) => Boolean(result && (!result.switched || (result.error && !result.restored)));
export async function checkoutPlannerWork(
  service: BranchChangeService,
  request: PlannerStartWorkRequest,
  inspection: PlannerWorkInspection,
  branchSha: string,
  git: CommitEditGit,
  context: BranchChangeContext,
): Promise<BranchChangeResult | undefined> {
  const existing = inspection.existing;
  const sha = existing ? branchSha : inspection.bases.find((entry) => entry.ref === request.baseRef)!.sha;
  const target: BranchChangeTarget = existing
    ? { kind: 'existing', branch: request.branchName }
    : { kind: 'create', branch: request.branchName, startPoint: sha };
  if (!inspection.changes.length) {
    await git.run(
      request.repoPath,
      existing ? ['switch', '--no-overwrite-ignore', request.branchName] : ['switch', '--no-overwrite-ignore', '-c', request.branchName, sha],
      { ignoreAbort: true },
    );
    return;
  }
  const preview = request.branchChange ? undefined : await service.inspect({ repoPath: request.repoPath, target }, context, safeBranchChangeGit(git));
  return service.executeLocked(
    { repoPath: request.repoPath, ...(request.branchChange || { planId: preview!.planId, mode: 'carry' as const, name: preview!.suggestedName }) },
    context,
    git,
    { branch: request.branchName, sha, create: !existing },
  );
}
