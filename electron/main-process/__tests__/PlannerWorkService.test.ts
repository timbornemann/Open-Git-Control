import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from '../../git/__tests__/gitIntegrationLifecycle';
import { cleanupTransferFixtures, git } from '../../git/__tests__/remoteTransferFixture';
import { workFixture } from './plannerWorkFixture';
import * as workStore from '../PlannerWorkStore';
const { loadWorkItem, saveWorkItem, workPlanningPath } = workStore;
import { PlannerWorkService } from '../PlannerWorkService';
import { PlannerWorkCache } from '../PlannerWorkCache';
import { workBases, workState } from '../plannerWorkInspection';
import { updatePlannerItemInData } from '../projectPlannerStore';
import { writeRepositoryPlanningFile } from '../repositoryPlanningFile';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const lifecycles: GitIntegrationLifecycle[] = [];
const test = (name: string, run: (f: ReturnType<typeof workFixture>) => Promise<void>) =>
  it(
    name,
    async () => {
      const lifecycle = new GitIntegrationLifecycle();
      lifecycles.push(lifecycle);
      await lifecycle.track(run(workFixture(lifecycle)));
    },
    120_000,
  );
beforeEach(() => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', path.join(os.tmpdir(), `ogc-work-global-${randomUUID()}`));
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
});
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((lifecycle) => lifecycle.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await cleanupTransferFixtures();
}, 60_000);

