import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { mergeRecipe } from '@/shared/tutorial/mergeLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { resolveDemoCommit } from './demoHistory';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { DEMO_REPO } from './demoRepository';
import { writeDemoFile } from './demoFiles';
function create() {
  const prepare = mergeRecipe({ diverged: true });
  prepare.branches = { ...prepare.branches!, remotes: [{ name: 'origin/main', commit: 2 }] };
  const demo = createDemoApi(
    { request: { chapterId: 'merge-diverged' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'merge-diverged')!.steps[0], prepare },
  );
  expect(demo.repo.command('merge', 'feature/begruessung').success).toBe(true);
  expect(demo.repo.commits[0].hash).toBe(hash(6));
  return demo;
}
it.each([1, 2])('reverts a merge against parent %s with a new single-parent commit', async (mainline) => {
  const { api, repo } = create(),
    source = structuredClone(repo.commits[0]),
    parent = mainline === 1 ? hash(4) : hash(5);
  const target = structuredClone(resolveDemoCommit(repo, parent)!.files!);
  writeDemoFile(repo, 'package.json', 'An independent package draft\n');
  writeDemoFile(repo, 'notes [ä].txt', 'An independent note\n');
  expect(await api.git.runGitCommandForRepo(DEMO_REPO, 'revert', '-m', String(mainline), '--no-edit', hash(6))).toMatchObject({ success: true });
  expect(repo.commits[0]).toMatchObject({
    hash: hash(7),
    parent: hash(6),
    files: target,
    subject: 'Revert "' + source.subject + '"',
    body: 'This reverts commit ' + hash(6) + ', reversing\nchanges made to ' + parent + '.',
    author: 'Alex Beispiel',
  });
  expect(repo.branchHeads.get('main')).toBe(hash(7));
  expect(repo.branchHeads.get('feature/begruessung')).toBe(hash(5));
  expect(repo.remoteHeads.get('origin/main')).toBe(hash(2));
  expect(repo.tagRefs.get('v1.0.0')?.target).toBe(hash(2));
  expect(resolveDemoCommit(repo, hash(6))).toEqual(source);
  expect(repo.files['package.json']).toBe('An independent package draft\n');
  expect(repo.files['notes [ä].txt']).toBe('An independent note\n');
  expect([...repo.staged]).toEqual([]);
  expect([...repo.modified]).toEqual(['package.json']);
  expect(repo.mergeState).toBeNull();
});
it('refuses missing, invalid, duplicate or out-of-range mainline choices atomically', () => {
  const { repo } = create(),
    before = demoRepositoryFingerprint(repo);
  const invalid = [
    ['--no-edit', hash(6)],
    ['-m'],
    ['-m', '0', hash(6)],
    ['-m', '-1', hash(6)],
    ['--mainline', 'first', hash(6)],
    ['-m', '3', hash(6)],
    ['-m', '1', '-m', '2', hash(6)],
    ['-m', '1', 'f'.repeat(40)],
  ];
  for (const args of invalid) {
    expect(repo.command('revert', ...args).success).toBe(false);
    expect(demoRepositoryFingerprint(repo)).toBe(before);
  }
  expect(repo.command('cherry-pick', hash(6)).success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});
it('guards overlapping drafts before applying a merge inverse', () => {
  const { repo } = create();
  writeDemoFile(repo, 'LICENSE', 'A later license draft\n');
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('revert', '-m', '1', '--no-edit', hash(6)).success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});
