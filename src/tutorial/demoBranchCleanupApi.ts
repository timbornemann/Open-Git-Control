import type { BranchCleanupApi, BranchCleanupInspection, BranchCleanupOutcome } from '@/shared/ipc/branchCleanup';
import { normalizeCleanupPreferences } from '@/shared/git/branchCleanupProtection';
import { ok, unavailable, type DemoRepository } from './demoRepository';
import { inspectDemoCleanup } from './demoBranchCleanupModel';
import { demoRepositoryFingerprint as cleanupFingerprint } from './demoRepositoryFingerprint';

type Plan = { inspection: BranchCleanupInspection; fingerprint: string };
const fail = (error: string) => ({ success: false as const, error });
const unique = (ids: string[]) => Array.isArray(ids) && ids.every((id) => typeof id === 'string') && new Set(ids).size === ids.length;

export function createDemoBranchCleanupApi(repo: DemoRepository): BranchCleanupApi {
  const plans = new Map<string, Plan>();
  const operations = new Map<string, { cancelled: boolean }>();
  let writing = false;
  return {
    inspectBranchCleanup: async (request) => {
      if (request.repoPath !== repo.activeRepo || !request.operationId || operations.has(request.operationId) || writing) return unavailable();
      const operation = { cancelled: false };
      operations.set(request.operationId, operation);
      const fingerprint = cleanupFingerprint(repo);
      try {
        await Promise.resolve();
        if (operation.cancelled) return fail('cancelled');
        if (fingerprint !== cleanupFingerprint(repo)) return fail('changed');
        const overrides = request.targetOverrides ?? {};
        if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || Object.values(overrides).some((value) => typeof value !== 'string'))
          return unavailable();
        const inspection = inspectDemoCleanup(repo, crypto.randomUUID(), overrides, Date.now());
        for (const [id, plan] of plans) if (plan.inspection.expiresAt <= Date.now()) plans.delete(id);
        while (plans.size >= 16) plans.delete(plans.keys().next().value!);
        plans.set(inspection.id, { inspection, fingerprint });
        return ok(structuredClone(inspection));
      } finally {
        operations.delete(request.operationId);
      }
    },
    executeBranchCleanup: async (request) => {
      const plan = plans.get(request.planId);
      if (!plan || plan.inspection.expiresAt <= Date.now()) return fail('expired');
      if (request.repoPath !== repo.activeRepo || request.repoPath !== plan.inspection.repoPath || plan.fingerprint !== cleanupFingerprint(repo))
        return fail('changed');
      if (
        writing ||
        !request.operationId ||
        operations.has(request.operationId) ||
        !unique(request.selectedIds) ||
        !request.selectedIds.length ||
        !unique(request.confirmedUnmergedIds)
      )
        return unavailable();
      const chosen = request.selectedIds.map((id) => plan.inspection.candidates.find((candidate) => candidate.id === id));
      if (
        chosen.some(
          (candidate) => !candidate || candidate.blocks.length || (candidate.requiresForce && !request.confirmedUnmergedIds.includes(candidate.id)),
        ) ||
        request.confirmedUnmergedIds.some((id) => !request.selectedIds.includes(id))
      )
        return unavailable();
      const operation = { cancelled: false };
      const outcomes: BranchCleanupOutcome[] = [];
      writing = true;
      operations.set(request.operationId, operation);
      plans.delete(request.planId);
      let fingerprint = plan.fingerprint;
      try {
        for (const candidate of chosen) {
          await Promise.resolve();
          const changed = fingerprint !== cleanupFingerprint(repo);
          if (operation.cancelled || changed) {
            outcomes.push({
              id: candidate!.id,
              name: candidate!.name,
              kind: 'local',
              status: 'skipped',
              message: operation.cancelled ? 'cancelled' : 'changed',
            });
            continue;
          }
          const result = repo.command('branch', '-D', candidate!.name);
          outcomes.push({
            id: candidate!.id,
            name: candidate!.name,
            kind: 'local',
            status: result.success ? 'deleted' : 'failed',
            message: result.success ? 'deleted' : result.error,
          });
          fingerprint = cleanupFingerprint(repo);
        }
        return ok({ outcomes, cancelled: operation.cancelled });
      } finally {
        writing = false;
        operations.delete(request.operationId);
      }
    },
    cancelBranchCleanup: async (id) => {
      const operation = operations.get(id);
      if (!operation) return false;
      operation.cancelled = true;
      return true;
    },
    getBranchCleanupPreferences: async (path) => (path === repo.activeRepo ? ok({ protectedPatterns: [...repo.branchProtectionPatterns] }) : unavailable()),
    saveBranchCleanupPreferences: async (path, preferences) => {
      if (path !== repo.activeRepo || writing) return unavailable();
      try {
        const normalized = normalizeCleanupPreferences(preferences);
        repo.branchProtectionPatterns = normalized.protectedPatterns;
        repo.mark('setting-changed');
        return ok(structuredClone(normalized));
      } catch {
        return unavailable();
      }
    },
  };
}
