import { afterEach, expect, it, vi } from 'vitest';
import { createDemoApi } from './demoApi';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchCarryRecipe, carryBranch } from '@/shared/tutorial/branchCarryHelpers';
import { writeDemoFile, refreshDemoFiles } from './demoFiles';
import { demoBlob } from './demoBlob';
import { historyText } from './demoHistoryExamples';
import { treeText } from './demoTreeExamples';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { demoAnalytics } from './demoAnalytics';
import type { IpcResult } from '@/types/ipc';
const original = () => TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'branches')!.steps[0];
function create(language: 'de' | 'en' = 'en', olderTarget = false, independent = false) {
  const prepare = branchCarryRecipe();
  if (olderTarget)
    prepare.branches = {
      ...prepare.branches!,
      heads: [
        { name: 'main', commit: 4 },
        { name: carryBranch, commit: 3 },
      ],
    };
  if (independent) {
    prepare.indexEdits = [{ path: 'LICENSE', content: ['Vorgemerkt\n', 'Staged\n'] }];
    prepare.edits = [
      { path: 'LICENSE', content: ['Weitere Bearbeitung\n', 'Further edit\n'] },
      { path: 'notes.txt', content: { example: 'tree-files', version: 'note' } },
    ];
  }
  return createDemoApi(
    { request: { chapterId: 'branches' }, language, theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...original(), prepare },
  );
}
type Demo = ReturnType<typeof create>;
function data<T>(result: IpcResult<T>): T {
  expect(result.success).toBe(true);
  if (!result.success) throw Error(result.error);
  return result.data;
}
const state = (demo: Demo) =>
  structuredClone({ files: demo.repo.files, index: demo.repo.indexFiles, head: demo.repo.headFiles, branch: demo.repo.branch, heads: demo.repo.branchHeads });
