import { afterEach, expect, it, vi } from 'vitest';
import { createDemoApi } from './demoApi';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { parseGitLog } from '@/utils/gitParsing';
import { unmergedBranch } from '@/shared/tutorial/branchUnmergedHelpers';
import { writeDemoFile } from './demoFiles';
import type { BranchCleanupInspection } from '@/shared/ipc/branchCleanup';

const merged = ['feature/fertig', 'fix/integriert'];
function create() {
  const original = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'branches-unmerged')!.steps[0];
  return createDemoApi(
    { request: { chapterId: 'branches-unmerged' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    {
      ...original,
      prepare: {
        ...original.prepare,
        branches: {
          heads: [
            { name: 'main', commit: 3 },
            { name: merged[0], commit: 2 },
            { name: merged[1], commit: 3 },
            { name: unmergedBranch, commit: 4 },
          ],
          current: 'main',
          remotes: [{ name: 'origin/main', commit: 3 }],
        },
      },
    },
  );
}
type Demo = ReturnType<typeof create>;
async function inspect(demo: Demo, targetOverrides: Record<string, string> = {}) {
  const result = await demo.api.git.inspectBranchCleanup({ repoPath: DEMO_REPO, operationId: crypto.randomUUID(), targetOverrides });
  expect(result.success).toBe(true);
  if (!result.success) throw Error(result.error);
  return result.data;
}
const candidate = (plan: BranchCleanupInspection, name: string) => plan.candidates.find((entry) => entry.name === name)!;
function execute(demo: Demo, plan: BranchCleanupInspection, names: string[], forced: string[] = [], operationId = crypto.randomUUID()) {
  return demo.api.git.executeBranchCleanup({
    repoPath: DEMO_REPO,
    operationId,
    planId: plan.id,
    selectedIds: names.map((name) => candidate(plan, name).id),
    confirmedUnmergedIds: forced.map((name) => candidate(plan, name).id),
  });
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('classifies actual saved refs against main and selects only unblocked merged branches', async () => {
  const demo = create();
  const plan = await inspect(demo);
  const target = plan.targets.find((entry) => entry.id === plan.comparisons[0].targetId)!;
  expect(target).toMatchObject({ name: 'main', oid: hash(3) });
  expect(
    plan.candidates
      .filter((entry) => entry.selectedByDefault)
      .map((entry) => entry.name)
      .sort(),
  ).toEqual(merged);
  expect(candidate(plan, unmergedBranch)).toMatchObject({ oid: hash(4), unmergedCommitCount: 1, classification: 'other', requiresForce: true });
  expect(candidate(plan, 'main').blocks.map((reason) => reason.code)).toEqual(expect.arrayContaining(['current', 'protected']));
  expect(candidate(plan, merged[0]).lastCommitAt).toBe(Date.parse(demo.repo.commits.find((commit) => commit.hash === hash(2))!.date));
  expect(demo.unsupported.size).toBe(0);
});

it('deletes only selected merged refs and preserves actual files, HEAD, index, remotes and objects', async () => {
  const demo = create();
  const plan = await inspect(demo);
  const before = structuredClone({
    files: demo.repo.files,
    index: demo.repo.indexFiles,
    head: demo.repo.headFiles,
    remotes: demo.repo.remoteHeads,
    commits: demo.repo.commits,
  });
  expect(await execute(demo, plan, merged)).toMatchObject({
    success: true,
    data: { cancelled: false, outcomes: [{ status: 'deleted' }, { status: 'deleted' }] },
  });
  expect(demo.repo.branches.sort()).toEqual([unmergedBranch, 'main']);
  expect({
    files: demo.repo.files,
    index: demo.repo.indexFiles,
    head: demo.repo.headFiles,
    remotes: demo.repo.remoteHeads,
    commits: demo.repo.commits,
  }).toEqual(before);
  expect(demo.repo.status()).toBe('');
  expect(demo.repo.branch).toBe('main');
});

it('requires an explicit unmerged confirmation and removes only its reference', async () => {
  const demo = create();
  const plan = await inspect(demo);
  expect(await execute(demo, plan, [unmergedBranch])).toMatchObject({ success: false });
  expect(demo.repo.branches).toContain(unmergedBranch);
  expect(await execute(demo, plan, [unmergedBranch], [unmergedBranch])).toMatchObject({ success: true });
  expect(demo.repo.branches).not.toContain(unmergedBranch);
  expect(demo.repo.commits.some((commit) => commit.hash === hash(4))).toBe(true);
  expect(parseGitLog(demo.repo.log()).map((commit) => commit.hash)).toEqual([hash(3), hash(2), hash(1)]);
});

it('returns owned DTO copies instead of accepting a modified inspection as authorization', async () => {
  const demo = create();
  const plan = await inspect(demo);
  const forced = candidate(plan, unmergedBranch);
  forced.requiresForce = false;
  forced.classification = 'merged';
  forced.blocks = [];
  expect(await execute(demo, plan, [unmergedBranch])).toMatchObject({ success: false });
  expect(demo.repo.branches).toContain(unmergedBranch);
});
it('keeps a local inspection valid when a background hosting read only records that it was opened', async () => {
  const demo = create();
  const plan = await inspect(demo);
  demo.repo.mark('hosting-inspected');
  expect(await execute(demo, plan, merged)).toMatchObject({ success: true });
});

it('reclassifies real history when the comparison target changes and protects that target', async () => {
  const demo = create();
  const initial = await inspect(demo);
  const target = initial.targets.find((entry) => entry.name === unmergedBranch)!;
  const plan = await inspect(demo, { local: target.id });
  expect(candidate(plan, unmergedBranch)).toMatchObject({ classification: 'merged', unmergedCommitCount: 0, requiresForce: false, selectedByDefault: false });
  expect(candidate(plan, unmergedBranch).blocks).toContainEqual({ code: 'protected' });
  const missing = await inspect(demo, { local: 'not-a-target' });
  expect(missing.comparisons[0].targetId).toBeNull();
  expect(missing.candidates.every((entry) => entry.blocks.some((reason) => reason.code === 'missing-target') && !entry.selectedByDefault)).toBe(true);
});

it.each(['ref', 'worktree', 'reset', 'preferences'])('rejects a stale plan after a %s change before deleting any selected branch', async (change) => {
  const demo = create();
  const plan = await inspect(demo);
  if (change === 'ref') demo.repo.command('branch', '-m', merged[0], 'feature/renamed');
  if (change === 'worktree') writeDemoFile(demo.repo, 'README.md', 'Keep this newer edit\n');
  if (change === 'reset') demo.repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'branches-unmerged')!.steps[0]);
  if (change === 'preferences') await demo.api.git.saveBranchCleanupPreferences(DEMO_REPO, { protectedPatterns: ['feature/*'] });
  const refs = [...demo.repo.branchHeads];
  expect(await execute(demo, plan, [merged[1]])).toMatchObject({ success: false, error: 'changed' });
  expect([...demo.repo.branchHeads]).toEqual(refs);
});

