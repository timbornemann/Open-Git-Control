import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchCarryRecipe } from '@/shared/tutorial/branchCarryHelpers';
import { DEMO_REPO } from './demoRepository';
import { writeDemoFile, refreshDemoFiles } from './demoFiles';
import { historyText } from './demoHistoryExamples';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';

function create(olderBase = false) {
  const step = { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'branches')!.steps[0], prepare: branchCarryRecipe() };
  if (olderBase)
    step.prepare.branches = {
      ...step.prepare.branches!,
      heads: [
        { name: 'main', commit: 3 },
        { name: 'feature/begruessung', commit: 4 },
      ],
    };
  return createDemoApi(
    {
      request: { chapterId: 'branches' },
      language: 'en',
      theme: 'copper-night',
      progress: { version: 1, welcomeSeen: true, completedChapters: [] },
    },
    step,
  );
}
const push = (demo: ReturnType<typeof create>, name = 'Saved work') => {
  expect(demo.repo.command('stash', 'push', '-u', '-m', name)).toMatchObject({ success: true });
  return demo.repo.stashes[0].hash;
};

it('stashes one literal file and applies it while preserving unrelated indexed, working and new files', () => {
  const demo = create();
  writeDemoFile(demo.repo, 'LICENSE', 'Independent staged\n');
  demo.repo.stage(['LICENSE']);
  writeDemoFile(demo.repo, 'LICENSE', 'Independent working\n');
  const notes = demo.repo.files['notes.txt'];
  expect(demo.repo.command('stash', 'push', '-m', 'README only', '--', 'README.md')).toMatchObject({ success: true });
  expect(demo.repo.files['README.md']).toBe(historyText('latest', 'en'));
  expect(demo.repo.files['LICENSE']).toBe('Independent working\n');
  expect(demo.repo.indexFiles.LICENSE).toBe('Independent staged\n');
  expect(demo.repo.files['notes.txt']).toEqual(notes);
  const saved = demo.repo.stashes[0].hash;
  expect(demo.repo.command('stash', 'apply', 'stash@{0}')).toMatchObject({ success: true });
  expect(demo.repo.files['README.md']).toBe(historyText('work', 'en'));
  expect(demo.repo.indexFiles['README.md']).toBe(historyText('latest', 'en'));
  expect(demo.repo.files['LICENSE']).toBe('Independent working\n');
  expect(demo.repo.indexFiles.LICENSE).toBe('Independent staged\n');
  expect(demo.repo.files['notes.txt']).toEqual(notes);
  expect(demo.repo.stashes.map((entry) => entry.hash)).toEqual([saved]);
});

it.each(['apply', 'pop'])('restores work and new files through ordinary %s without implicitly restoring the old index', (operation) => {
  const demo = create();
  const saved = push(demo);
  expect(demo.repo.status()).toBe('');
  expect(demo.repo.command('stash', operation, 'stash@{0}')).toMatchObject({ success: true });
  expect(demo.repo.files['README.md']).toBe(historyText('work', 'en'));
  expect(demo.repo.indexFiles['README.md']).toBe(historyText('latest', 'en'));
  expect([...demo.repo.staged]).toEqual([]);
  expect([...demo.repo.modified]).toEqual(['README.md']);
  expect([...demo.repo.untracked]).toEqual(['notes.txt']);
  expect(demo.repo.stashes.map((entry) => entry.hash)).toEqual(operation === 'apply' ? [saved] : []);
});

it('stages the saved working contents of an added-to-index file during ordinary application, matching Git', () => {
  const demo = create();
  writeDemoFile(demo.repo, 'added.txt', 'Indexed new file\n');
  demo.repo.stage(['added.txt']);
  writeDemoFile(demo.repo, 'added.txt', 'Further new file edit\n');
  push(demo);
  expect(demo.repo.command('stash', 'apply', 'stash@{0}')).toMatchObject({ success: true });
  expect(demo.repo.files['added.txt']).toBe('Further new file edit\n');
  expect(demo.repo.indexFiles['added.txt']).toBe('Further new file edit\n');
  expect(demo.repo.staged.has('added.txt')).toBe(true);
  expect(demo.repo.untracked.has('added.txt')).toBe(false);
});

it('cleans a staged deletion and recreated untracked path, and refuses its unsafe restoration without losing the backup', () => {
  const demo = create();
  delete demo.repo.indexFiles['README.md'];
  writeDemoFile(demo.repo, 'README.md', 'A different untracked replacement\n');
  refreshDemoFiles(demo.repo);
  const saved = push(demo);
  expect(demo.repo.status()).toBe('');
  expect(demo.repo.files['README.md']).toBe(historyText('latest', 'en'));
  const before = demoRepositoryFingerprint(demo.repo);
  expect(demo.repo.command('stash', 'apply', '--index', 'stash@{0}')).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
  expect(demo.repo.stashes[0].hash).toBe(saved);
});

