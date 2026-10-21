import { randomUUID } from 'node:crypto';
import type {
  BranchCleanupCandidate,
  BranchCleanupInspection,
  BranchCleanupOutcome,
  BranchCleanupResult,
  ExecuteBranchCleanupRequest,
  InspectBranchCleanupRequest,
} from '../../src/shared/ipc/branchCleanup';
import type { GitRunner } from './GitRunner';
import type { BranchCleanupPreferencesStore } from './BranchCleanupPreferences';
import { cleanupPatternMatches } from './BranchCleanupPreferences';
import type { BranchCleanupRemotes } from './BranchCleanupRemotes';
import { analyzeBranchCleanup } from './branchCleanupAnalysis';
import { readCleanupLocal } from './branchCleanupLocal';
import { cleanupDeletedBranchConfiguration, deleteCleanupLocal, pruneCleanupTracking } from './branchCleanupDeletion';
import {
  CLEANUP_ID,
  cleanupDigest,
  cleanupError,
  cleanupLocalLinks,
  cleanupMetadataKnown,
  cleanupOpenRequests,
  type CleanupAnalysis,
  type CleanupContext,
  type CleanupLocalState,
  type CleanupRemoteState,
} from './branchCleanupModel';
import { physicalPathKey } from './RepositoryCommonDirectory';
import { redactGitSensitiveText } from './GitErrorFormatter';

type Plan = { inspection: BranchCleanupInspection; analysis: CleanupAnalysis; ownerId: number; generation: number; preferencesVersion: string; used: boolean };
type Dependencies = {
  git: GitRunner;
  remotes: BranchCleanupRemotes;
  preferences: BranchCleanupPreferencesStore;
  now?: () => number;
  taskBranches?: (repo: string) => Promise<Array<{ branch: string; title: string }>>;
};

export class BranchCleanupService {
  private readonly plans = new Map<string, Plan>();
  private readonly now: () => number;

  constructor(private readonly deps: Dependencies) {
    this.now = deps.now ?? Date.now;
  }

  private reader(context: CleanupContext) {
    return {
      run: (repo: string, args: string[]) => {
        context.ensureActive();
        return this.deps.git.run(repo, args, { signal: context.signal, envOverrides: { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } });
      },
    };
  }

  private prunePlans(ownerId: number) {
    for (const [id, plan] of this.plans) if (plan.inspection.expiresAt <= this.now() || plan.ownerId === ownerId) this.plans.delete(id);
    while (this.plans.size >= 32) this.plans.delete(this.plans.keys().next().value!);
  }