async function park(demo: Demo, name = 'Reviewed practice work') {
  const plan = data(await demo.api.git.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: carryBranch } }));
  const result = data(await demo.api.git.executeBranchChange({ repoPath: DEMO_REPO, planId: plan.planId, mode: 'park', name }));
  expect(result).toMatchObject({ switched: true, restored: false, conflicts: [], session: { phase: 'switched' } });
  return result.session!;
}
const inspectSaved = async (demo: Demo, sessionId: string) => data(await demo.api.git.inspectBranchChange({ repoPath: DEMO_REPO, sessionId }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each(['de', 'en'] as const)('parks actual index, working and new versions and returns owned session metadata (%s)', async (language) => {
  const demo = create(language);
  const session = await park(demo);
  expect(session).toMatchObject({ sourceBranch: 'main', sourceHead: hash(4), targetBranch: carryBranch, worktree: DEMO_REPO });
  expect(demo.repo.branch).toBe(carryBranch);
  expect(demo.repo.status()).toBe('');
  expect(await demo.api.git.readRepoFile('README.md', DEMO_REPO)).toEqual({ success: true, data: historyText('latest', language) });
  expect(demo.repo.files['notes.txt']).toBeUndefined();
  const stashes = data(await demo.api.git.getStashes(DEMO_REPO));
  expect(stashes).toHaveLength(1);
  expect(stashes[0]).toMatchObject({ hash: session.stashOid, branch: 'main', subject: expect.stringContaining('[OGC:' + session.id + ']') });
  const sessions = data(await demo.api.git.listParkedBranchChanges(DEMO_REPO));
  expect(sessions[0]).toMatchObject({ id: session.id, currentWorktree: true, currentBranch: carryBranch, currentHead: hash(4) });
  sessions[0].name = 'Caller mutation';
  stashes[0].hash = 'Caller mutation';
  expect(data(await demo.api.git.listParkedBranchChanges(DEMO_REPO))[0].name).toBe('Reviewed practice work');
  expect(data(await demo.api.git.getStashes(DEMO_REPO))[0].hash).toBe(session.stashOid);
});

it('reads saved version previews and a NUL file list without changing the backup or clean working state', async () => {
  const demo = create();
  const session = await park(demo);
  const before = state(demo);
  const inspection = await inspectSaved(demo, session.id);
  expect(inspection).toMatchObject({
    sourceBranch: carryBranch,
    sourceHead: hash(4),
    targetSha: hash(4),
    blocks: [],
    files: [
      { path: 'README.md', index: 'M', worktree: 'M' },
      { path: 'notes.txt', index: '?', worktree: '?' },
    ],
  });
  const parents = inspection.stashParents!;
  const staged = data(
    await demo.api.git.getDiffPreview(['diff', parents.base, parents.index, '--', 'README.md'], { maxBytes: 5000, maxLines: 100 }, DEMO_REPO),
  );
  expect(staged.text).toContain('+Greeting: Hello staging!');
  const working = data(
    await demo.api.git.getDiffPreview(['diff', parents.index, session.stashOid!, '--', 'README.md'], { maxBytes: 5000, maxLines: 100 }, DEMO_REPO),
  );
  expect(working.text).toContain('+Greeting: Hello team!');
  expect(
    await demo.api.git.getRepositoryFilePreview({ repoPath: DEMO_REPO, path: 'notes.txt', source: 'commit', commitHash: parents.untracked }),
  ).toMatchObject({ success: true, data: { kind: 'text', text: treeText('note', 'en') } });
  expect(demo.repo.command('stash', 'show', '-u', '--name-only', '-z', 'stash@{0}')).toEqual({ success: true, data: 'README.md\0notes.txt\0' });
  expect(state(demo)).toEqual(before);
  expect(data(await demo.api.git.getStashes(DEMO_REPO))).toHaveLength(1);
  const all = data(await demo.api.git.getCommitLogPage({ repoPath: DEMO_REPO, scope: 'all', limit: 100 }));
  const head = data(await demo.api.git.getCommitLogPage({ repoPath: DEMO_REPO, scope: 'head', limit: 100 }));
  expect(Object.keys(all.stats!)).toHaveLength(7);
  expect(Object.keys(head.stats!)).toHaveLength(4);
  expect(demoAnalytics(demo.repo).totals.commits).toBe(7);
});

it('restores the exact three saved versions once and removes only their backup', async () => {
  const demo = create();
  const before = state(demo);
  const session = await park(demo);
  expect(demo.repo.command('checkout', 'main').success).toBe(true);
  const plan = await inspectSaved(demo, session.id);
  const request = { repoPath: DEMO_REPO, planId: plan.planId };
  expect(await demo.api.git.restoreBranchChange(request)).toMatchObject({ success: true, data: { switched: false, restored: true, conflicts: [] } });
  expect(state(demo)).toEqual(before);
  expect(data(await demo.api.git.getStashes(DEMO_REPO))).toHaveLength(0);
  expect(data(await demo.api.git.listParkedBranchChanges(DEMO_REPO))).toHaveLength(0);
  expect(demoAnalytics(demo.repo).totals.commits).toBe(4);
  expect(await demo.api.git.restoreBranchChange(request)).toMatchObject({ success: false });
  expect(data(await demo.api.git.getCommitLogPage({ repoPath: DEMO_REPO, scope: 'all', limit: 100 })).stats).toHaveProperty(hash(4));
});

it.each(['before-inspection', 'after-inspection'])('preserves newer local edits and the backup when they change %s', async (when) => {
  const demo = create();
  const session = await park(demo);
  let plan;
  if (when === 'after-inspection') plan = await inspectSaved(demo, session.id);
  writeDemoFile(demo.repo, 'README.md', 'Keep this newer edit\n');
  if (!plan) {
    plan = await inspectSaved(demo, session.id);
    expect(plan.blocks).toContain('Commit or park the current changes before restoring.');
  }
  const before = state(demo);
  expect(await demo.api.git.restoreBranchChange({ repoPath: DEMO_REPO, planId: plan.planId })).toMatchObject({ success: false });
  expect(state(demo)).toEqual(before);
  expect(data(await demo.api.git.getStashes(DEMO_REPO))).toHaveLength(1);
});

it('carries independent saved edits onto a different clean target without replacing that target’s other contents', async () => {
  const demo = create('en', true, true);
  const session = await park(demo);
  const plan = await inspectSaved(demo, session.id);
  expect(await demo.api.git.restoreBranchChange({ repoPath: DEMO_REPO, planId: plan.planId })).toMatchObject({ success: true });
  expect(demo.repo.files['README.md']).toBe(historyText('description', 'en'));
  expect(demo.repo.indexFiles.LICENSE).toBe('Staged\n');
  expect(demo.repo.files.LICENSE).toBe('Further edit\n');
  expect(demo.repo.files['notes.txt']).toBe(treeText('note', 'en'));
});

it('refuses an unsupported overlapping target atomically and retains the saved versions', async () => {
  const demo = create('en', true);
  const session = await park(demo);
  const plan = await inspectSaved(demo, session.id);
  const before = state(demo);
  expect(await demo.api.git.restoreBranchChange({ repoPath: DEMO_REPO, planId: plan.planId })).toMatchObject({ success: false });
  expect(state(demo)).toEqual(before);
  expect(data(await demo.api.git.getStashes(DEMO_REPO))).toHaveLength(1);
});

it('keeps encoded bytes, binary contents and working deletions intact through parking and restoration', async () => {
  const demo = create();
  writeDemoFile(demo.repo, 'encoded.txt', demoBlob('Grüße\r\n', 'utf16be'));
  writeDemoFile(demo.repo, 'binary.dat', 'a\0b');
  delete demo.repo.files['package.json'];
  refreshDemoFiles(demo.repo);
  const before = state(demo);
  const session = await park(demo);
  demo.repo.command('checkout', 'main');
  const plan = await inspectSaved(demo, session.id);
  expect(plan.files.find((file) => file.path === 'binary.dat')?.binary).toBe(true);
  expect(await demo.api.git.restoreBranchChange({ repoPath: DEMO_REPO, planId: plan.planId })).toMatchObject({ success: true });
  expect(state(demo)).toEqual(before);
});

it('cancels before parking and serializes two rapid execution requests', async () => {
  const demo = create();
  const plan = data(await demo.api.git.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: carryBranch } }));
  const before = state(demo);
  const request = { repoPath: DEMO_REPO, planId: plan.planId, mode: 'park' as const, name: 'Reviewed work' };
  const pending = demo.api.git.executeBranchChange(request);
  expect(await demo.api.git.cancelBranchChange(DEMO_REPO)).toBe(true);
  expect(await pending).toMatchObject({ success: false });
  expect(state(demo)).toEqual(before);
  const next = data(await demo.api.git.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: carryBranch } }));
  const first = demo.api.git.executeBranchChange({ ...request, planId: next.planId });
  const second = demo.api.git.executeBranchChange({ ...request, planId: next.planId });
  expect(await second).toMatchObject({ success: false });
  expect(await first).toMatchObject({ success: true });
  expect(data(await demo.api.git.getStashes(DEMO_REPO))).toHaveLength(1);
});

