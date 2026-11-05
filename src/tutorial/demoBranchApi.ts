import type { BranchChangeApi, BranchChangeInspection, BranchChangeTarget } from '@/shared/ipc/branchChange';
import { ok, unavailable, type DemoRepository } from './demoRepository';
import { inspectDemoCheckout, demoCheckout } from './demoBranchCommands';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { describeDemoChanges } from './demoStashState';
import { listDemoParkedChanges, inspectDemoParkedChanges, parkDemoBranchChanges, restoreDemoParkedChanges } from './demoParkedChanges';

const checkoutArgs = (target: BranchChangeTarget) =>
  target.kind === 'create'
    ? ['-b', target.branch, ...(target.tracking ? ['--track'] : []), target.startPoint]
    : target.kind === 'detached'
      ? ['--detach', target.ref]
      : [target.branch];
type Plan = { inspection: BranchChangeInspection; args?: string[]; fingerprint: string; expiresAt: number };
const failure = (cause: unknown) => ({ success: false as const, error: cause instanceof Error ? cause.message : String(cause) });

export function createDemoBranchApi(repo: DemoRepository): BranchChangeApi {
  let plan: Plan | undefined;
  let writing = false;
  const valid = (path: string, id: string, current = plan) =>
    current &&
    current === plan &&
    path === repo.activeRepo &&
    path === current.inspection.repoPath &&
    id === current.inspection.planId &&
    Date.now() < current.expiresAt &&
    demoRepositoryFingerprint(repo) === current.fingerprint &&
    !current.inspection.blocks.length;
  return {
    inspectBranchChange: async (request) => {
      if (request.repoPath !== repo.activeRepo || writing || (!request.target && !request.sessionId) || (request.target && request.sessionId))
        return unavailable();
      try {
        let inspection: BranchChangeInspection;
        let args: string[] | undefined;
        if (request.sessionId)
          inspection = { ...inspectDemoParkedChanges(repo, request.sessionId, request.reviewedRecovery === true), planId: crypto.randomUUID() };
        else {
          if (request.target?.kind === 'existing' && !repo.branches.includes(request.target.branch))
            throw new Error('The requested local practice branch does not exist.');
          args = checkoutArgs(request.target!);
          const target = inspectDemoCheckout(repo, args);
          inspection = {
            planId: crypto.randomUUID(),
            repoPath: repo.activeRepo,
            sourceBranch: repo.branch,
            sourceHead: repo.commits[0].hash,
            target: structuredClone(request.target),
            targetSha: target.commit.hash,
            files: describeDemoChanges(repo),
            blocks: repo.conflicted || repo.mergeState ? ['Finish or abort the pending practice merge first.'] : [],
            conflicts: [...(repo.mergeState?.conflicts.keys() || [])],
            suggestedName: 'Übungsänderungen / Practice changes',
          };
        }
        plan = { inspection, args, fingerprint: demoRepositoryFingerprint(repo), expiresAt: Date.now() + 15 * 60_000 };
        return ok(structuredClone(inspection));
      } catch (cause) {
        return failure(cause);
      }
    },
    executeBranchChange: async (request) => {
      const current = plan;
      if (writing || !current?.args || !valid(request.repoPath, request.planId) || !['carry', 'park'].includes(request.mode)) return unavailable();
      if (typeof request.name !== 'string' || !request.name.trim() || /[\0\r\n]/.test(request.name) || request.name.length > 500) return unavailable();
      writing = true;
      try {
        await Promise.resolve();
        if (!valid(request.repoPath, request.planId, current)) return unavailable();
        plan = undefined;
        if (request.mode === 'park' && current.inspection.files.length)
          return parkDemoBranchChanges(repo, current.args, current.inspection.target!, request.name);
        const result = demoCheckout(repo, current.args);
        return result.success ? ok({ switched: true, restored: true, conflicts: [] }) : result;
      } catch (cause) {
        return failure(cause);
      } finally {
        writing = false;
      }
    },
    listParkedBranchChanges: async (path) => (path === repo.activeRepo ? ok(listDemoParkedChanges(repo)) : unavailable()),
    restoreBranchChange: async (request) => {
      const current = plan;
      if (writing || !current?.inspection.session || !valid(request.repoPath, request.planId)) return unavailable();
      writing = true;
      try {
        await Promise.resolve();
        if (!valid(request.repoPath, request.planId, current)) return unavailable();
        plan = undefined;
        return ok(restoreDemoParkedChanges(repo, current.inspection));
      } catch (cause) {
        return failure(cause);
      } finally {
        writing = false;
      }
    },
    cancelBranchChange: async (path) => {
      if (path !== repo.activeRepo) return false;
      plan = undefined;
      return true;
    },
  };
}
