import type { BranchChangeApi, BranchChangeInspection, ParkedBranchChange } from '@/shared/ipc/branchChange';
import { DEMO_TIME, ok, unavailable, type DemoRepository } from './demoRepository';

export function createDemoBranchApi(repo: DemoRepository): BranchChangeApi {
  let inspection: BranchChangeInspection | undefined;
  const parked: ParkedBranchChange[] = [];
  return {
    inspectBranchChange: async (request) => {
      inspection = {
        planId: `demo-plan-${repo.revision}`,
        repoPath: repo.activeRepo,
        sourceBranch: repo.branch,
        sourceHead: repo.commits[0].hash,
        target: request.target,
        targetSha: repo.commits[0].hash,
        files: [...new Set([...repo.staged, ...repo.modified])].map((path) => ({
          path,
          index: repo.staged.has(path) ? 'M' : ' ',
          worktree: repo.modified.has(path) ? 'M' : ' ',
          binary: false,
        })),
        blocks: [],
        conflicts: [],
        suggestedName: 'Übungsänderungen / Practice changes',
      };
      return ok(inspection);
    },
    executeBranchChange: async (request) => {
      if (!inspection || request.planId !== inspection.planId || !inspection.target) return unavailable();
      const target = inspection.target;
      if (request.mode === 'park' && (repo.modified.size || repo.staged.size)) {
        repo.command('stash', 'push', '-m', request.name);
        parked.push({
          id: inspection.planId,
          name: request.name,
          sourceBranch: inspection.sourceBranch,
          sourceHead: inspection.sourceHead,
          targetBranch: target.kind === 'detached' ? target.ref : target.branch,
          worktree: repo.activeRepo,
          createdAt: DEMO_TIME,
          phase: 'switched',
        });
      }
      repo.command(
        'checkout',
        ...(target.kind === 'create' ? ['-b', target.branch, target.startPoint] : [target.kind === 'detached' ? target.ref : target.branch]),
      );
      return ok({ switched: true, restored: request.mode === 'carry', conflicts: [] });
    },
    listParkedBranchChanges: async () => ok(parked),
    restoreBranchChange: async () => {
      repo.command('stash', 'pop');
      return ok({ switched: false, restored: true, conflicts: [] });
    },
    cancelBranchChange: async () => {
      inspection = undefined;
      return true;
    },
  };
}