  async inspect(request: InspectBranchCleanupRequest, context: CleanupContext): Promise<BranchCleanupInspection> {
    const overrides = request.targetOverrides ?? {};
    if (
      !overrides ||
      typeof overrides !== 'object' ||
      Array.isArray(overrides) ||
      Object.keys(overrides).length > 65 ||
      Object.entries(overrides).some(([key, value]) => !CLEANUP_ID.test(key) || typeof value !== 'string' || !CLEANUP_ID.test(value))
    )
      throw new Error('Invalid comparison targets.');
    this.prunePlans(context.ownerId);
    context.progress('checking');
    const configuration = await this.deps.remotes.configuration(request.repoPath);
    const preferences = this.deps.preferences.read(request.repoPath);
    const remotes = await this.deps.remotes.readAll(request.repoPath, configuration.endpoints, context);
    const local = await readCleanupLocal(this.reader(context), request.repoPath);
    const analysis = await analyzeBranchCleanup(
      this.reader(context),
      request.repoPath,
      {
        local,
        remotes,
        preferences: configuration.preferences,
        patterns: preferences.protectedPatterns,
        overrides,
        fingerprint: configuration.fingerprint,
        now: this.now(),
      },
      context,
    );
    const checked = await this.deps.remotes.configuration(request.repoPath);
    const taskBranches = (await this.deps.taskBranches?.(request.repoPath)) || [];
    for (const candidate of analysis.candidates) {
      const assigned = taskBranches.find(
        (entry) =>
          entry.branch === candidate.name ||
          candidate.linkedLocalIds.some((id) => analysis.candidates.some((local) => local.id === id && local.name === entry.branch)),
      );
      if (assigned) {
        candidate.blocks.push({ code: 'planner-work', detail: assigned.title });
        candidate.selectedByDefault = false;
      }
    }
    const current = await readCleanupLocal(this.reader(context), request.repoPath);
    context.ensureActive();
    if (
      checked.fingerprint !== configuration.fingerprint ||
      cleanupDigest(this.deps.preferences.read(request.repoPath)) !== cleanupDigest(preferences) ||
      cleanupDigest(current.branches) !== cleanupDigest(local.branches) ||
      current.worktreeVersion !== local.worktreeVersion ||
      current.operation !== local.operation
    )
      throw new Error('Repository state changed during inspection. Inspect again.');
    const createdAt = this.now();
    const inspection: BranchCleanupInspection = {
      id: randomUUID(),
      repoPath: request.repoPath,
      createdAt,
      expiresAt: createdAt + 15 * 60_000,
      targets: analysis.targets.map(({ id, name, oid, comparisonId }) => ({ id, name, oid, comparisonId })),
      comparisons: analysis.comparisons,
      candidates: analysis.candidates,
      warnings: analysis.warnings.map(redactGitSensitiveText),
      protectedPatterns: preferences.protectedPatterns,
    };
    this.plans.set(inspection.id, {
      inspection,
      analysis,
      ownerId: context.ownerId,
      generation: context.generation,
      preferencesVersion: cleanupDigest(preferences),
      used: false,
    });
    return inspection;
  }

  private validatePlan(request: ExecuteBranchCleanupRequest, context: CleanupContext) {
    const plan = this.plans.get(request.planId);
    if (
      !plan ||
      plan.used ||
      plan.ownerId !== context.ownerId ||
      plan.generation !== context.generation ||
      plan.inspection.expiresAt <= this.now() ||
      physicalPathKey(plan.inspection.repoPath) !== physicalPathKey(request.repoPath)
    )
      throw new Error('expired');
    if (
      !Array.isArray(request.selectedIds) ||
      !request.selectedIds.length ||
      request.selectedIds.length > 10_000 ||
      new Set(request.selectedIds).size !== request.selectedIds.length ||
      !Array.isArray(request.confirmedUnmergedIds)
    )
      throw new Error('Invalid cleanup selection.');
    const selected = request.selectedIds.map((id) => {
      const candidate = plan.analysis.candidates.find((entry) => entry.id === id);
      if (!candidate || candidate.blocks.length || (candidate.kind === 'server' && candidate.classification === 'other'))
        throw new Error('The selection contains a protected or unknown branch.');
      if (candidate.requiresForce && !request.confirmedUnmergedIds.includes(id)) throw new Error('Unmerged branches require explicit additional confirmation.');
      return candidate;
    });
    if (request.confirmedUnmergedIds.some((id) => !selected.some((candidate) => candidate.id === id && candidate.requiresForce)))
      throw new Error('Invalid unmerged-branch confirmation.');
    return { plan, selected };
  }

  private validatePreferences(plan: Plan, repo: string) {
    if (cleanupDigest(this.deps.preferences.read(repo)) !== plan.preferencesVersion) throw new Error('changed');
  }
  private async validateTask(candidate: BranchCleanupCandidate, plan: Plan, repo: string) {
    const tasks = (await this.deps.taskBranches?.(repo)) || [];
    if (
      tasks.some(
        (entry) =>
          entry.branch === candidate.name ||
          candidate.linkedLocalIds.some((id) => plan.analysis.candidates.some((local) => local.id === id && local.name === entry.branch)),
      )
    )
      throw new Error('changed');
  }