it('keeps protection in the isolated provider and always retains built-in protection', async () => {
  const demo = create();
  const result = await demo.api.git.saveBranchCleanupPreferences(DEMO_REPO, { protectedPatterns: ['feature/*'] });
  expect(result).toMatchObject({ success: true, data: { protectedPatterns: ['main', 'master', 'develop', 'development', 'feature/*'] } });
  if (result.success) result.data.protectedPatterns.length = 0;
  const plan = await inspect(demo);
  expect(candidate(plan, merged[0]).blocks).toContainEqual({ code: 'protected' });
  expect(candidate(plan, unmergedBranch).blocks).toContainEqual({ code: 'protected' });
  expect(candidate(plan, merged[1]).selectedByDefault).toBe(true);
  expect(demo.repo.command('branch', '-D', merged[0])).toMatchObject({ success: false, error: expect.stringContaining('[PROTECTED_BRANCH]') });
  expect(demo.repo.command('protectedBranches')).toMatchObject({ success: true, data: expect.stringContaining(merged[0]) });
  expect((await inspect(create())).protectedPatterns).toEqual(['main', 'master', 'develop', 'development']);
  demo.repo.selectProject(DEMO_SECOND_REPO);
  expect(await demo.api.git.getBranchCleanupPreferences(DEMO_SECOND_REPO)).toMatchObject({
    success: true,
    data: { protectedPatterns: ['main', 'master', 'develop', 'development'] },
  });
  expect(await demo.api.git.getBranchCleanupPreferences(DEMO_REPO)).toMatchObject({ success: false });
  demo.repo.selectProject(DEMO_REPO);
  expect(await demo.api.git.getBranchCleanupPreferences(DEMO_REPO)).toMatchObject({
    success: true,
    data: { protectedPatterns: expect.arrayContaining(['feature/*']) },
  });
});