it.each([
  ['push', 'unsupported-positional'],
  ['push', '-m'],
  ['push', '-m', 'one', '-m', 'two'],
  ['push', '--keep-index'],
  ['push', '--', '../outside'],
  ['push', '--', '/absolute'],
  ['show', 'missing'],
  ['show', 'stash@{0}', 'stash@{1}'],
  ['apply', 'missing'],
  ['pop', '--unknown'],
  ['drop', '--index'],
  ['list', 'ignored-argument'],
])('refuses unsupported stash arguments before mutating any data: %s', (...args) => {
  const demo = create();
  if (['show', 'apply', 'pop', 'drop', 'list'].includes(args[0])) push(demo);
  const before = demoRepositoryFingerprint(demo.repo);
  expect(demo.repo.command('stash', ...args)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it('keeps both saved versions and newer local contents when ordinary restoration would overwrite them', () => {
  const demo = create();
  const saved = push(demo);
  writeDemoFile(demo.repo, 'README.md', 'Newer work must survive\n');
  const before = demoRepositoryFingerprint(demo.repo);
  expect(demo.repo.command('stash', 'pop', 'stash@{0}')).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
  expect(demo.repo.stashes[0].hash).toBe(saved);
});

it('drops one selected backup and renumbers positions without replacing the other backup', () => {
  const demo = create();
  const first = push(demo, 'First');
  writeDemoFile(demo.repo, 'README.md', 'Second saved version\n');
  const second = push(demo, 'Second');
  expect(demo.repo.command('stash', 'drop', 'stash@{1}')).toMatchObject({ success: true });
  expect(demo.repo.stashes).toMatchObject([{ index: 0, name: 'stash@{0}', hash: second, subject: 'Second' }]);
  expect(demo.repo.stashSnapshots.has(first)).toBe(false);
  expect(demo.repo.stashSnapshots.has(second)).toBe(true);
  expect(demo.repo.status()).toBe('');
});

it('creates a branch from the selected stash base and restores its index, work and new files before removing only that backup', async () => {
  const demo = create();
  const saved = push(demo);
  expect(await demo.api.git.gitStashBranch('stash@{0}', 'feature/saved-work', DEMO_REPO)).toMatchObject({ success: true });
  expect(demo.repo.branch).toBe('feature/saved-work');
  expect(demo.repo.branchHeads.get('feature/saved-work')).toBe(hash(4));
  expect(demo.repo.files['README.md']).toBe(historyText('work', 'en'));
  expect(demo.repo.indexFiles['README.md']).toBe(historyText('index', 'en'));
  expect([...demo.repo.untracked]).toEqual(['notes.txt']);
  expect(demo.repo.stashes).toEqual([]);
  expect(demo.repo.stashSnapshots.has(saved)).toBe(false);
});

it('creates the stash branch at its older saved base while preserving the newer current branch', async () => {
  const demo = create(true);
  push(demo);
  expect(demo.repo.command('checkout', 'feature/begruessung')).toMatchObject({ success: true });
  expect(demo.repo.headFiles['README.md']).toBe(historyText('latest', 'en'));
  expect(await demo.api.git.gitStashBranch('stash@{0}', 'feature/saved-work', DEMO_REPO)).toMatchObject({ success: true });
  expect(demo.repo.branchHeads.get('feature/saved-work')).toBe(hash(3));
  expect(demo.repo.branchHeads.get('feature/begruessung')).toBe(hash(4));
  expect(demo.repo.branchHeads.get('main')).toBe(hash(3));
  expect(demo.repo.headFiles['README.md']).toBe(historyText('description', 'en'));
  expect(demo.repo.indexFiles['README.md']).toBe(historyText('index', 'en'));
  expect(demo.repo.files['README.md']).toBe(historyText('work', 'en'));
  expect(demo.repo.stashes).toEqual([]);
});

it.each(['foreign-project', 'dirty-work'])('refuses a stash branch without changing the backup or work: %s', async (kind) => {
  const demo = create();
  push(demo);
  if (kind === 'dirty-work') writeDemoFile(demo.repo, 'LICENSE', 'New work to preserve\n');
  const before = demoRepositoryFingerprint(demo.repo);
  expect(await demo.api.git.gitStashBranch('stash@{0}', 'feature/saved-work', kind === 'foreign-project' ? '/other-project' : DEMO_REPO)).toMatchObject({
    success: false,
  });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it('retains a different backup when restoring an older selected stash into a branch', async () => {
  const demo = create();
  const first = push(demo, 'First');
  writeDemoFile(demo.repo, 'README.md', 'Newer backup work\n');
  writeDemoFile(demo.repo, 'followup.md', 'Other new file\n');
  const second = push(demo, 'Second');
  expect(await demo.api.git.gitStashBranch('stash@{1}', 'feature/saved-work', DEMO_REPO)).toMatchObject({ success: true });
  expect(demo.repo.stashes).toMatchObject([{ hash: second, name: 'stash@{0}', subject: 'Second' }]);
  expect(demo.repo.stashSnapshots.has(first)).toBe(false);
  expect(demo.repo.stashSnapshots.has(second)).toBe(true);
  expect(demo.repo.files['README.md']).toBe(historyText('work', 'en'));
  expect(demo.repo.files['followup.md']).toBeUndefined();
});

it('does not create a branch from a removed backup', async () => {
  const demo = create();
  push(demo);
  demo.repo.command('stash', 'drop', 'stash@{0}');
  const before = demoRepositoryFingerprint(demo.repo);
  expect(await demo.api.git.gitStashBranch('stash@{0}', 'feature/saved-work', DEMO_REPO)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it.each(['main', 'bad name', 'feature', 'feature/new/child'])('keeps the backup after an invalid or colliding stash branch request: %s', async (name) => {
  const demo = create();
  if (name === 'feature/new/child') {
    demo.repo.branches.push('feature/new');
    demo.repo.branchHeads.set('feature/new', hash(4));
  }
  push(demo);
  const before = demoRepositoryFingerprint(demo.repo);
  expect(await demo.api.git.gitStashBranch('stash@{0}', name, DEMO_REPO)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});
