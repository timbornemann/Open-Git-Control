import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { resolveDemoCommit } from './demoHistory';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { writeDemoFile } from './demoFiles';

function create() {
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
}
type Repository = ReturnType<typeof create>['repo'];
function rejected(repo: Repository, operation: 'cherry-pick' | 'revert', ...args: string[]) {
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command(operation, ...args).success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
}
it('copies a single commit onto HEAD, preserving its message and author but not its original parent', async () => {
  const { api, repo } = create();
  repo.command('reset', '--hard', hash(1));
  repo.branchHeads.set('feature/begruessung', hash(2));
  const source = structuredClone(resolveDemoCommit(repo, hash(2))!);
  expect(await api.git.runGitCommandForRepo(DEMO_REPO, 'cherry-pick', hash(2))).toMatchObject({ success: true });
  expect(repo.commits[0]).toMatchObject({ ...source, hash: hash(5), parent: hash(1) });
  expect(repo.branchHeads.get('main')).toBe(hash(5));
  expect(repo.branchHeads.get('feature/begruessung')).toBe(hash(2));
  expect(repo.remoteHeads.get('origin/main')).toBe(hash(2));
  expect(repo.tagRefs.get('v1.0.0')?.target).toBe(hash(2));
  expect(resolveDemoCommit(repo, hash(2))).toEqual(source);
  expect(repo.files).toEqual(source.files);
  expect(repo.status()).toBe('');
  expect(repo.reflog[0].subject).toBe('cherry-pick: ' + source.subject);
});
it('reverts the selected patch with a new descendant and keeps the original history', () => {
  const { repo } = create(),
    source = structuredClone(repo.commits[0]);
  const parent = structuredClone(resolveDemoCommit(repo, hash(3))!);
  expect(repo.command('revert', '--no-edit', hash(4)).success).toBe(true);
  expect(repo.commits[0]).toMatchObject({
    hash: hash(5),
    parent: hash(4),
    subject: 'Revert "' + source.subject + '"',
    body: 'This reverts commit ' + hash(4) + '.',
    author: 'Alex Beispiel',
    files: parent.files,
  });
  expect(resolveDemoCommit(repo, hash(4))).toEqual(source);
  expect(repo.branchHeads.get('main')).toBe(hash(5));
  expect(repo.files).toEqual(parent.files);
  expect(repo.status()).toBe('');
  expect(repo.reflog[0].subject).toBe('revert: Revert "' + source.subject + '"');
});
it('replays only the source patch relative to its own parent', () => {
  const { repo } = create(),
    root = structuredClone(resolveDemoCommit(repo, hash(1))!.files!);
  resolveDemoCommit(repo, hash(3))!.files = { ...root, 'parent-only.txt': 'Keep on the source branch\n' };
  resolveDemoCommit(repo, hash(4))!.files = { ...root, 'parent-only.txt': 'Keep on the source branch\n', 'picked.txt': 'Copy this patch\n' };
  repo.command('reset', '--hard', hash(1));
  expect(repo.command('cherry-pick', hash(4)).success).toBe(true);
  expect(repo.headFiles).toEqual({ ...root, 'picked.txt': 'Copy this patch\n' });
  expect(repo.headFiles['parent-only.txt']).toBeUndefined();
});
it('preserves independent working drafts and untracked files outside the replayed patch', () => {
  const { repo } = create();
  writeDemoFile(repo, 'LICENSE', 'A local license draft\n');
  writeDemoFile(repo, 'notes [ä].txt', 'An independent note\n');
  expect(repo.command('revert', '--no-edit', hash(4)).success).toBe(true);
  expect(repo.files.LICENSE).toBe('A local license draft\n');
  expect(repo.files['notes [ä].txt']).toBe('An independent note\n');
  expect([...repo.modified]).toEqual(['LICENSE']);
  expect([...repo.untracked]).toEqual(['notes [ä].txt']);
  expect(repo.staged.size).toBe(0);
});
it.each(['cherry-pick', 'revert'] as const)('refuses staged changes before %s without changing any state', (operation) => {
  const { repo } = create();
  writeDemoFile(repo, 'LICENSE', 'A staged license draft\n');
  repo.stage(['LICENSE']);
  rejected(repo, operation, hash(3));
});
it('refuses an overlapping draft and an untracked obstruction without losing them', () => {
  const { repo } = create();
  writeDemoFile(repo, 'README.md', 'An unsaved draft\n');
  rejected(repo, 'revert', '--no-edit', hash(4));
  repo.command('reset', '--hard', hash(1));
  writeDemoFile(repo, 'src/app.ts', 'An untracked obstruction\n');
  rejected(repo, 'cherry-pick', hash(2));
});
it('rejects an unsupported conflicting revert before publishing files or allocating an object ID', () => {
  const { repo } = create();
  resolveDemoCommit(repo, hash(3))!.files!['README.md'] = 'base\n';
  resolveDemoCommit(repo, hash(2))!.files!['README.md'] = 'ours\n';
  resolveDemoCommit(repo, hash(4))!.files!['README.md'] = 'theirs\n';
  repo.command('reset', '--hard', hash(2));
  rejected(repo, 'revert', '--no-edit', hash(4));
  expect(repo.command('cherry-pick', hash(3)).success).toBe(true);
  expect(repo.commits[0].hash).toBe(hash(5));
});
it('rejects unknown, empty, merge, missing-parent and unsupported requests atomically', () => {
  const { repo } = create();
  rejected(repo, 'cherry-pick', hash(4));
  rejected(repo, 'revert', 'f'.repeat(40));
  rejected(repo, 'cherry-pick', '--no-commit', hash(2));
  rejected(repo, 'cherry-pick', '--no-edit', hash(2));
  rejected(repo, 'revert', '--mainline', '2', hash(4));
  rejected(repo, 'revert', hash(2), hash(3));
  resolveDemoCommit(repo, hash(3))!.parent = hash(1) + ' ' + hash(2);
  rejected(repo, 'cherry-pick', hash(3));
  resolveDemoCommit(repo, hash(3))!.parent = 'f'.repeat(40);
  rejected(repo, 'revert', hash(3));
});
it('does not replay through a pending merge', () => {
  const { repo } = create();
  repo.conflicted = true;
  rejected(repo, 'revert', hash(4));
});
it('keeps replayed objects and reflogs scoped to their project and resets on a new lesson', () => {
  const { repo } = create();
  expect(repo.command('revert', '--no-edit', hash(4)).success).toBe(true);
  const first = structuredClone(repo.reflog);
  repo.selectProject(DEMO_SECOND_REPO);
  expect(resolveDemoCommit(repo, hash(5))).toBeUndefined();
  repo.selectProject(DEMO_REPO);
  expect(repo.commits[0].hash).toBe(hash(5));
  expect(repo.reflog).toEqual(first);
  repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0]);
  expect(resolveDemoCommit(repo, hash(5))).toBeUndefined();
});