  private async refreshForCandidate(plan: Plan, candidate: BranchCleanupCandidate, repo: string, context: CleanupContext) {
    this.validatePreferences(plan, repo);
    const configuration = await this.deps.remotes.configuration(repo);
    if (configuration.fingerprint !== plan.analysis.fingerprint) throw new Error('changed');
    const local = await readCleanupLocal(this.reader(context), repo);
    if (
      local.config !== plan.analysis.local.config ||
      physicalPathKey(local.commonDir) !== physicalPathKey(plan.analysis.local.commonDir) ||
      local.worktreeVersion !== plan.analysis.local.worktreeVersion ||
      local.operation ||
      local.incomplete
    )
      throw new Error('changed');
    const target = plan.analysis.targets.find((entry) => entry.id === candidate.targetId);
    if (!target) throw new Error('changed');
    if (target.localRef && local.branches.find((branch) => branch.ref === target.localRef)?.oid !== target.oid) throw new Error('changed');
    const remotes: CleanupRemoteState[] = [];
    const branch = local.branches.find((entry) => entry.name === candidate.name);
    for (const previous of plan.analysis.remotes) {
      const relevant =
        previous.endpoint.id === candidate.comparisonId ||
        previous.endpoint.id === target.endpointId ||
        (candidate.kind === 'local' &&
          (previous.heads.has(candidate.name) ||
            previous.endpoint.remoteName === branch?.remote ||
            Boolean(configuration.preferences.pushBranches?.[candidate.name]?.[previous.endpoint.remoteName])));
      if (relevant) remotes.push(await this.deps.remotes.read(repo, previous.endpoint, context, false));
    }
    if (target.endpointId) {
      const remote = remotes.find((entry) => entry.endpoint.id === target.endpointId);
      if (!remote?.complete || remote.heads.get(target.branch) !== target.oid) throw new Error('changed');
    }
    context.ensureActive();
    return { local, target, remotes, preferences: configuration.preferences };
  }

