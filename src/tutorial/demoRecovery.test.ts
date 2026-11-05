import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { writeDemoFile, refreshDemoFiles } from './demoFiles';
import { parseGitReflog } from '@/utils/gitParsing';
import { resolveDemoCommit } from './demoHistory';
const create = () => {
  const prepare = branchRecipe();
  prepare.branches = {
    heads: [
      { name: 'main', commit: 4 },
      { name: 'feature/begruessung', commit: 1 },
    ],
    remotes: [{ name: 'origin/main', commit: 2 }],
    current: 'main',
  };
  return createDemoApi(
    { request: { chapterId: 'history' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], prepare },
  );
};
const entries = (repo: ReturnType<typeof create>['repo']) => {
  const result = repo.command('reflog', '300');
  if (!result.success) throw new Error(result.error);
  return parseGitReflog(result.data);
};
it('records only existing saved objects in a fresh language-correct practice history', () => {
  const { repo } = create();
  const points = entries(repo);
  expect(points.map((entry) => entry.hash)).toEqual([4, 3, 2, 1].map(hash));
  expect(points[0].subject).toBe('commit: feat: update greeting');
  expect(points.every((entry) => resolveDemoCommit(repo, entry.hash))).toBe(true);
});

it('accepts the bare full-hash checkout used by Recovery Center without moving saved branches', async () => {
  const { api, repo } = create();
  repo.command('reset', '--hard', hash(2));
  const branches = structuredClone(repo.branchHeads);
  expect(await api.git.runGitCommandForRepo(DEMO_REPO, 'checkout', hash(4))).toMatchObject({ success: true });
  expect(repo.branch).toBe('');
  expect(repo.commits[0].hash).toBe(hash(4));
  expect(repo.branchHeads).toEqual(branches);
  expect(repo.files).toEqual(resolveDemoCommit(repo, hash(4))!.files);
  expect(repo.status()).toBe('');
  expect(entries(repo)).toHaveLength(6);
  const before = demoRepositoryFingerprint(repo),
    history = entries(repo);
  expect(await api.git.runGitCommandForRepo(DEMO_REPO, 'checkout', 'f'.repeat(40))).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect(entries(repo)).toEqual(history);
});
it('records a hard reset and restores the actual abandoned commit on a separate branch', () => {
  const { repo } = create(),
    oldTree = structuredClone(repo.headFiles);
  expect(repo.command('reset', '--hard', hash(2)).success).toBe(true);
  expect(repo.branchHeads.get('main')).toBe(hash(2));
  expect(repo.commits[0].hash).toBe(hash(2));
  expect(repo.headFiles).toEqual(resolveDemoCommit(repo, hash(2))!.files);
  expect(repo.files).toEqual(repo.headFiles);
  expect(repo.indexFiles).toEqual(repo.headFiles);
  expect(repo.status()).toBe('');
  expect(entries(repo).map((entry) => entry.hash)).toEqual([2, 4, 3, 2, 1].map(hash));
  expect(entries(repo)[0].subject).toBe('reset: moving to ' + hash(2));
  expect(resolveDemoCommit(repo, 'HEAD@{1}')?.hash).toBe(hash(4));
  expect(repo.command('checkout', '-b', 'recovery/greeting', hash(4)).success).toBe(true);
  expect(repo.branch).toBe('recovery/greeting');
  expect(repo.files).toEqual(oldTree);
  expect(repo.branchHeads.get('main')).toBe(hash(2));
  expect(repo.branchHeads.get('recovery/greeting')).toBe(hash(4));
  expect(entries(repo)[0].subject).toContain('checkout: moving from main to recovery/greeting');
});
it.each(['--soft', '--mixed', '--hard'] as const)('keeps the independent HEAD/index/worktree meaning of %s', (mode) => {
  const { repo } = create();
  writeDemoFile(repo, 'README.md', 'A staged correction\n');
  repo.stage(['README.md']);
  writeDemoFile(repo, 'README.md', 'A later working draft\n');
  writeDemoFile(repo, 'untracked-note.txt', 'Keep this independent note\n');
  writeDemoFile(repo, 'staged-new.txt', 'A staged new file\n');
  repo.stage(['staged-new.txt']);
  delete repo.files.LICENSE;
  refreshDemoFiles(repo);
  repo.stage(['LICENSE']);
  const index = structuredClone(repo.indexFiles),
    work = structuredClone(repo.files),
    target = structuredClone(resolveDemoCommit(repo, hash(2))!.files!);
  expect(repo.command('reset', mode, hash(2)).success).toBe(true);
  expect(repo.headFiles).toEqual(target);
  expect(repo.branchHeads.get('main')).toBe(hash(2));
  expect(repo.indexFiles).toEqual(mode === '--soft' ? index : target);
  if (mode !== '--hard') expect(repo.files).toEqual(work);
  else {
    expect(repo.files).toEqual({ ...target, 'untracked-note.txt': 'Keep this independent note\n' });
    expect(repo.files['staged-new.txt']).toBeUndefined();
  }
  expect(repo.remoteHeads.get('origin/main')).toBe(hash(2));
  expect(repo.tagRefs.get('v1.0.0')?.target).toBe(hash(2));
});
it('does not move HEAD or add recovery points when resetting only selected paths', () => {
  const { repo } = create();
  writeDemoFile(repo, 'README.md', 'A staged correction\n');
  repo.stage(['README.md']);
  const before = entries(repo);
  expect(repo.command('reset', 'HEAD', '--', 'README.md').success).toBe(true);
  expect(repo.staged.size).toBe(0);
  expect(repo.modified.has('README.md')).toBe(true);
  expect(repo.commits[0].hash).toBe(hash(4));
  expect(entries(repo)).toEqual(before);
});
it('records commits and amendments while keeping the previous saved object available', () => {
  const { repo } = create();
  writeDemoFile(repo, 'README.md', 'A saved update\n');
  repo.stage(['README.md']);
  repo.commit('docs: a saved update');
  expect(entries(repo)[0]).toMatchObject({ hash: hash(5), subject: 'commit: docs: a saved update' });
  repo.commit('docs: corrected title', { amend: true });
  expect(entries(repo)[0]).toMatchObject({ hash: hash(6), subject: 'commit (amend): docs: corrected title' });
  expect(resolveDemoCommit(repo, 'HEAD@{1}')?.hash).toBe(hash(5));
});
it('keeps recovery history with its project and resets it on a fresh entry', () => {
  const { repo } = create();
  repo.command('reset', '--hard', hash(2));
  const before = entries(repo);
  repo.selectProject(DEMO_SECOND_REPO);
  expect(entries(repo).some((entry) => entry.hash === hash(4))).toBe(false);
  repo.selectProject(DEMO_REPO);
  expect(entries(repo)).toEqual(before);
  repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], 'en');
  expect(entries(repo)[0].hash).toBe(hash(4));
  expect(entries(repo).some((entry) => entry.subject.startsWith('reset:'))).toBe(false);
});
it.each([
  ['--hard', 'unknown'],
  ['--soft', '--hard', hash(2)],
  ['--keep', hash(2)],
  ['--hard', '--', 'README.md'],
])('refuses unsupported reset %j atomically', (...args) => {
  const { repo } = create(),
    before = demoRepositoryFingerprint(repo),
    history = entries(repo);
  expect(repo.command('reset', ...args).success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect(entries(repo)).toEqual(history);
});