it('blocks incomplete history and overlapping executions, and rechecks after the asynchronous boundary', async () => {
  const demo = create();
  const plan = await inspect(demo);
  const refs = [...demo.repo.branchHeads];
  const first = execute(demo, plan, merged);
  const second = execute(demo, plan, merged);
  writeDemoFile(demo.repo, 'README.md', 'Newer work must stay intact\n');
  expect(await second).toMatchObject({ success: false });
  expect(await first).toMatchObject({
    success: true,
    data: {
      outcomes: [
        { status: 'skipped', message: 'changed' },
        { status: 'skipped', message: 'changed' },
      ],
    },
  });
  expect([...demo.repo.branchHeads]).toEqual(refs);
  demo.repo.commits = demo.repo.commits.filter((commit) => commit.hash !== hash(2));
  const incomplete = await inspect(demo);
  expect(incomplete.candidates.every((entry) => entry.blocks.some((reason) => reason.code === 'incomplete-history') && !entry.selectedByDefault)).toBe(true);
});

it.each([[''], ['bad name'], ['bad\nname'], ['x'.repeat(1025)], Array.from({ length: 129 }, (_, index) => 'branch' + index)])(
  'rejects invalid protection patterns without replacing the prior preferences (%j)',
  async (...patterns) => {
    const demo = create();
    expect(await demo.api.git.saveBranchCleanupPreferences(DEMO_REPO, { protectedPatterns: patterns })).toMatchObject({ success: false });
    expect(await demo.api.git.getBranchCleanupPreferences(DEMO_REPO)).toMatchObject({
      success: true,
      data: { protectedPatterns: ['main', 'master', 'develop', 'development'] },
    });
  },
);

it('rejects protected selections, foreign plans, repeated IDs and unknown IDs without deletion', async () => {
  const demo = create();
  const plan = await inspect(demo);
  const before = [...demo.repo.branchHeads];
  expect(await execute(demo, plan, ['main'], ['main'])).toMatchObject({ success: false });
  expect(await execute(demo, plan, [merged[0], merged[0]])).toMatchObject({ success: false });
  const request = { repoPath: DEMO_REPO, operationId: 'invalid-selection', planId: plan.id, selectedIds: ['unknown'], confirmedUnmergedIds: [] };
  expect(await demo.api.git.executeBranchCleanup(request)).toMatchObject({ success: false });
  expect(await create().api.git.executeBranchCleanup({ ...request, selectedIds: [candidate(plan, merged[0]).id] })).toMatchObject({ success: false });
  expect([...demo.repo.branchHeads]).toEqual(before);
});

it('expires and consumes inspections and cancels an inspection before it returns', async () => {
  const demo = create();
  const plan = await inspect(demo);
  vi.useFakeTimers();
  vi.setSystemTime(plan.expiresAt + 1);
  expect(await execute(demo, plan, merged)).toMatchObject({ success: false, error: 'expired' });
  const fresh = await inspect(demo);
  expect(await execute(demo, fresh, merged)).toMatchObject({ success: true });
  expect(await execute(demo, fresh, merged)).toMatchObject({ success: false });
  const pending = demo.api.git.inspectBranchCleanup({ repoPath: DEMO_REPO, operationId: 'cancel-inspection' });
  expect(await demo.api.git.cancelBranchCleanup('cancel-inspection')).toBe(true);
  expect(await pending).toMatchObject({ success: false });
});

it('cancels before writing and stops a batch after its current deletion', async () => {
  const demo = create();
  const plan = await inspect(demo);
  const pending = execute(demo, plan, merged, [], 'cancel-before-write');
  expect(await demo.api.git.cancelBranchCleanup('cancel-before-write')).toBe(true);
  expect(await pending).toMatchObject({ success: true, data: { cancelled: true } });
  expect(demo.repo.branches).toEqual(expect.arrayContaining(merged));
  const fresh = await inspect(demo);
  const original = demo.repo.command.bind(demo.repo);
  vi.spyOn(demo.repo, 'command').mockImplementation((command, ...args) => {
    const result = original(command, ...args);
    if (command === 'branch' && args.includes('-D')) void demo.api.git.cancelBranchCleanup('cancel-during-write');
    return result;
  });
  expect(await execute(demo, fresh, merged, [], 'cancel-during-write')).toMatchObject({
    success: true,
    data: { cancelled: true, outcomes: [{ status: 'deleted' }, { status: 'skipped' }] },
  });
  expect(demo.repo.branches).not.toContain(merged[0]);
  expect(demo.repo.branches).toContain(merged[1]);
});
