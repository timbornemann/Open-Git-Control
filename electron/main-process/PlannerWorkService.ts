import { randomUUID } from 'node:crypto';
import type { GitRunner } from '../git/GitRunner';
import { physicalPathKey } from '../git/RepositoryCommonDirectory';
import { activePlannerBranch, plannerWorkReferenceKey } from '../../src/shared/plannerWork';
import type { PlannerBranchReference, PlannerChangeRequestReference, PlannerItem, PlannerProject } from '../../src/types/projectPlanner';
import type {
  PlannerStartWorkRequest,
  PlannerStartWorkResult,
  PlannerUpdateWorkRequest,
  PlannerWorkDetails,
  PlannerWorkInspection,
  PlannerWorkRequest,
  PlannerWorkChangeRequest,
  PlannerWorkGetRequest,
} from '../../src/types/plannerWork';
import { normalizePlannerReferences } from './plannerReferences';
import type { PlannerWorkCache } from './PlannerWorkCache';
import type { PlannerHostingReader } from './PlannerWorkHosting';
import { loadWorkItem, carryWorkItem, saveWorkItem, workContent, workDigest } from './PlannerWorkStore';
import { assertWorkIdle, suggestWorkBranch, workBases, workSha, workState, type WorkGit } from './plannerWorkInspection';
import { readWorkHistory } from './plannerWorkHistory';
import type { PlannerWorkRegistry } from './PlannerWorkRegistry';
import { PlannerWorkAssignments } from './PlannerWorkAssignments';
import type { PlannerWorkRecovery, WorkRecovery } from './PlannerWorkRecovery';
import { mergeWorkReferences } from './plannerWorkReferences';
import { notifyProjectPlannerDataChanged } from './projectPlannerStore';

export type PlannerWorkContext = { ownerId: number; signal: AbortSignal; ensureActive(): void; progress?(message: string): void };
type Plan = {
  inspection: PlannerWorkInspection;
  source: ReturnType<typeof loadWorkItem>;
  snapshot: string;
  branchSha: string;
  owner: number;
  repo: string;
  account: string;
  expires: number;
};
const emptyDetails = (itemId: string, workflowId?: string): PlannerWorkDetails => ({ itemId, workflowId, commits: [], requests: [] });

