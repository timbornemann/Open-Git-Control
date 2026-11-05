import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { resolveDemoCommit } from './demoHistory';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { writeDemoFile } from './demoFiles';

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
const todo = (first = 'pick', last = 'pick') => [first + ' ' + hash(3) + ' docs: clearer project', last + ' ' + hash(4) + ' feat: greeting'];
const rebase = (fixture: ReturnType<typeof create>, lines = todo()) => fixture.api.git.startInteractiveRebase(hash(2), lines, DEMO_REPO);

it('keeps all-pick objects and independent notes, but records the completed exercise', async () => {
  const f = create(),
    original = structuredClone(f.repo.commits);
  writeDemoFile(f.repo, 'notes [ä].txt', 'An independent note\n');
  expect(await rebase(f)).toMatchObject({ success: true });
  expect(f.repo.commits).toEqual(original);
  expect(f.repo.branchHeads.get('main')).toBe(hash(4));
  expect(f.repo.files['notes [ä].txt']).toBe('An independent note\n');
  expect(f.repo.untracked).toEqual(new Set(['notes [ä].txt']));
  expect(f.repo.events.has('rebased')).toBe(true);
  expect([...f.unsupported]).toEqual([]);
});

it('replaces only a reword subject and replays the following patch without losing bodies or authors', async () => {
  const f = create(),
    original = structuredClone(f.repo.commits);
  expect(await rebase(f, todo('reword'))).toMatchObject({ success: true });
  expect(resolveDemoCommit(f.repo, hash(5))).toEqual({ ...original.find((c) => c.hash === hash(3)), hash: hash(5), subject: 'docs: clearer project' });
  expect(f.repo.commits[0]).toEqual({ ...original[0], hash: hash(6), parent: hash(5) });
  for (const entry of original) expect(resolveDemoCommit(f.repo, entry.hash)).toEqual(entry);
  expect(f.repo.headFiles).toEqual(original[0].files);
  expect(f.repo.indexFiles).toEqual(original[0].files);
  expect(f.repo.files).toEqual(original[0].files);
  expect(f.repo.remoteHeads.get('origin/main')).toBe(hash(2));
  expect(f.repo.tagRefs.get('v1.0.0')?.target).toBe(hash(2));
  expect(f.repo.branchHeads.get('feature/begruessung')).toBe(hash(1));
  expect(f.repo.status()).toBe('');
});

it('preserves internal whitespace in a reword subject independently of todo indentation', async () => {
  const f = create();
  const title = 'docs: clarify  the project';
  expect(await rebase(f, ['  reword ' + hash(3) + ' ' + title + '  ', 'pick ' + hash(4)])).toMatchObject({ success: true });
  expect(resolveDemoCommit(f.repo, hash(5))?.subject).toBe(title);
});

it.each(['squash', 'fixup'])('combines two patches with %s while retaining the first author and one parent', async (action) => {
  const f = create(),
    first = structuredClone(resolveDemoCommit(f.repo, hash(3))!),
    last = structuredClone(f.repo.commits[0]);
  expect(await rebase(f, todo('pick', action))).toMatchObject({ success: true });
  expect(f.repo.commits[0]).toMatchObject({
    hash: hash(5),
    parent: hash(2),
    subject: first.subject,
    author: first.author,
    email: first.email,
    date: first.date,
    files: last.files,
  });
  expect(f.repo.commits[0].body).toBe(action === 'fixup' ? first.body : first.body + '\n\n' + last.subject + '\n\n' + last.body);
  expect(f.repo.commits).toHaveLength(5);
  expect(resolveDemoCommit(f.repo, hash(3))).toEqual(first);
  expect(resolveDemoCommit(f.repo, hash(4))).toEqual(last);
  expect(f.repo.status()).toBe('');
});

it('drops the newest patch and updates the index/worktree while preserving an untracked note', async () => {
  const f = create(),
    expected = structuredClone(resolveDemoCommit(f.repo, hash(3))!);
  writeDemoFile(f.repo, 'notes.txt', 'Keep my independent note\n');
  expect(await rebase(f, todo('pick', 'drop'))).toMatchObject({ success: true });
  expect(f.repo.commits[0]).toEqual(expected);
  expect(f.repo.branchHeads.get('main')).toBe(hash(3));
  expect(f.repo.headFiles).toEqual(expected.files);
  expect(f.repo.indexFiles).toEqual(expected.files);
  expect(f.repo.files).toEqual({ ...expected.files, 'notes.txt': 'Keep my independent note\n' });
  expect(f.repo.staged.size + f.repo.modified.size).toBe(0);
  expect(resolveDemoCommit(f.repo, hash(4))).toBeDefined();
});

it.each(
  [
    ['exec calc.exe'],
    ['pick ' + hash(1)],
    ['pick ' + hash(3), 'pick ' + hash(3)],
    ['squash ' + hash(3), 'pick ' + hash(4)],
    ['reword ' + hash(3)],
    ['drop ' + hash(3), 'fixup ' + hash(4)],
  ].map((lines) => ({ lines })),
)('rejects unsafe, unavailable or inconsistent instructions atomically: $lines', async ({ lines }) => {
  const f = create(),
    before = demoRepositoryFingerprint(f.repo);
  expect(await rebase(f, lines)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(f.repo)).toBe(before);
  expect(await rebase(f, todo('reword'))).toMatchObject({ success: true });
  expect(f.repo.commits[0].hash).toBe(hash(6));
});

it.each(['worktree', 'index', 'detached'] as const)('refuses a %s obstruction without consuming commit IDs', async (reason) => {
  const f = create();
  if (reason === 'detached') f.repo.command('checkout', '--detach', hash(4));
  else {
    writeDemoFile(f.repo, 'README.md', 'An unfinished tracked draft\n');
    if (reason === 'index') f.repo.command('add', '--', 'README.md');
  }
  const before = demoRepositoryFingerprint(f.repo);
  expect(await rebase(f, todo('reword'))).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(f.repo)).toBe(before);
});

it('checks the requested example path and rejects a stale publication after a repository switch', async () => {
  const f = create(),
    before = demoRepositoryFingerprint(f.repo);
  expect(await f.api.git.startInteractiveRebase(hash(2), todo('reword'), '/personal/repository')).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(f.repo)).toBe(before);
  f.repo.registerProject(DEMO_SECOND_REPO, { 'note.txt': 'A separate project\n' }, true);
  const pending = rebase(f, todo('reword'));
  f.repo.selectProject(DEMO_SECOND_REPO);
  const other = demoRepositoryFingerprint(f.repo);
  expect(await pending).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(f.repo)).toBe(other);
});

it('allows only one publication and detects a changed worktree before committing the plan', async () => {
  const f = create(),
    first = rebase(f, todo('reword')),
    second = rebase(f, todo('reword'));
  writeDemoFile(f.repo, 'LICENSE', 'A later tracked draft\n');
  const changed = demoRepositoryFingerprint(f.repo);
  expect(await first).toMatchObject({ success: false });
  expect(await second).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(f.repo)).toBe(changed);
});
