import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { rebaseRecipe } from '@/shared/tutorial/rebaseLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { resolveDemoCommit } from './demoHistory';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { writeDemoFile } from './demoFiles';
import { historyText } from './demoHistoryExamples';
const create = () => {
  const step = { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'rebase-review')!.steps[0], prepare: rebaseRecipe('review') };
  return {
    ...createDemoApi(
      { request: { chapterId: 'rebase-review' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
      step,
    ),
    step,
  };
};
async function start(conflict = false) {
  const f = create();
  const result = await f.api.git.startInteractiveRebase(hash(2), [(conflict ? 'drop' : 'edit') + ' ' + hash(3), 'pick ' + hash(4)], DEMO_REPO);
  expect(result.success).toBe(!conflict);
  expect(f.repo.rebaseState).toMatchObject({ originalBranch: 'main', originalHead: hash(4), phase: conflict ? 'conflict' : 'edit' });
  return f;
}
const resolve = (repo: ReturnType<typeof create>['repo']) => {
  expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
  expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
};
it('pauses edit with detached HEAD and leaves the original branch and refs untouched', async () => {
  const { repo, api } = await start();
  expect(repo.branch).toBe('');
  expect(repo.commits[0].hash).toBe(hash(3));
  expect(repo.branchHeads.get('main')).toBe(hash(4));
  expect(repo.headFiles).toEqual(resolveDemoCommit(repo, hash(3))!.files);
  expect(repo.indexFiles).toEqual(repo.headFiles);
  expect(repo.files).toEqual(repo.headFiles);
  expect(repo.status()).toBe('');
  expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: 'rebase' } });
  expect(repo.events.has('rebased')).toBe(false);
});
it('continues an unchanged edit without inventing commits', async () => {
  const { repo, api } = await start();
  expect(repo.command('rebaseContinue').success).toBe(true);
  expect(repo.branch).toBe('main');
  expect(repo.commits[0].hash).toBe(hash(4));
  expect(repo.commits).toHaveLength(4);
  expect(repo.rebaseState).toBeNull();
  expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: null } });
  expect(repo.events.has('rebased')).toBe(true);
});
it('automatically amends staged edit contents with the existing message before continuing', async () => {
  const { repo } = await start(),
    source = structuredClone(resolveDemoCommit(repo, hash(3))!);
  writeDemoFile(repo, 'LICENSE', 'A staged correction\n');
  writeDemoFile(repo, 'new-file.txt', 'A staged new file\n');
  expect(repo.stage(['LICENSE', 'new-file.txt']).success).toBe(true);
  expect(repo.command('rebaseContinue').success).toBe(true);
  expect(resolveDemoCommit(repo, hash(5))).toMatchObject({
    ...source,
    hash: hash(5),
    files: { ...source.files, LICENSE: 'A staged correction\n', 'new-file.txt': 'A staged new file\n' },
  });
  expect(repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(5) });
  expect(repo.branchHeads.get('main')).toBe(hash(6));
  expect(repo.files.LICENSE).toBe('A staged correction\n');
  expect(repo.files['new-file.txt']).toBe('A staged new file\n');
  expect(repo.status()).toBe('');
});
it('allows an explicit amend during edit and then resumes with its corrected message and tree', async () => {
  const { repo } = await start();
  writeDemoFile(repo, 'LICENSE', 'A deliberate edit\n');
  repo.stage(['LICENSE']);
  expect(repo.commit('docs: deliberate correction', { description: 'A retained edited description.', amend: true }).success).toBe(true);
  expect(repo.branch).toBe('');
  expect(repo.branchHeads.get('main')).toBe(hash(4));
  expect(repo.command('rebaseContinue').success).toBe(true);
  expect(resolveDemoCommit(repo, hash(5))).toMatchObject({ subject: 'docs: deliberate correction', body: 'A retained edited description.', parent: hash(2) });
  expect(repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(5) });
  expect(repo.files.LICENSE).toBe('A deliberate edit\n');
});
it('rejects unstaged edit drafts and mismatched sequencer commands without changing the pause', async () => {
  const { repo } = await start();
  writeDemoFile(repo, 'LICENSE', 'An unstaged draft\n');
  const before = demoRepositoryFingerprint(repo);
  for (const command of ['rebaseContinue', 'mergeContinue', 'mergeAbort', 'cherryPickContinue', 'cherryPickAbort'] as const)
    expect(repo.command(command).success).toBe(false);
  expect(repo.command('rebaseAbort', '--force').success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});
it('stops a dependent replay at real three-way sides, then commits only the resolved patch', async () => {
  const { repo, api } = await start(true),
    source = structuredClone(resolveDemoCommit(repo, hash(4))!);
  expect(repo.branch).toBe('');
  expect(repo.commits[0].hash).toBe(hash(2));
  expect(repo.branchHeads.get('main')).toBe(hash(4));
  expect(repo.mergeState).toMatchObject({ operation: 'rebase', targetHash: hash(2), targetBranch: '', sourceHash: hash(4) });
  expect(repo.mergeState!.conflicts.get('README.md')).toMatchObject({
    base: historyText('description', 'en'),
    ours: historyText('app', 'en'),
    theirs: historyText('latest', 'en'),
  });
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('rebaseContinue').success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  resolve(repo);
  expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: 'rebase' } });
  expect(repo.command('rebaseContinue').success).toBe(true);
  expect(repo.commits[0]).toMatchObject({ ...source, hash: hash(5), parent: hash(2) });
  expect(repo.branch).toBe('main');
  expect(repo.rebaseState).toBeNull();
  expect(repo.mergeState).toBeNull();
  expect(repo.status()).toBe('');
});
it.each([false, true])('aborts an edit/conflict=%s like a hard restoration while keeping an independent untracked file', async (conflict) => {
  const { repo } = await start(conflict),
    original = structuredClone(resolveDemoCommit(repo, hash(4))!);
  if (conflict) resolve(repo);
  writeDemoFile(repo, 'LICENSE', 'A later tracked draft\n');
  writeDemoFile(repo, 'notes [ä].txt', 'Independent note\n');
  expect(repo.command('rebaseAbort').success).toBe(true);
  expect(repo.branch).toBe('main');
  expect(repo.branchHeads.get('main')).toBe(hash(4));
  expect(repo.commits[0]).toEqual(original);
  expect(repo.files).toEqual({ ...original.files, 'notes [ä].txt': 'Independent note\n' });
  expect(repo.indexFiles).toEqual(original.files);
  expect(repo.headFiles).toEqual(original.files);
  expect(repo.rebaseState).toBeNull();
  expect(repo.mergeState).toBeNull();
  expect(repo.modified.size + repo.staged.size).toBe(0);
  expect(repo.events.has('rebased')).toBe(false);
  expect(repo.reflog[0].subject).toBe('rebase (abort): returning to refs/heads/main');
});
it('keeps a paused operation with its project and clears it on a fresh lesson', async () => {
  const { repo, step } = await start(),
    pending = structuredClone(repo.rebaseState);
  repo.selectProject(DEMO_SECOND_REPO);
  expect(repo.rebaseState).toBeNull();
  expect(repo.command('rebaseContinue').success).toBe(false);
  repo.selectProject(DEMO_REPO);
  expect(repo.rebaseState).toEqual(pending);
  expect(repo.command('rebaseContinue').success).toBe(true);
  repo.reset(step, 'en');
  expect(repo.rebaseState).toBeNull();
  expect(repo.branch).toBe('main');
});
it('refuses publication if the original branch reference has changed during the pause', async () => {
  const { repo } = await start();
  repo.branchHeads.set('main', hash(2));
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('rebaseContinue').success).toBe(false);
  expect(repo.command('rebaseAbort').success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});