it('binds saved work and restore plans to the active project and rejects stale reset or expiry', async () => {
  const demo = create();
  const session = await park(demo);
  const plan = await inspectSaved(demo, session.id);
  demo.repo.selectProject(DEMO_SECOND_REPO);
  expect(await demo.api.git.listParkedBranchChanges(DEMO_REPO)).toMatchObject({ success: false });
  expect(data(await demo.api.git.listParkedBranchChanges(DEMO_SECOND_REPO))).toHaveLength(0);
  demo.repo.selectProject(DEMO_REPO);
  expect(await demo.api.git.restoreBranchChange({ repoPath: DEMO_REPO, planId: plan.planId })).toMatchObject({ success: false });
  const fresh = await inspectSaved(demo, session.id);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 16 * 60_000);
  expect(await demo.api.git.restoreBranchChange({ repoPath: DEMO_REPO, planId: fresh.planId })).toMatchObject({ success: false });
  demo.repo.reset(original(), 'en');
  expect(data(await demo.api.git.listParkedBranchChanges(DEMO_REPO))).toHaveLength(0);
});

it('rejects foreign or dropped backups and never treats a checkout plan as a restoration', async () => {
  const demo = create();
  const session = await park(demo);
  expect(await create().api.git.inspectBranchChange({ repoPath: DEMO_REPO, sessionId: session.id })).toMatchObject({ success: false });
  const checkout = data(await demo.api.git.inspectBranchChange({ repoPath: DEMO_REPO, target: { kind: 'existing', branch: 'main' } }));
  expect(await demo.api.git.restoreBranchChange({ repoPath: DEMO_REPO, planId: checkout.planId })).toMatchObject({ success: false });
  const saved = await inspectSaved(demo, session.id);
  expect(demo.repo.command('stash', 'drop', 'stash@{0}').success).toBe(true);
  expect(await demo.api.git.restoreBranchChange({ repoPath: DEMO_REPO, planId: saved.planId })).toMatchObject({ success: false });
  expect(data(await demo.api.git.listParkedBranchChanges(DEMO_REPO))).toHaveLength(0);
});
it('restores a selected tracked or untracked file from its actual saved commit without consuming the backup', async () => {
  const demo = create();
  await park(demo);
  expect(demo.repo.command('checkout', 'stash@{0}', '--', 'README.md').success).toBe(true);
  expect(demo.repo.files['README.md']).toBe(historyText('work', 'en'));
  expect(demo.repo.indexFiles['README.md']).toBe(historyText('work', 'en'));
  expect(demo.repo.command('checkout', 'stash@{0}^3', '--', 'notes.txt').success).toBe(true);
  expect(demo.repo.files['notes.txt']).toBe(treeText('note', 'en'));
  expect(demo.repo.staged.has('notes.txt')).toBe(true);
  expect(demo.repo.untracked.has('notes.txt')).toBe(false);
  const before = state(demo);
  expect(demo.repo.command('checkout', 'missing-backup', '--', 'README.md').success).toBe(false);
  expect(state(demo)).toEqual(before);
  expect(data(await demo.api.git.getStashes(DEMO_REPO))).toHaveLength(1);
});