export class PlannerWorkService {
  private readonly plans = new Map<string, Plan>();
  private readonly refreshes = new Map<string, Promise<PlannerWorkDetails>>();
  private readonly assignments: PlannerWorkAssignments;
  private readonly registry: PlannerWorkRegistry;
  private readonly recovery: PlannerWorkRecovery;
  constructor(
    private readonly git: GitRunner,
    private readonly cache: PlannerWorkCache,
    private readonly hosting: PlannerHostingReader,
  ) {
    this.assignments = new PlannerWorkAssignments(git, cache);
    this.registry = this.assignments.registry;
    this.recovery = this.assignments.recovery;
  }
  async protectedBranches(repo: string) {
    return this.assignments.protectedBranches(repo);
  }
  async detached(repo: string, itemIds: string[]) {
    await this.registry.forget(repo, itemIds);
  }
  async renamed(repo: string, before: string, after: string) {
    await this.assignments.renamed(repo, before, after);
  }
  private reader(context: PlannerWorkContext): WorkGit {
    return {
      run: (repo, args) => {
        context.ensureActive();
        return this.git.run(repo, args, { signal: context.signal, envOverrides: { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } });
      },
    };
  }
  async inspect(request: PlannerWorkRequest, context: PlannerWorkContext): Promise<PlannerWorkInspection> {
    context.ensureActive();
    const pending = await this.recovery.read(request.repoPath, request.itemId);
    if (pending) {
      const recovery = pending.value;
      if ((await this.reader(context).run(request.repoPath, ['symbolic-ref', '--short', 'HEAD'])).trim() !== recovery.branch)
        throw new Error(`Recover the unfinished task checkout on branch ${recovery.branch} before starting again.`);
      return {
        planId: '',
        item: recovery.item,
        suggestedName: recovery.branch,
        bases: [],
        defaultBase: '',
        changes: [],
        worktrees: [],
        existing: activePlannerBranch(recovery.item),
        recoveryId: pending.id,
      };
    }
    const source = await this.assignments.load(request.repoPath, request.itemId, () => context.ensureActive(), context.signal);
    await this.registry.record(request.repoPath, source.data.items);
    const git = this.reader(context);
    await assertWorkIdle(git, request.repoPath);
    const [state, bases] = await Promise.all([workState(git, request.repoPath), workBases(git, request.repoPath)]);
    if (!state.head) throw new Error('Create an initial commit before starting task work.');
    const current = activePlannerBranch(source.item);
    const existing = current?.completedBy ? undefined : current;
    const branchSha = existing ? await workSha(git, request.repoPath, `refs/heads/${existing.name}`) : '';
    const inspection: PlannerWorkInspection = {
      planId: randomUUID(),
      item: source.item,
      suggestedName:
        existing?.name ||
        this.availableName(
          source.item,
          bases.bases.map((entry) => entry.ref),
        ),
      ...bases,
      changes: state.changes,
      worktrees: state.worktrees,
      existing,
    };
    this.plans.set(inspection.planId, {
      inspection,
      source,
      snapshot: state.digest,
      branchSha,
      owner: context.ownerId,
      repo: physicalPathKey(request.repoPath),
      account: this.hosting.version(),
      expires: Date.now() + 15 * 60_000,
    });
    for (const [id, plan] of this.plans) if (plan.expires < Date.now() || this.plans.size > 128) this.plans.delete(id);
    return inspection;
  }
  private availableName(item: PlannerItem, refs: string[]) {
    const suggestion = suggestWorkBranch(item);
    let name = suggestion;
    for (let suffix = 2; refs.includes(`refs/heads/${name}`); suffix++) name = `${suggestion.slice(0, 79 - String(suffix).length)}-${suffix}`;
    return name;
  }
  async start(request: PlannerStartWorkRequest, context: PlannerWorkContext): Promise<PlannerStartWorkResult> {
    const plan = this.plans.get(request.planId);
    if (
      !plan ||
      plan.owner !== context.ownerId ||
      plan.repo !== physicalPathKey(request.repoPath) ||
      plan.source.item.id !== request.itemId ||
      plan.expires < Date.now()
    )
      throw new Error('The work preview expired. Review it again.');
    this.plans.delete(request.planId);
    return this.git.withExclusiveWrite(
      request.repoPath,
      'planner:startWork',
      async (exclusive) => {
        const git: WorkGit = {
          run: (repo, args) => {
            context.ensureActive();
            return exclusive.run(repo, args, { envOverrides: { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } });
          },
        };
        context.ensureActive();
        if (this.hosting.version() !== plan.account || loadWorkItem(request.repoPath, request.itemId).revision !== plan.source.revision)
          throw new Error('The task or hosting session changed. Review the work preview again.');
        await assertWorkIdle(git, request.repoPath);
        const state = await workState(git, request.repoPath);
        if (state.digest !== plan.snapshot) throw new Error('HEAD, worktrees or local changes changed after review. Review them again.');
        if (state.changes.length && !request.acceptChanges) throw new Error('Confirm carrying the working-tree changes before continuing.');
        if (typeof request.acceptChanges !== 'boolean') throw new Error('Invalid working-tree confirmation.');
        const name = String(request.branchName || '').trim();
        if (!name || name.length > 1024 || name.startsWith('-')) throw new Error('Invalid work branch name.');
        await git.run(request.repoPath, ['check-ref-format', '--branch', name]);
        const duplicate = plan.source.data.items.find((item) => item.id !== request.itemId && activePlannerBranch(item)?.name === name);
        if (duplicate) throw new Error(`Branch is already assigned to task: ${duplicate.title}`);
        await this.registry.assertAvailable(request.repoPath, request.itemId, name);
        const occupied = state.worktrees.find((entry) => entry.branch === name && physicalPathKey(entry.path) !== physicalPathKey(request.repoPath));
        if (occupied) throw new Error(`Branch is assigned to another worktree: ${occupied.path}`);
        const existing = plan.inspection.existing;
        const base = plan.inspection.bases.find((entry) => entry.ref === request.baseRef);
        const branchSha = await workSha(git, request.repoPath, `refs/heads/${name}`);
        if (existing) {
          if (name !== existing.name || !branchSha || branchSha !== plan.branchSha)
            throw new Error('The assigned branch changed or is missing. Restore it or archive the assignment before starting again.');
        } else if (!base || (await workSha(git, request.repoPath, base.ref)) !== base.sha || branchSha)
          throw new Error('The base changed or the branch name is already in use. Review the preview again.');
        const baseItem = existing ? undefined : await this.targetTask(git, request.repoPath, base!.sha, plan.source.item, plan.source.project);
        const references = mergeWorkReferences(plan.source.item.references, baseItem?.references);
        const branch: PlannerBranchReference = existing
          ? { ...existing, automationPaused: false }
          : {
              id: randomUUID(),
              projectId: plan.source.project.id,
              name,
              baseRef: base!.ref,
              baseSha: base!.sha,
              startedAt: Date.now(),
              automationPaused: false,
            };
        references.branches = [...references.branches.filter((entry) => entry.id !== branch.id), branch];
        references.activeWorkflowId = branch.id;
        const item = { ...plan.source.item, status: 'in-progress' as const, references: normalizePlannerReferences(references) };
        const recoveryId = await this.recovery.prepare(request.repoPath, { item, project: plan.source.project, branch: name }, () => !context.signal.aborted);
        let changedBranch = false;
        try {
          context.progress?.('Creating and checking out the task branch');
          context.ensureActive();
          await this.revalidateStart(request, plan, git);
          await exclusive.run(request.repoPath, existing ? ['switch', name] : ['switch', '-c', name, base!.sha], { ignoreAbort: true });
          changedBranch = true;
          context.ensureActive();
          if ((await git.run(request.repoPath, ['symbolic-ref', '--short', 'HEAD'])).trim() !== name)
            throw new Error('The active branch changed during checkout.');
          const saved = carryWorkItem(request.repoPath, item, plan.source.project, [plan.source.revision, ...(baseItem ? [workDigest(baseItem)] : [])]);
          await this.registry.record(request.repoPath, [saved]);
          await this.recovery.complete(request.repoPath, request.itemId, recoveryId);
          return { branch: name, item: saved };
        } catch (error) {
          if (!changedBranch) {
            const head = await exclusive.run(request.repoPath, ['symbolic-ref', '--short', 'HEAD'], { ignoreAbort: true }).catch(() => '');
            changedBranch = head.trim() === name;
          }
          if (!changedBranch) {
            await this.recovery.complete(request.repoPath, request.itemId, recoveryId);
          }
          if (!changedBranch) throw error;
          return {
            branch: name,
            recoveryId,
            error: `Branch checkout finished, but task assignment could not be completed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
      context.signal,
    );
  }
  private async revalidateStart(request: PlannerStartWorkRequest, plan: Plan, git: WorkGit) {
    if (
      (await workState(git, request.repoPath)).digest !== plan.snapshot ||
      loadWorkItem(request.repoPath, request.itemId).revision !== plan.source.revision ||
      this.hosting.version() !== plan.account ||
      (!plan.inspection.existing &&
        (await workSha(git, request.repoPath, request.baseRef)) !== plan.inspection.bases.find((entry) => entry.ref === request.baseRef)?.sha)
    )
      throw new Error('The reviewed working state changed before checkout. Review it again.');
  }
  private async targetTask(git: WorkGit, repo: string, sha: string, item: PlannerItem, project: PlannerProject): Promise<PlannerItem | undefined> {
    const text = await git.run(repo, ['show', `${sha}:.Open-Git-Control/planning.json`]).catch(() => '');
    if (!text) return;
    if (Buffer.byteLength(text) > 8 * 1024 ** 2) throw new Error('Target planning file is too large.');
    const document = JSON.parse(text) as { projects?: PlannerProject[]; items?: PlannerItem[] };
    if (!Array.isArray(document.projects) || !Array.isArray(document.items) || document.projects.length !== 1 || document.projects[0].id !== project.id)
      throw new Error('The base branch contains a different planning project. Reconcile planning data first.');
    const target = document.items.find((entry) => entry.id === item.id);
    if (target && workDigest(workContent(target)) !== workDigest(workContent(item)))
      throw new Error('The base branch contains conflicting task content. Reconcile it before starting.');
    mergeWorkReferences(item.references, target?.references);
    return target;
  }
  async get(request: PlannerWorkGetRequest): Promise<PlannerWorkDetails> {
    if (request.listRecoveries) return { ...emptyDetails(request.itemId), recoveries: await this.recoveries(request.repoPath) };
    const { item } = loadWorkItem(request.repoPath, request.itemId);
    const branch = request.workflowId ? item.references?.branches.find((entry) => entry.id === request.workflowId) : activePlannerBranch(item);
    if (!branch) return { ...emptyDetails(item.id), revision: workDigest(item) };
    const result = await this.cache.read<PlannerWorkDetails & { hostingVersion?: string }>(request.repoPath, `${item.id}:${branch.id}`);
    if (result && (result.itemId !== item.id || result.workflowId !== branch.id || !Array.isArray(result.commits) || !Array.isArray(result.requests)))
      throw new Error('Invalid planner work cache.');
    const { hostingVersion, ...details } = result || { ...emptyDetails(item.id, branch.id), hostingVersion: undefined };
    if (hostingVersion !== this.hosting.version()) delete details.hostingRepository;
    return { ...details, revision: workDigest(item) };
  }
  private async recoveries(repo: string) {
    const found: Array<{ recoveryId: string; item: PlannerItem }> = [];
    for (const recovery of await this.recovery.list(repo)) found.push({ recoveryId: recovery.id, item: recovery.value.item });
    if (!found.length) return found;
    const head = (
      await this.git.run(repo, ['symbolic-ref', '--short', 'HEAD'], { envOverrides: { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } })
    ).trim();
    return found.filter((entry) => activePlannerBranch(entry.item)?.name === head);
  }
  async refresh(request: PlannerWorkRequest, context: PlannerWorkContext) {
    const key = workDigest([physicalPathKey(request.repoPath), request.itemId]);
    // Each owner retains its own cancellation/authorization scope.
    const scopedKey = `${context.ownerId}:${key}`;
    const pending = this.refreshes.get(scopedKey);
    if (pending) return pending;
    const work = this.refreshWork(request, context).finally(() => this.refreshes.delete(scopedKey));
    this.refreshes.set(scopedKey, work);
    return work;
  }
  private async refreshWork(request: PlannerWorkRequest, context: PlannerWorkContext) {
    const source = await this.assignments.load(request.repoPath, request.itemId, () => context.ensureActive(), context.signal);
    const branch = activePlannerBranch(source.item);
    if (!branch) return emptyDetails(source.item.id);
    const previous = await this.get({ repoPath: request.repoPath, itemId: request.itemId });
    let details = await readWorkHistory(this.reader(context), request.repoPath, branch, previous);
    const version = this.hosting.version();
    try {
      const remote = await this.hosting.read(request.repoPath, branch, context.signal);
      context.ensureActive();
      if (version !== this.hosting.version()) throw new Error('The hosting session changed during refresh.');
      details = {
        ...details,
        requests: remote.requests,
        hostingRepository: remote.repository,
        remoteCheckedAt: remote.checkedAt,
        error: details.historyIncomplete ? 'The local history is incomplete.' : undefined,
      };
      const references = structuredClone(source.item.references!);
      const currentBranch = references.branches.find((entry) => entry.id === branch.id)!;
      if (!currentBranch.repository && remote.source) currentBranch.repository = remote.source;
      const target = branch.baseRef.replace(/^refs\/(?:heads\/|remotes\/[^/]+\/)/, '');
      const candidates = remote.requests.filter(
        (entry) =>
          !references.pullRequests.some(
            (reference) => reference.workflowId !== branch.id && plannerWorkReferenceKey(reference) === plannerWorkReferenceKey(entry),
          ) &&
          entry.headSha !== branch.baseSha &&
          entry.targetBranch === target &&
          (entry.createdAt || 0) >= branch.startedAt - 60_000 &&
          (entry.headSha === details.headSha || details.commits.some((commit) => commit.state === 'current' && commit.sha === entry.headSha)),
      );
      if (!references.pullRequests.some((entry) => entry.workflowId === branch.id) && candidates.length === 1)
        references.pullRequests.push(this.reference(candidates[0]));
      const linked = remote.requests.filter((entry) =>
        references.pullRequests.some(
          (reference) => reference.workflowId === branch.id && plannerWorkReferenceKey(reference) === plannerWorkReferenceKey(entry),
        ),
      );
      const merged = linked.filter(
        (entry) =>
          entry.state === 'merged' &&
          entry.headSha === details.headSha &&
          !details.branchMissing &&
          !references.branches.some((other) => other.completedBy === plannerWorkReferenceKey(entry)),
      );
      const complete = !branch.automationPaused && !branch.completedBy && !details.historyIncomplete && merged.length === 1;
      if (complete) currentBranch.completedBy = plannerWorkReferenceKey(merged[0]);
      if (workDigest(references) !== workDigest(source.item.references) || complete) {
        context.ensureActive();
        await this.git.withExclusiveWrite(
          request.repoPath,
          'planner:recordWork',
          async (git) => {
            context.ensureActive();
            const reader: WorkGit = { run: (repo, args) => git.run(repo, args, { envOverrides: { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } }) };
            if (complete && (await workSha(reader, request.repoPath, `refs/heads/${branch.name}`)) !== (details.branchMissing ? '' : details.headSha))
              throw new Error('The work branch changed during refresh. Refresh it again before completion.');
            saveWorkItem(request.repoPath, { ...source.item, references, ...(complete ? { status: 'done' as const } : {}) }, source.revision);
          },
          context.signal,
        );
      }
    } catch (error) {
      context.ensureActive();
      details = { ...details, hostingRepository: undefined, error: error instanceof Error ? error.message : String(error) };
    }
    context.ensureActive();
    await this.cache.write(request.repoPath, `${source.item.id}:${branch.id}`, { ...details, hostingVersion: version }, () => !context.signal.aborted);
    await this.registry.record(request.repoPath, [loadWorkItem(request.repoPath, request.itemId).item]);
    const visible = (entry: PlannerWorkDetails) => [entry.headSha, entry.commits, entry.requests, entry.error, entry.branchMissing, entry.historyIncomplete];
    if (workDigest(visible(previous)) !== workDigest(visible(details))) notifyProjectPlannerDataChanged();
    return { ...details, revision: loadWorkItem(request.repoPath, request.itemId).revision };
  }
  private reference(entry: PlannerChangeRequestReference): PlannerChangeRequestReference {
    return {
      workflowId: entry.workflowId,
      provider: entry.provider,
      server: entry.server,
      repositoryId: entry.repositoryId,
      fullPath: entry.fullPath,
      id: entry.id,
      number: entry.number,
      url: entry.url,
    };
  }
  async update(request: PlannerUpdateWorkRequest, context: PlannerWorkContext) {
    if (!['automation', 'attach-pr', 'detach-pr', 'archive', 'recover', 'assign-branch'].includes(request.action))
      throw new Error('Invalid work update action.');
    let chosen: PlannerWorkChangeRequest | undefined;
    const version = this.hosting.version();
    if (request.action === 'attach-pr') {
      const branch = activePlannerBranch(loadWorkItem(request.repoPath, request.itemId).item);
      if (!branch) throw new Error('No active work branch.');
      const remote = await this.hosting.read(request.repoPath, branch, context.signal);
      chosen = remote.requests.find((entry) => plannerWorkReferenceKey(entry) === plannerWorkReferenceKey(request.reference));
      if (!chosen || chosen.workflowId !== branch.id) throw new Error('Refresh change requests and choose a verified matching source.');
    }
    return this.git.withExclusiveWrite(
      request.repoPath,
      'planner:updateWork',
      async (exclusive) => {
        context.ensureActive();
        const git: WorkGit = {
          run: (repo, args) => {
            context.ensureActive();
            return exclusive.run(repo, args, { envOverrides: { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } });
          },
        };
        if (request.action === 'recover') {
          await assertWorkIdle(git, request.repoPath);
          const recovery = await this.cache.read<WorkRecovery>(request.repoPath, request.recoveryId, true);
          if (
            !recovery ||
            recovery.item.id !== request.itemId ||
            (await exclusive.run(request.repoPath, ['symbolic-ref', '--short', 'HEAD'])).trim() !== recovery.branch
          )
            throw new Error('The recovery no longer matches this task and branch.');
          const saved = carryWorkItem(request.repoPath, recovery.item, recovery.project, [request.expectedRevision]);
          await this.registry.record(request.repoPath, [saved]);
          await this.recovery.complete(request.repoPath, request.itemId, request.recoveryId);
          return saved;
        }
        const source = loadWorkItem(request.repoPath, request.itemId);
        if (source.revision !== request.expectedRevision || version !== this.hosting.version())
          throw new Error('The task or account changed. Review it before updating references.');
        const branch = activePlannerBranch(source.item);
        if (!branch) throw new Error('The task has no active branch in this project.');
        if (request.action === 'automation' && typeof request.paused !== 'boolean') throw new Error('Invalid status automation choice.');
        if (request.action === 'attach-pr') {
          const history = await readWorkHistory(git, request.repoPath, branch, await this.get({ repoPath: request.repoPath, itemId: request.itemId }));
          if (
            !history.headSha ||
            (!history.commits.some((entry) => entry.state === 'current' && entry.sha === chosen!.headSha) && history.headSha !== chosen!.headSha)
          )
            throw new Error('The selected PR source revision does not match this task history.');
        }
        const references = structuredClone(source.item.references!);
        if (request.action === 'assign-branch') {
          await assertWorkIdle(git, request.repoPath);
          await git.run(request.repoPath, ['check-ref-format', '--branch', request.branchName]);
          if (!(await workSha(git, request.repoPath, `refs/heads/${request.branchName}`))) throw new Error('Choose an existing local branch.');
          await this.registry.assertAvailable(request.repoPath, request.itemId, request.branchName);
          references.branches = references.branches.map((entry) =>
            entry.id === branch.id ? { ...entry, name: request.branchName, automationPaused: true } : entry,
          );
        }
        if (request.action === 'automation')
          references.branches = references.branches.map((entry) => (entry.id === branch.id ? { ...entry, automationPaused: request.paused } : entry));
        if (request.action === 'archive') delete references.activeWorkflowId;
        if (request.action === 'detach-pr')
          references.pullRequests = references.pullRequests.filter(
            (entry) => !(entry.workflowId === branch.id && plannerWorkReferenceKey(entry) === request.id),
          );
        if (request.action === 'attach-pr') {
          references.pullRequests = [
            ...references.pullRequests.filter((entry) => entry.workflowId !== branch.id || plannerWorkReferenceKey(entry) !== plannerWorkReferenceKey(chosen!)),
            this.reference(chosen!),
          ];
        }
        context.ensureActive();
        const saved = saveWorkItem(request.repoPath, { ...source.item, references: normalizePlannerReferences(references) }, source.revision);
        await this.registry.record(request.repoPath, [saved]);
        return saved;
      },
      context.signal,
    );
  }
}