describe('PlannerWorkService with real Git', () => {
  test('creates a portable workflow after checkout, resumes it and retains local cache across restart', async (f) => {
    const plan = await f.inspect();
    expect(plan.defaultBase).toBe('refs/heads/main');
    expect(plan.suggestedName).toMatch(/^task\/[a-f0-9]{8}-anderung-mit-prufung$/);
    const result = await f.start();
    expect(result.item?.status).toBe('in-progress');
    expect(git(f.repo, 'branch', '--show-current')).toBe(result.branch);
    f.commitPlanning();
    f.commit('external task work');
    const original = fs.readFileSync(workPlanningPath(f.repo), 'utf8');
    const details = await f.service.refresh(f.request, f.context);
    expect(details.commits.map((entry) => entry.subject)).toContain('external task work');
    expect(details.commits.every((entry) => entry.sha.length === 40)).toBe(true);
    expect(fs.readFileSync(workPlanningPath(f.repo), 'utf8')).toBe(original);
    const restarted = new PlannerWorkService(f.lifecycle.runner, new PlannerWorkCache(path.join(f.root, 'local-cache')), f.hosting);
    expect((await restarted.get(f.request)).commits).toEqual(details.commits);
    const resumed = await f.start();
    expect(resumed.branch).toBe(result.branch);
    expect(f.current().item.references?.branches).toHaveLength(1);
    expect(original).not.toContain(f.repo);
  });
  test('requires explicit dirty carry, restores its stash, and rejects changed reviewed state', async (f) => {
    fs.writeFileSync(path.join(f.repo, 'untracked.txt'), 'draft');
    await expect(f.start()).rejects.toThrow('Confirm carrying');
    expect(git(f.repo, 'branch', '--show-current')).toBe('main');
    const plan = await f.inspect();
    fs.writeFileSync(path.join(f.repo, 'untracked.txt'), 'different draft');
    await expect(
      f.service.start({ ...f.request, planId: plan.planId, branchName: plan.suggestedName, baseRef: plan.defaultBase, acceptChanges: true }, f.context),
    ).rejects.toThrow('changed after review');
    const result = await f.start(true);
    expect(result.item).toBeTruthy();
    expect(git(f.repo, 'stash', 'list')).toBe('');
    expect(fs.readFileSync(path.join(f.repo, 'untracked.txt'), 'utf8')).toBe('different draft');
  });
  test('binds previews to task revision, owner, account and base SHA, and rejects collisions', async (f) => {
    let plan = await f.inspect();
    const start = (owner = f.context.ownerId) =>
      f.service.start(
        { ...f.request, planId: plan.planId, branchName: plan.suggestedName, baseRef: plan.defaultBase, acceptChanges: true },
        { ...f.context, ownerId: owner },
      );
    await expect(start(2)).rejects.toThrow('expired');
    f.state.account = 'other-account';
    await expect(start()).rejects.toThrow('session changed');
    plan = await f.inspect();
    const source = f.current();
    saveWorkItem(f.repo, { ...source.item, title: 'Changed' }, source.revision);
    await expect(start()).rejects.toThrow('task or hosting session changed');
    plan = await f.inspect();
    git(f.repo, 'branch', plan.suggestedName);
    await expect(start()).rejects.toThrow('already in use');
    expect(f.current().item.status).toBe('planned');
  });
  test('chooses the more advanced default and requires a choice for divergence without fetching', async (f) => {
    const remote = f.bare('remote');
    git(f.repo, 'remote', 'add', 'origin', remote);
    git(f.repo, 'push', 'origin', 'main');
    git(f.repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    const base = git(f.repo, 'rev-parse', 'HEAD');
    f.commit('local ahead');
    expect((await workBases(f.lifecycle.runner, f.repo)).defaultBase).toBe('refs/heads/main');
    const ahead = git(f.repo, 'rev-parse', 'HEAD');
    git(f.repo, 'update-ref', 'refs/remotes/origin/main', ahead);
    git(f.repo, 'reset', '--hard', base);
    expect((await workBases(f.lifecycle.runner, f.repo)).defaultBase).toBe('refs/remotes/origin/main');
    f.commit('divergent local');
    expect((await workBases(f.lifecycle.runner, f.repo)).defaultBase).toBe('');
  });
  test('protects assigned branches across checkouts and prevents sharing them between tasks', async (f) => {
    const started = await f.start();
    f.commitPlanning();
    expect(await f.service.protectedBranches(f.repo)).toEqual([expect.objectContaining({ branch: started.branch })]);
    git(f.repo, 'switch', 'main');
    expect(await f.service.protectedBranches(f.repo)).toEqual([expect.objectContaining({ branch: started.branch })]);
    const main = f.current();
    main.data.items.push({ ...main.item, id: 'task-2' });
    writeRepositoryPlanningFile(workPlanningPath(f.repo), main.data);
    const another = { ...f.request, itemId: 'task-2' };
    const preview = await f.service.inspect(another, f.context);
    await expect(
      f.service.start({ ...another, planId: preview.planId, branchName: started.branch, baseRef: preview.defaultBase, acceptChanges: true }, f.context),
    ).rejects.toThrow('already assigned to task');
    git(f.repo, 'add', '.Open-Git-Control/planning.json');
    git(f.repo, 'commit', '-m', 'another task');
    git(f.repo, 'branch', '-m', started.branch, 'task/renamed');
    await f.service.renamed(f.repo, started.branch, 'task/renamed');
    expect(await f.service.protectedBranches(f.repo)).toEqual([expect.objectContaining({ branch: 'task/renamed' })]);
    git(f.repo, 'switch', 'task/renamed');
    await f.inspect();
    expect(f.current().item.references?.branches[0].name).toBe('task/renamed');
    expect(f.current().item.references?.branches[0].previousNames).toContain(started.branch);
    await f.service.detached(f.repo, [f.request.itemId]);
    expect(await f.service.protectedBranches(f.repo)).toEqual([]);
  });
  test('rejects occupied worktrees and active operations without changing task status', async (f) => {
    const result = await f.start();
    f.commitPlanning();
    git(f.repo, 'switch', 'main');
    const tree = path.join(f.root, 'task-worktree');
    git(f.repo, 'worktree', 'add', tree, result.branch);
    await f.cache.write(f.repo, 'shared-test-key', { value: 'shared across worktrees' }, () => true);
    expect(await f.cache.read(tree, 'shared-test-key')).toEqual({ value: 'shared across worktrees' });
    const selected = loadWorkItem(tree, f.request.itemId);
    const main = f.current();
    saveWorkItem(f.repo, { ...main.item, references: selected.item.references }, main.revision);
    await expect(f.start(true)).rejects.toThrow('another worktree:');
    fs.writeFileSync(path.join(f.repo, '.git', 'MERGE_HEAD'), `${git(f.repo, 'rev-parse', 'HEAD')}\n`);
    await expect(f.inspect()).rejects.toThrow('active Git operation');
  });
  test('preserves other planning entries on a different base and refuses content conflicts', async (f) => {
    git(f.repo, 'switch', '-c', 'planning-source');
    const source = f.current();
    saveWorkItem(f.repo, { ...source.item, title: 'Conflicting source title' }, source.revision);
    git(f.repo, 'add', '.Open-Git-Control/planning.json');
    git(f.repo, 'commit', '-m', 'source task');
    const plan = await f.inspect();
    await expect(
      f.service.start({ ...f.request, planId: plan.planId, branchName: plan.suggestedName, baseRef: 'refs/heads/main', acceptChanges: true }, f.context),
    ).rejects.toThrow('conflicting task content');
    expect(git(f.repo, 'branch', '--show-current')).toBe('planning-source');
  });
  test('carries a task absent from the chosen base without replacing other tasks', async (f) => {
    git(f.repo, 'branch', 'task-source');
    const source = f.current();
    source.data.items = [{ ...source.item, id: 'unrelated', title: 'Keep this task' }];
    writeRepositoryPlanningFile(workPlanningPath(f.repo), source.data);
    git(f.repo, 'add', '.Open-Git-Control/planning.json');
    git(f.repo, 'commit', '-m', 'target planning');
    git(f.repo, 'switch', 'task-source');
    const result = await f.start();
    expect(result.item?.id).toBe(f.request.itemId);
    expect(
      f
        .current()
        .data.items.map((entry) => entry.id)
        .sort(),
    ).toEqual(['task-1', 'unrelated']);
  });
  test('keeps the last atomic cache value on cancellation and refuses oversized or redirected cache writes', async (f) => {
    await f.cache.write(f.repo, 'atomic', { value: 'original' }, () => true);
    await expect(f.cache.write(f.repo, 'atomic', { value: 'cancelled' }, () => false)).rejects.toThrow('destination changed');
    expect(await f.cache.read(f.repo, 'atomic')).toEqual({ value: 'original' });
    await expect(f.cache.write(f.repo, 'atomic', { value: 'x'.repeat(2 * 1024 ** 2) }, () => true)).rejects.toThrow('too large');
    const root = path.join(f.root, 'redirect-cache');
    fs.mkdirSync(root);
    const target = path.join(f.root, 'outside-cache');
    fs.mkdirSync(target);
    fs.symlinkSync(target, path.join(root, 'planner-work-v1'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new PlannerWorkCache(root).write(f.repo, 'key', { value: 'forbidden' }, () => true)).rejects.toThrow();
    expect(fs.readdirSync(target)).toEqual([]);
  });
  test('reports assignment failures after checkout and safely recovers without resetting work', async (f) => {
    vi.spyOn(workStore, 'carryWorkItem').mockImplementationOnce(() => {
      throw new Error('disk unavailable');
    });
    const result = await f.start();
    expect(result.recoveryId).toBeTruthy();
    expect(git(f.repo, 'branch', '--show-current')).toBe(result.branch);
    expect(f.current().item.status).toBe('planned');
    expect((await f.service.get(f.request)).revision).toBe(f.current().revision);
    const restarted = new PlannerWorkService(f.lifecycle.runner, f.cache, f.hosting);
    expect((await restarted.get({ ...f.request, listRecoveries: true })).recoveries).toEqual([expect.objectContaining({ recoveryId: result.recoveryId })]);
    expect((await restarted.inspect(f.request, f.context)).recoveryId).toBe(result.recoveryId);
    const saved = await f.service.update(
      { ...f.request, action: 'recover', recoveryId: result.recoveryId!, expectedRevision: f.current().revision },
      f.context,
    );
    expect(saved.references?.branches[0].name).toBe(result.branch);
    expect((await restarted.get({ ...f.request, listRecoveries: true })).recoveries).toEqual([]);
  });
  test('tracks external amend and first-parent history without collecting upstream commits', async (f) => {
    const started = await f.start();
    f.commitPlanning();
    const first = f.commit('work before amend');
    await f.service.refresh(f.request, f.context);
    git(f.repo, 'commit', '--amend', '-m', 'amended task work');
    let details = await f.service.refresh(f.request, f.context);
    expect(details.commits.find((entry) => entry.sha === first)?.state).toBe('replaced');
    git(f.repo, 'switch', 'main');
    fs.writeFileSync(path.join(f.repo, 'upstream.txt'), 'upstream');
    git(f.repo, 'add', 'upstream.txt');
    git(f.repo, 'commit', '-m', 'upstream-only');
    const upstream = git(f.repo, 'rev-parse', 'HEAD');
    git(f.repo, 'switch', started.branch);
    git(f.repo, 'merge', '--no-edit', 'main');
    details = await f.service.refresh(f.request, f.context);
    expect(details.commits.some((entry) => entry.sha === upstream)).toBe(false);
    const spy = vi.spyOn(f.lifecycle.runner, 'run');
    await f.service.refresh(f.request, f.context);
    expect(spy.mock.calls.some(([, args]) => args[0] === 'log')).toBe(false);
    const references = f.current().item.references;
    git(f.repo, 'switch', 'main');
    git(f.repo, 'branch', '-D', started.branch);
    const main = f.current();
    saveWorkItem(f.repo, { ...main.item, references }, main.revision);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let pass = 0; pass < 3; pass++) {
      const missing = await f.service.refresh(f.request, f.context);
      expect(missing.branchMissing).toBe(true);
      expect(missing.commits).toEqual(details.commits);
    }
    expect(consoleError).not.toHaveBeenCalled();
    git(f.repo, 'branch', started.branch, details.headSha!);
    expect((await f.service.refresh(f.request, f.context)).branchMissing).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });
  test('activates a previously paused workflow when creating the PR and completes on merge without another resume', async (f) => {
    await f.start();
    f.commitPlanning();
    f.commit('task implementation');
    const source = f.current();
    saveWorkItem(f.repo, updatePlannerItemInData(source.data, source.item.id, { status: 'blocked' }), source.revision);
    f.commitPlanning();
    expect(f.current().item.references?.branches[0].automationPaused).toBe(true);
    f.remote.requests = [f.pr(git(f.repo, 'rev-parse', 'HEAD'))];
    const activated = await f.service.update({ ...f.request, action: 'automation', paused: false, expectedRevision: f.current().revision }, f.context);
    expect(activated.references?.branches[0].automationPaused).toBe(false);
    expect(activated.references?.pullRequests).toHaveLength(1);
    expect(activated.status).toBe('blocked'); // An open PR does not complete the task.
    f.commitPlanning();
    f.remote.requests[0].state = 'merged';
    await f.service.refresh(f.request, f.context);
    expect(f.current().item.status).toBe('done');
    expect(f.current().item.references?.branches[0].completedBy).toBeTruthy();
  });
  test('respects manual status changes and checks a confirmed merge immediately when automation resumes', async (f) => {
    await f.start();
    f.commitPlanning();
    const head = f.commit('task work');
    f.remote.requests = [f.pr(head)];
    await f.service.refresh(f.request, f.context);
    expect(f.current().item.status).toBe('in-progress');
    expect(f.current().item.references?.pullRequests).toHaveLength(1);
    f.remote.requests[0].state = 'closed';
    await f.service.refresh(f.request, f.context);
    expect(f.current().item.status).toBe('in-progress');
    f.remote.requests[0].state = 'merged';
    const source = f.current();
    const updated = updatePlannerItemInData(source.data, source.item.id, { status: 'blocked' });
    saveWorkItem(f.repo, updated, source.revision);
    f.commitPlanning();
    expect((await f.service.refresh(f.request, f.context)).completion).toBe('ready');
    expect(f.current().item.status).toBe('blocked');
    const resumed = await f.service.update({ ...f.request, action: 'automation', paused: false, expectedRevision: f.current().revision }, f.context);
    expect(resumed.status).toBe('done');
    expect(f.current().item.status).toBe('done');
    const completed = f.current();
    saveWorkItem(f.repo, { ...completed.item, status: 'planned' }, completed.revision);
    await f.service.refresh(f.request, f.context);
    expect(f.current().item.status).toBe('planned');
    const next = f.current();
    const references = structuredClone(next.item.references!);
    references.branches.push({ ...references.branches[0], id: 'next-workflow', completedBy: undefined });
    references.activeWorkflowId = 'next-workflow';
    references.pullRequests.push({ ...references.pullRequests[0], workflowId: 'next-workflow' });
    saveWorkItem(f.repo, { ...next.item, status: 'in-progress', references }, next.revision);
    f.remote.requests = [f.pr(head, { state: 'merged' })];
    await f.service.refresh(f.request, f.context);
    expect(f.current().item.status).toBe('in-progress');
  });
  test('completes after planning-only commits and an empty integration merge even when the remote branch was deleted', async (f) => {
    const started = await f.start();
    f.commitPlanning();
    const head = f.commit('task implementation');
    const server = f.bare('hosting');
    git(f.repo, 'remote', 'add', 'origin', server);
    git(f.repo, 'push', '--set-upstream', 'origin', started.branch);
    f.remote.requests = [f.pr(head)];
    await f.service.refresh(f.request, f.context);
    f.commitPlanning(); // Recording the PR reference happens after the published PR head.
    git(f.repo, 'switch', 'main');
    git(f.repo, 'merge', '--no-ff', '--no-edit', head);
    git(f.repo, 'push', 'origin', 'main');
    git(f.repo, 'push', 'origin', '--delete', started.branch);
    git(f.repo, 'switch', started.branch);
    git(f.repo, 'merge', '--no-ff', '--no-edit', 'main');
    const branchTip = git(f.repo, 'rev-parse', 'HEAD');
    expect(branchTip).not.toBe(head);
    git(f.repo, 'switch', 'main');
    git(f.repo, 'merge', '--no-ff', '--no-edit', started.branch);
    f.remote.requests[0].state = 'merged';
    const details = await f.service.refresh(f.request, f.context);
    expect(details.completion).toBe('ready');
    expect(details.headSha).toBe(branchTip);
    expect(f.current().item.status).toBe('done');
    expect(f.current().item.references?.branches[0].completedBy).toBeTruthy();
    const restarted = new PlannerWorkService(f.lifecycle.runner, f.cache, f.hosting);
    expect((await restarted.get(f.request)).requests[0].state).toBe('merged');
    await restarted.refresh(f.request, f.context);
    expect(f.current().item.status).toBe('done');
  });
  test('does not treat code changes followed by a revert as planning-only changes', async (f) => {
    await f.start();
    f.commitPlanning();
    const head = f.commit('published task work');
    f.remote.requests = [f.pr(head)];
    await f.service.refresh(f.request, f.context);
    f.commitPlanning();
    f.commit('unreviewed code');
    git(f.repo, 'revert', '--no-edit', 'HEAD');
    expect(git(f.repo, 'diff', '--name-only', head, 'HEAD')).toBe('.Open-Git-Control/planning.json');
    f.remote.requests[0].state = 'merged';
    expect((await f.service.refresh(f.request, f.context)).completion).toBe('new-work');
    expect(f.current().item.status).toBe('in-progress');
  });
  test('can finish additional work through a newer linked merged PR', async (f) => {
    await f.start();
    f.commitPlanning();
    const first = f.commit('first reviewed work');
    f.remote.requests = [f.pr(first)];
    await f.service.refresh(f.request, f.context);
    f.commitPlanning();
    const latest = f.commit('additional reviewed work');
    const second = f.pr(latest, { id: '2', number: '2', url: 'https://code.invalid/team/repo/pull/2' });
    f.remote.requests = [{ ...f.remote.requests[0], state: 'merged' }, second];
    await f.service.update({ ...f.request, action: 'attach-pr', reference: second, expectedRevision: f.current().revision }, f.context);
    f.remote.requests[1].state = 'merged';
    expect((await f.service.refresh(f.request, f.context)).completion).toBe('ready');
    expect(f.current().item.status).toBe('done');
    expect(f.current().item.references?.branches[0].completedBy).toContain('"2"');
  });
  test('keeps rewritten work open without repeatedly logging a normal non-ancestor result', async (f) => {
    await f.start();
    f.commitPlanning();
    const oldHead = f.commit('published task work');
    f.remote.requests = [f.pr(oldHead)];
    await f.service.refresh(f.request, f.context);
    f.commitPlanning();
    git(f.repo, 'reset', '--soft', `${oldHead}^`);
    git(f.repo, 'commit', '-m', 'rewritten task work');
    f.remote.requests[0].state = 'merged';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let pass = 0; pass < 3; pass++) {
      const refreshed = await f.service.refresh(f.request, f.context);
      expect(refreshed.completion).toBe('new-work');
      expect(refreshed.error).toBeUndefined();
      expect(f.current().item.status).toBe('in-progress');
    }
    expect(consoleError).not.toHaveBeenCalled();
  });
  test('rechecks branch and task revisions after the server reports a merge', async (f) => {
    await f.start();
    f.commitPlanning();
    const head = f.commit('published task work');
    f.remote.requests = [f.pr(head)];
    await f.service.refresh(f.request, f.context);
    f.commitPlanning();
    f.remote.requests[0].state = 'merged';
    f.hosting.read.mockImplementationOnce(async () => {
      f.commit('concurrent branch work');
      return f.remote;
    });
    const changed = await f.service.refresh(f.request, f.context);
    expect(changed.error).toContain('work branch changed');
    expect(changed.completion).toBeUndefined();
    expect(f.current().item.status).toBe('in-progress');
    f.remote.requests[0].headSha = git(f.repo, 'rev-parse', 'HEAD');
    f.hosting.read.mockImplementationOnce(async () => {
      const current = f.current();
      saveWorkItem(f.repo, updatePlannerItemInData(current.data, current.item.id, { status: 'blocked' }), current.revision);
      return f.remote;
    });
    expect((await f.service.refresh(f.request, f.context)).error).toContain('task changed');
    expect(f.current().item.status).toBe('blocked');
    expect(f.current().item.references?.branches[0].completedBy).toBeUndefined();
  });
  test('does not close newer work, ambiguous requests, partial histories or failed hosting queries', async (f) => {
    await f.start();
    f.commitPlanning();
    const first = f.commit('first');
    const head = f.commit('new work');
    f.remote.requests = [f.pr(first, { state: 'merged' })];
    await f.service.refresh(f.request, f.context);
    expect(f.current().item.status).toBe('in-progress');
    f.hosting.read.mockRejectedValueOnce(new Error('offline'));
    const offline = await f.service.refresh(f.request, f.context);
    expect(offline.error).toBe('offline');
    expect(offline.requests).toHaveLength(1);
    const source = f.current();
    await f.service.update(
      { ...f.request, action: 'detach-pr', id: JSON.stringify(['github', 'https://code.invalid', '42', '1']), expectedRevision: source.revision },
      f.context,
    );
    f.remote.requests = [f.pr(head), f.pr(head, { id: '2', number: '2' })];
    await f.service.refresh(f.request, f.context);
    expect(f.current().item.references?.pullRequests).toHaveLength(0);
    fs.writeFileSync(path.join(f.repo, '.git', 'shallow'), `${head}\n`);
    f.remote.requests = [f.pr(head, { state: 'merged' })];
    const shallow = await f.service.refresh(f.request, f.context);
    expect(shallow.historyIncomplete).toBe(true);
    expect(f.current().item.status).toBe('in-progress');
  });
  test('binds dirty untracked content and rejects redirected ancestor paths', async (f) => {
    const state = await workState(f.lifecycle.runner, f.repo);
    expect(state.changes).toEqual([]);
    const outside = path.join(f.root, 'outside-work');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret'), 'do not read');
    fs.symlinkSync(outside, path.join(f.repo, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    const reader = { run: (repo: string, args: string[]) => (args[0] === 'status' ? Promise.resolve('?? link/secret\0') : f.lifecycle.runner.run(repo, args)) };
    await expect(workState(reader, f.repo)).rejects.toThrow('Unsafe working-tree path');
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      f.service.inspect(f.request, { ...f.context, signal: cancelled.signal, ensureActive: () => cancelled.signal.throwIfAborted() }),
    ).rejects.toThrow();
  });
});