  private validateLocal(
    candidate: BranchCleanupCandidate,
    local: CleanupLocalState,
    remotes: CleanupRemoteState[],
    pushMappings: Record<string, Record<string, string>>,
  ) {
    const branch = local.branches.find((entry) => entry.name === candidate.name);
    if (branch?.oid !== candidate.oid || local.current === candidate.name || local.worktrees.some((worktree) => worktree.branch === candidate.name))
      throw new Error('changed');
    for (const remote of remotes) {
      const names = [
        candidate.name,
        ...(branch.remote === remote.endpoint.remoteName ? [branch.remoteRef.replace(/^refs\/heads\//, '')] : []),
        pushMappings[candidate.name]?.[remote.endpoint.remoteName] ?? '',
      ];
      if (
        names.some(
          (name) => cleanupOpenRequests(remote, name).length || remote.metadata?.branches.some((entry) => entry.name === name && entry.protected === true),
        )
      )
        throw new Error('changed');
    }
    if (candidate.reasons.some((entry) => entry.code === 'upstream-gone')) {
      const upstreams = remotes.filter((remote) => remote.endpoint.remoteName === branch.remote && remote.endpoint.fetchUrl);
      if (!upstreams.length || upstreams.some((remote) => !remote.complete || remote.heads.has(branch.remoteRef.slice(11)))) throw new Error('changed');
    }
  }

  private validateServer(
    candidate: BranchCleanupCandidate,
    local: CleanupLocalState,
    remote: CleanupRemoteState | undefined,
    pushMappings: Record<string, Record<string, string>>,
  ) {
    if (
      !remote ||
      !cleanupMetadataKnown(remote, candidate.name) ||
      remote.heads.get(candidate.name) !== candidate.oid ||
      remote.metadata?.branches.some((entry) => entry.name === candidate.name && entry.protected === true) ||
      cleanupOpenRequests(remote, candidate.name).length
    )
      throw new Error('changed');
    const locals = local.branches.filter((branch) => cleanupLocalLinks(branch, remote, candidate.name, pushMappings));
    if (
      (candidate.classification === 'orphaned' && locals.length) ||
      locals.some((branch) => branch.name === local.current || local.worktrees.some((worktree) => worktree.branch === branch.name))
    )
      throw new Error('changed');
  }

  async execute(request: ExecuteBranchCleanupRequest, context: CleanupContext): Promise<BranchCleanupResult> {
    const { plan, selected } = this.validatePlan(request, context);
    plan.used = true;
    const outcomes: BranchCleanupOutcome[] = [];
    const ordered = [...selected.filter((candidate) => candidate.kind === 'server'), ...selected.filter((candidate) => candidate.kind === 'local')];
    for (const candidate of ordered) {
      const outcome: BranchCleanupOutcome = {
        id: candidate.id,
        name: candidate.name,
        kind: candidate.kind,
        endpoint: candidate.endpoint,
        status: 'skipped',
        message: 'cancelled',
      };
      if (context.signal.aborted) {
        outcomes.push(outcome);
        continue;
      }
      try {
        context.ensureActive();
        context.progress(`checking: ${candidate.name}`);
        if (
          candidate.kind === 'local' &&
          selected.some(
            (server) =>
              server.kind === 'server' &&
              server.linkedLocalIds.includes(candidate.id) &&
              outcomes.find((entry) => entry.id === server.id)?.status !== 'deleted',
          )
        )
          throw new Error('server-not-deleted');
        const fresh = await this.refreshForCandidate(plan, candidate, request.repoPath, context);
        await this.validateTask(candidate, plan, request.repoPath);
        const names = this.deps.preferences.read(request.repoPath).protectedPatterns;
        if (
          names.some((pattern) => cleanupPatternMatches(candidate.name, pattern)) ||
          fresh.target.branch === candidate.name ||
          fresh.remotes.some((remote) => remote.defaultBranch === candidate.name || remote.metadata?.defaultBranch === candidate.name)
        )
          throw new Error('changed');
        if (candidate.kind === 'server') {
          const remote = fresh.remotes.find((entry) => entry.endpoint.id === candidate.comparisonId);
          this.validateServer(candidate, fresh.local, remote, fresh.preferences.pushBranches ?? {});
          context.progress(`deleting: ${candidate.name}`);
          Object.assign(outcome, await this.deps.remotes.delete(request.repoPath, remote!.endpoint, candidate.name, candidate.oid, context));
          if (outcome.status === 'deleted')
            await pruneCleanupTracking(this.deps.git, request.repoPath, remote!.endpoint, candidate.name, candidate.oid, plan.analysis.local.config);
        } else {
          this.validateLocal(candidate, fresh.local, fresh.remotes, fresh.preferences.pushBranches ?? {});
          context.progress(`deleting: ${candidate.name}`);
          await deleteCleanupLocal(this.deps.git, request.repoPath, plan.analysis.local, candidate, fresh.target, context, async () => {
            this.validatePreferences(plan, request.repoPath);
            await this.validateTask(candidate, plan, request.repoPath);
          });
          outcome.status = 'deleted';
          outcome.message = 'deleted';
        }
      } catch (error) {
        const message = cleanupError(error);
        outcome.status = ['changed', 'server-not-deleted'].includes(message) || context.signal.aborted ? 'skipped' : 'failed';
        outcome.message = redactGitSensitiveText(context.signal.aborted ? 'cancelled' : message);
      }
      outcomes.push(outcome);
    }
    try {
      await cleanupDeletedBranchConfiguration(
        this.deps.git,
        request.repoPath,
        outcomes.filter((entry) => entry.kind === 'local' && entry.status === 'deleted').map((entry) => entry.name),
      );
    } catch {
      /* Preserve confirmed ref results even if optional configuration cleanup fails. */
    }
    return { outcomes, cancelled: context.signal.aborted };
  }
}
