import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { writeDemoFile } from './demoFiles';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { reachableDemoCommits } from './demoBranchRefs';
const create = (at = 4) => {
  const prepare = branchRecipe();
  prepare.branches = {
    heads: [
      { name: 'main', commit: at },
      { name: 'feature/begruessung', commit: 1 },
    ],
    current: 'main',
    remotes: [{ name: 'origin/main', commit: 1 }],
  };
  return createDemoApi(
    { request: { chapterId: 'history' }, language: 'en', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], prepare },
  );
};

it('amends only the message while preserving the original author, author date and tree', () => {
  const { repo } = create(2),
    previous = structuredClone(repo.commits[0]);
  expect(repo.commit('feat: correct the saved summary', { description: 'A corrected description.', amend: true }).success).toBe(true);
  expect(repo.commits[0]).toMatchObject({
    hash: hash(5),
    parent: previous.parent,
    files: previous.files,
    author: previous.author,
    email: previous.email,
    date: previous.date,
    body: 'A corrected description.',
  });
  expect(repo.branchHeads.get('main')).toBe(hash(5));
  expect(repo.tagRefs.get('v1.0.0')?.target).toBe(hash(2));
  expect(repo.commits.find((commit) => commit.hash === hash(2))).toEqual(previous);
  expect(repo.status()).toBe('');
});

it('adds only the index correction to the replacement while retaining later working drafts', () => {
  const { repo } = create();
  const previous = structuredClone(repo.commits[0]);
  writeDemoFile(repo, 'README.md', 'The staged correction\n');
  repo.stage(['README.md']);
  writeDemoFile(repo, 'README.md', 'A later unstaged README draft\n');
  writeDemoFile(repo, 'LICENSE', 'Keep this unrelated working draft\n');
  expect(repo.commit('fix: correct the greeting', { description: previous.body, amend: true }).success).toBe(true);
  expect(repo.commits[0]).toMatchObject({ hash: hash(5), parent: hash(3), date: previous.date });
  expect(repo.commits[0].files?.['README.md']).toBe('The staged correction\n');
  expect(repo.commits[0].files?.LICENSE).toEqual(previous.files?.LICENSE);
  expect(repo.files['README.md']).toBe('A later unstaged README draft\n');
  expect(repo.files.LICENSE).toBe('Keep this unrelated working draft\n');
  expect([...repo.staged]).toEqual([]);
  expect([...repo.modified].sort()).toEqual(['LICENSE', 'README.md']);
  expect(reachableDemoCommits(repo).map((commit) => commit.hash)).not.toContain(hash(4));
  expect(repo.commits.find((commit) => commit.hash === hash(4))).toEqual(previous);
});

it('preserves a root commit’s author and empty parent list when replacing it', () => {
  const { repo } = create(1),
    previous = structuredClone(repo.commits[0]);
  expect(repo.commit('chore: correct the root summary', { amend: true }).success).toBe(true);
  expect(repo.commits[0]).toMatchObject({ parent: '', author: previous.author, email: previous.email, date: previous.date, files: previous.files });
});

it('does not invent a parent or a commit when there is no HEAD to amend', () => {
  const { repo } = create();
  repo.commits = [];
  const before = demoRepositoryFingerprint(repo);
  expect(repo.commit('fix: absent HEAD', { amend: true }).success).toBe(false);
  expect(demoRepositoryFingerprint(repo)).toBe(before);
});
