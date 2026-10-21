import { randomUUID } from 'node:crypto';
import type { GitRunner } from '../git/GitRunner';
import type { CommitEditGit } from '../git/CommitEditGit';
import { physicalPathKey } from '../git/RepositoryCommonDirectory';
import type {
  BranchChangeInspection,
  BranchChangeResult,
  ExecuteBranchChangeRequest,
  InspectBranchChangeRequest,
  ParkedBranchChange,
} from '../../src/shared/ipc/branchChange';
import type { PlannerWorkCache } from './PlannerWorkCache';
import { BranchChangeStore } from './BranchChangeStore';
import { readBranchChangeState, type BranchChangeState, type BranchChangeReporter } from './branchChangeState';
import {
  branchChangeBlocks,
  changeCheckoutArgs,
  changeStashes,
  inspectChangeTarget,
  verifyChangeStash,
  savedChangeFiles,
  safeBranchChangeGit,
  verifyRestoredChange,
} from './branchChangeGit';
import { workDigest } from './PlannerWorkStore';
import { workSha, type WorkGit } from './plannerWorkInspection';

export type BranchChangeContext = { ownerId: number; signal: AbortSignal; ensureActive(): void; progress?: BranchChangeReporter };
type ChangePlan = { inspection: BranchChangeInspection; state: BranchChangeState; owner: number; expires: number };
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
export class BranchChangeService {
  private readonly plans = new Map<string, ChangePlan>();
  private readonly cancellations = new Map<string, AbortController>();
  readonly store: BranchChangeStore;
  constructor(
    private readonly git: GitRunner,
    cache: PlannerWorkCache,
  ) {
    this.store = new BranchChangeStore(cache);
  }
  private reader(context: BranchChangeContext): WorkGit {
    return {
      run: (repo, args) => {
        context.ensureActive();
        return this.git.run(repo, args, { signal: context.signal, envOverrides: { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } });
      },
    };
  }
  cancel(repo: string, owner: number) {
    const controller = this.cancellations.get(`${owner}:${physicalPathKey(repo)}`);
    controller?.abort();
    return Boolean(controller);
  }
  private async cancellable<T>(repo: string, context: BranchChangeContext, run: (scoped: BranchChangeContext) => Promise<T>) {
    const key = `${context.ownerId}:${physicalPathKey(repo)}`;
    if (this.cancellations.has(key)) throw new Error('Another branch-change operation is running.');
    const controller = new AbortController();
    this.cancellations.set(key, controller);
    const signal = AbortSignal.any([controller.signal, context.signal]);
    try {
      return await run({
        ...context,
        signal,
        ensureActive: () => {
          context.ensureActive();
          signal.throwIfAborted();
        },
      });
    } finally {
      if (this.cancellations.get(key) === controller) this.cancellations.delete(key);
    }
  }
  async inspect(request: InspectBranchChangeRequest, context: BranchChangeContext, scopedGit?: WorkGit): Promise<BranchChangeInspection> {
    const git = scopedGit || this.reader(context);
    const state = await readBranchChangeState(git, request.repoPath, (message, progress) => {
      context.ensureActive();
      context.progress?.(message, progress);
    });
    context.progress?.('Checking worktrees and active Git operations', { phase: 'safety' });
    const blocks = await branchChangeBlocks(git, request.repoPath, state);
    const session = request.sessionId ? (await this.list(request.repoPath, scopedGit)).find((entry) => entry.id === request.sessionId) : undefined;
    if (request.sessionId && !session) throw new Error('The parked changes are no longer available.');
    context.progress?.('Checking checkout target', { phase: 'target' });
    let targetSha = state.head;
    let occupiedWorktree: string | undefined;
    if (request.target) {
      if (
        request.target.kind === 'existing' &&
        !(await workSha(git, request.repoPath, `refs/heads/${request.target.branch}`)) &&
        (await workSha(git, request.repoPath, `refs/tags/${request.target.branch}`))
      )
        request = { ...request, target: { kind: 'detached', ref: `refs/tags/${request.target.branch}` } };
      const target = await inspectChangeTarget(git, request.repoPath, request.target!, state);
      targetSha = target.sha;
      occupiedWorktree = target.occupied;
      if (occupiedWorktree) blocks.push('The target branch is checked out in another worktree.');
    } else if (!session) throw new Error('Choose a checkout target or parked changes.');
    if (session) {
      if (physicalPathKey(session.worktree) !== physicalPathKey(state.gitDir)) blocks.push('Restore these changes in their original worktree.');
      if (state.files.length) blocks.push('Commit or park the current changes before restoring.');
      if (!session.stashOid || !(await workSha(git, request.repoPath, session.stashOid))) blocks.push('The saved stash is missing.');
      if (['applied', 'applying', 'conflict'].includes(session.phase) && request.reviewedRecovery !== true)
        blocks.push('Review the previous restoration before applying these changes again.');
    }
    const targetLabel = request.target?.kind === 'detached' ? request.target.ref : request.target?.branch || state.branch;
    const inspection: BranchChangeInspection = {
      planId: randomUUID(),
      repoPath: request.repoPath,
      sourceBranch: state.branch,
      sourceHead: state.head,
      target: request.target,
      targetSha,
      files: state.files,
      blocks,
      conflicts: state.files
        .filter((file) => file.index === 'U' || file.worktree === 'U' || ['AA', 'DD'].includes(file.index + file.worktree))
        .map((file) => file.path),
      occupiedWorktree,
      session,
      recoveryReviewed: request.reviewedRecovery === true,
      suggestedName: `Branch switch: ${state.branch || state.head.slice(0, 10)} → ${targetLabel} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    };
    if (session?.stashOid && !blocks.includes('The saved stash is missing.')) {
      const saved = await savedChangeFiles(git, request.repoPath, session.stashOid);
      inspection.files = saved.files;
      inspection.stashParents = saved.parents;
    }
    for (const [id, plan] of this.plans) if (plan.expires < Date.now()) this.plans.delete(id);
    if (this.plans.size >= 200) this.plans.delete(this.plans.keys().next().value!);
    this.plans.set(inspection.planId, { inspection, state, owner: context.ownerId, expires: Date.now() + 15 * 60_000 });
    return inspection;
  }
  private async plan(repo: string, id: string, context: BranchChangeContext, git: WorkGit) {
    context.ensureActive();
    const plan = this.plans.get(id);
    if (!plan || plan.owner !== context.ownerId || plan.expires < Date.now() || physicalPathKey(repo) !== physicalPathKey(plan.inspection.repoPath))
      throw new Error('The branch-change preview expired. Review the changes again.');
    if (plan.inspection.blocks.length) throw new Error(plan.inspection.blocks.join('\n'));
    const state = await readBranchChangeState(git, repo, context.progress);
    if (state.digest !== plan.state.digest || (await branchChangeBlocks(git, repo, state)).length)
      throw new Error('The working state changed. Review the branch change again.');
    if (plan.inspection.target && (await inspectChangeTarget(git, repo, plan.inspection.target, state)).sha !== plan.inspection.targetSha)
      throw new Error('The checkout target changed. Review it again.');
    this.plans.delete(id);
    return plan;
  }
  execute(request: ExecuteBranchChangeRequest, context: BranchChangeContext) {
    return this.git.withExclusiveWrite(request.repoPath, 'branch-change:execute', (git) => this.executeLocked(request, context, git), context.signal);
  }
  executeLocked(
    request: ExecuteBranchChangeRequest,
    context: BranchChangeContext,
    git: CommitEditGit,
    expected?: { branch: string; sha: string; create: boolean },
  ): Promise<BranchChangeResult> {
    return this.cancellable(request.repoPath, context, (scoped) => this.executeWork(request, scoped, safeBranchChangeGit(git), expected));
  }
  private async executeWork(
    request: ExecuteBranchChangeRequest,
    context: BranchChangeContext,
    git: CommitEditGit,
    expected?: { branch: string; sha: string; create: boolean },
  ): Promise<BranchChangeResult> {
    const plan = await this.plan(request.repoPath, request.planId, context, git);
    if (
      expected &&
      (plan.inspection.target?.kind !== (expected.create ? 'create' : 'existing') ||
        !('branch' in plan.inspection.target) ||
        plan.inspection.target.branch !== expected.branch ||
        plan.inspection.targetSha !== expected.sha)
    )
      throw new Error('The branch-change choice does not match the task checkout.');
    if (
      !plan.inspection.target ||
      !['carry', 'park'].includes(request.mode) ||
      typeof request.name !== 'string' ||
      !request.name.trim() ||
      /[\0\r\n]/.test(request.name) ||
      request.name.length > 500
    )
      throw new Error('Invalid branch-change choice.');
    const repo = request.repoPath;
    let session: ParkedBranchChange | undefined;
    let switched = false;
    try {
      if (plan.state.files.length) {
        session = {
          id: randomUUID(),
          name: request.name.trim(),
          sourceBranch: plan.state.branch,
          sourceHead: plan.state.head,
          targetBranch: plan.inspection.target.kind === 'detached' ? plan.inspection.target.ref : plan.inspection.target.branch,
          worktree: plan.state.gitDir,
          createdAt: Date.now(),
          phase: 'preparing',
        };
        await this.store.save(repo, session);
        context.ensureActive();
        context.progress?.('Saving reviewed changes', { phase: 'stash' });
        await git.run(repo, ['stash', 'push', '--include-untracked', '-m', `[OGC:${session.id}] ${session.name}`], { ignoreAbort: true });
        const entry = (await changeStashes(git, repo)).find((entry) => entry.subject.includes(`[OGC:${session!.id}]`));
        if (!entry) throw new Error('Git did not create the expected stash.');
        session.stashOid = entry.oid;
        session.phase = 'stashed';
        await this.store.save(repo, session);
        await verifyChangeStash(git, repo, entry.oid, plan.state);
      }
      context.ensureActive();
      const clean = await readBranchChangeState(git, repo);
      if (clean.files.length || clean.head !== plan.state.head || clean.branch !== plan.state.branch || (await branchChangeBlocks(git, repo, clean)).length)
        throw new Error('The working state changed before checkout. The stash is retained.');
      if ((await inspectChangeTarget(git, repo, plan.inspection.target, clean)).sha !== plan.inspection.targetSha)
        throw new Error('The checkout target changed. The stash is retained.');
      context.progress?.('Switching branch', { phase: 'checkout' });
      await git.run(repo, changeCheckoutArgs(plan.inspection.target), { ignoreAbort: true });
      switched = true;
      if (session) {
        session.phase = 'switched';
        await this.store.save(repo, session);
      }
      context.ensureActive();
      if ((await workSha(git, repo, 'HEAD')) !== plan.inspection.targetSha)
        throw new Error('The target revision changed during checkout. Review the saved changes before restoring.');
      if (session && request.mode === 'carry') return this.applyLocked(repo, session, git, context, true);
      return { switched: true, restored: !session, session, conflicts: [] };
    } catch (error) {
      if (!session) throw error;
      session.error = message(error);
      session.currentBranch = (await git.run(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { ignoreAbort: true }).catch(() => '')).trim();
      session.currentHead = (await git.run(repo, ['rev-parse', '--verify', '--quiet', 'HEAD'], { ignoreAbort: true }).catch(() => '')).trim();
      if (session.currentBranch !== plan.state.branch || session.currentHead !== plan.state.head) switched = true;
      await this.store.save(repo, session);
      return { switched, restored: false, session, error: session.error, conflicts: [] };
    }
  }
  async list(repo: string, scopedGit?: WorkGit): Promise<ParkedBranchChange[]> {
    if (!scopedGit) return this.git.withExclusiveWrite(repo, 'branch-change:list', (git) => this.list(repo, git));
    const git = scopedGit;
    const sessions = await this.store.list(repo);
    if (!sessions.length) return [];
    const stashes = await changeStashes(git, repo);
    const gitDir = (await git.run(repo, ['rev-parse', '--absolute-git-dir'])).trim();
    const missing = sessions.filter(
      (entry) => entry.phase !== 'preparing' && !stashes.some((stash) => stash.oid === entry.stashOid && stash.subject.includes(`[OGC:${entry.id}]`)),
    );
    for (const entry of missing) await this.store.remove(repo, entry.id);
    return sessions
      .filter((entry) => !missing.includes(entry))
      .map((entry) => {
        const found = stashes.find((stash) => stash.subject.includes(`[OGC:${entry.id}]`) && (!entry.stashOid || entry.stashOid === stash.oid));
        return {
          ...entry,
          currentWorktree: physicalPathKey(entry.worktree) === physicalPathKey(gitDir),
          ...(found
            ? { stashOid: found.oid, phase: entry.phase === 'preparing' ? ('stashed' as const) : entry.phase }
            : { error: 'The saved stash is missing.' }),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  restore(repo: string, planId: string, context: BranchChangeContext) {
    return this.cancellable(repo, context, (scoped) =>
      this.git.withExclusiveWrite(
        repo,
        'branch-change:restore',
        async (git) => {
          const plan = await this.plan(repo, planId, scoped, git);
          const session = (await this.list(repo, git)).find((entry) => entry.id === plan.inspection.session?.id);
          if (
            !session ||
            session.stashOid !== plan.inspection.session?.stashOid ||
            session.phase !== plan.inspection.session?.phase ||
            (['applied', 'applying', 'conflict'].includes(session.phase) && !plan.inspection.recoveryReviewed)
          )
            throw new Error('Review the restoration state before applying again.');
          return this.applyLocked(repo, session, safeBranchChangeGit(git), scoped, false);
        },
        context.signal,
      ),
    );
  }
  private async applyLocked(
    repo: string,
    session: ParkedBranchChange,
    git: CommitEditGit,
    context: BranchChangeContext,
    switched: boolean,
  ): Promise<BranchChangeResult> {
    context.ensureActive();
    const current = await readBranchChangeState(git, repo);
    if (current.files.length || physicalPathKey(current.gitDir) !== physicalPathKey(session.worktree) || (await branchChangeBlocks(git, repo, current)).length)
      throw new Error('The worktree is not ready to restore the saved changes.');
    const stack = await changeStashes(git, repo);
    if (!session.stashOid || !stack.some((entry) => entry.oid === session.stashOid && entry.subject.includes(`[OGC:${session.id}]`)))
      throw new Error('The saved stash is missing.');
    session.phase = 'applying';
    session.currentBranch = current.branch;
    session.currentHead = current.head;
    delete session.error;
    await this.store.save(repo, session);
    context.progress?.('Restoring changes and staged state', { phase: 'restore' });
    try {
      await git.run(repo, ['stash', 'apply', '--index', session.stashOid], { ignoreAbort: true });
    } catch (error) {
      session.phase = 'conflict';
      session.error = message(error);
      await this.store.save(repo, session);
      const conflicts = (await git.run(repo, ['diff', '--name-only', '--diff-filter=U', '-z'], { ignoreAbort: true })).split('\0').filter(Boolean);
      return { switched, restored: false, session, error: session.error, conflicts };
    }
    session.phase = 'applied';
    await this.store.save(repo, session);
    try {
      context.ensureActive();
      try {
        await verifyRestoredChange(git, repo, session.stashOid, current.head);
      } catch {
        throw new Error('Changes restored. The resulting state could not be verified, so the backup was retained.');
      }
      context.progress?.('Removing the restored backup', { phase: 'cleanup' });
      const latest = await changeStashes(git, repo);
      const own = latest.filter((entry) => entry.oid === session.stashOid && entry.subject.includes(`[OGC:${session.id}]`));
      if (workDigest(stack) !== workDigest(latest) || own.length !== 1)
        throw new Error('Changes restored. The stash stack changed, so the backup was retained.');
      if ((await workSha(git, repo, own[0].ref)) !== session.stashOid) throw new Error('Changes restored. The backup could not be safely removed.');
      await git.run(repo, ['stash', 'drop', own[0].ref], { ignoreAbort: true });
      await this.store.remove(repo, session.id);
      return { switched, restored: true, conflicts: [] };
    } catch (error) {
      session.error = message(error);
      await this.store.save(repo, session);
      return { switched, restored: true, session, error: session.error, conflicts: [] };
    }
  }
}
