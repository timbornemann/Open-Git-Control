import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO } from './demoRepository';
import { resolveDemoCommit, demoFileHistory, demoFileBlame } from './demoHistory';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { writeDemoFile } from './demoFiles';
import { historyText } from './demoHistoryExamples';
import { parseGitLog } from '@/utils/gitParsing';

const source = 'feature/begruessung';
function create(reverse = false, current = 'main') {
  const prepare = branchRecipe();
  prepare.branches = {
    ...prepare.branches!,
    heads: [
      { name: 'main', commit: reverse ? 4 : 3 },
      { name: source, commit: reverse ? 3 : 4 },
    ],
    current,
  };
  return createDemoApi(
    {
      request: { chapterId: 'branches' },
      language: 'en',
      theme: 'copper-night',
      progress: { version: 1, welcomeSeen: true, completedChapters: [] },
    },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'branches')!.steps[0], prepare },
  );
}

it.each(['default', 'ffOnly'] as const)('fast-forwards the active branch and its actual trees without creating a commit: %s', async (mode) => {
  const flags = mode === 'ffOnly' ? ['--ff-only'] : [];
  const demo = create();
  const saved = structuredClone(resolveDemoCommit(demo.repo, source)!);
  expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'merge', ...flags, source)).toMatchObject({ success: true });
  expect(demo.repo.branch).toBe('main');
  expect(demo.repo.branchHeads.get('main')).toBe(hash(4));
  expect(demo.repo.branchHeads.get(source)).toBe(hash(4));
  expect(demo.repo.commits).toHaveLength(4);
  expect(demo.repo.headFiles).toEqual(saved.files);
  expect(demo.repo.indexFiles).toEqual(saved.files);
  expect(demo.repo.files).toEqual(saved.files);
  expect(demo.repo.status()).toBe('');
  expect(resolveDemoCommit(demo.repo, source)).toEqual(saved);
});

it('recognizes an already-contained source without changing references or tree contents', async () => {
  const demo = create(true);
  const before = demoRepositoryFingerprint(demo.repo);
  expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'merge', source)).toMatchObject({ success: true });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it('creates a real two-parent no-ff commit and treats its source as merged for ordinary deletion', async () => {
  const demo = create();
  const saved = structuredClone(resolveDemoCommit(demo.repo, source)!);
  expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'merge', '--no-ff', source)).toMatchObject({ success: true });
  expect(demo.repo.commits).toHaveLength(5);
  expect(demo.repo.commits[0]).toMatchObject({ hash: hash(5), parent: hash(3) + ' ' + hash(4), files: saved.files });
  expect(demo.repo.branchHeads.get('main')).toBe(hash(5));
  expect(demo.repo.branchHeads.get(source)).toBe(hash(4));
  expect(demo.repo.indexFiles).toEqual(saved.files);
  expect(demo.repo.files).toEqual(saved.files);
  expect(demo.repo.status()).toBe('');
  expect(demo.repo.command('branch', '-d', source)).toMatchObject({ success: true });
  expect(demo.repo.branch).toBe('main');
});

it('squashes changes into the index without moving HEAD and later creates an ordinary single-parent commit', async () => {
  const demo = create();
  const saved = structuredClone(resolveDemoCommit(demo.repo, source)!);
  expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'merge', '--squash', source)).toMatchObject({ success: true });
  expect(demo.repo.branchHeads.get('main')).toBe(hash(3));
  expect(demo.repo.commits[0].hash).toBe(hash(3));
  expect(demo.repo.commits).toHaveLength(4);
  expect(demo.repo.headFiles['README.md']).toBe(historyText('description', 'en'));
  expect(demo.repo.indexFiles).toEqual(saved.files);
  expect(demo.repo.files).toEqual(saved.files);
  expect(demo.repo.staged.size).toBeGreaterThan(0);
  expect(demo.repo.modified.size).toBe(0);
  expect(await demo.api.git.createCommit({ title: 'feat: combine the greeting' })).toMatchObject({ success: true });
  expect(demo.repo.commits[0]).toMatchObject({ hash: hash(5), parent: hash(3), files: saved.files });
  expect(demo.repo.branchHeads.get(source)).toBe(hash(4));
  expect(demo.repo.command('branch', '-d', source)).toMatchObject({ success: false, error: expect.stringMatching(/not fully merged/i) });
});

it('preserves open overlapping edits when the merge cannot be safely applied', async () => {
  const demo = create();
  writeDemoFile(demo.repo, 'README.md', 'Preserve this edit\n');
  const before = demoRepositoryFingerprint(demo.repo);
  expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'merge', source)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it.each([['missing-source'], ['--unknown', source], ['--ff-only', '--no-ff', source]])(
  'refuses invalid merge input before changing any state: %j',
  async (...args) => {
    const demo = create();
    const before = demoRepositoryFingerprint(demo.repo);
    expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'merge', ...args)).toMatchObject({ success: false });
    expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
  },
);

it('merges into a selected target using the captured source and target OIDs and leaves that target active', async () => {
  const demo = create(false, source);
  expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'mergeIntoBranch', source, 'main', 'ffOnly', hash(4), hash(3))).toMatchObject({ success: true });
  expect(demo.repo.branch).toBe('main');
  expect(demo.repo.branchHeads.get('main')).toBe(hash(4));
  expect(demo.repo.branchHeads.get(source)).toBe(hash(4));
  expect(demo.repo.headFiles['README.md']).toBe(historyText('latest', 'en'));
  expect(demo.repo.status()).toBe('');
});

it.each([
  ['ffOnly', hash(4), hash(2)],
  ['ffOnly', hash(2), hash(3)],
  ['unsupported', hash(4), hash(3)],
])('rejects an outdated or invalid outward review before checkout: %s', async (mode, sourceOid, targetOid) => {
  const demo = create(false, source);
  const before = demoRepositoryFingerprint(demo.repo);
  expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'mergeIntoBranch', source, 'main', mode, sourceOid, targetOid)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it('keeps the source-side parent in current-branch history after its merged branch is deleted', async () => {
  const demo = create();
  expect(demo.repo.command('merge', '--no-ff', source).success).toBe(true);
  expect(demo.repo.command('branch', '-d', source).success).toBe(true);
  const page = await demo.api.git.getCommitLogPage({ repoPath: DEMO_REPO, scope: 'head', offset: 0, limit: 200 });
  expect(page.success && parseGitLog(page.data.raw).map((commit) => commit.hash)).toEqual([hash(5), hash(4), hash(3), hash(2), hash(1)]);
});

it('can record a no-ff merge even when its resulting tree equals the old target', () => {
  const demo = create();
  const baseline = structuredClone(demo.repo.headFiles);
  expect(demo.repo.command('checkout', source).success).toBe(true);
  demo.repo.files = structuredClone(baseline);
  expect(demo.repo.stage(Object.keys(baseline)).success).toBe(true);
  expect(demo.repo.commit('docs: restore the earlier contents').success).toBe(true);
  expect(demo.repo.commits[0].hash).toBe(hash(5));
  expect(demo.repo.command('checkout', 'main').success).toBe(true);
  expect(demo.repo.command('merge', '--no-ff', source).success).toBe(true);
  expect(demo.repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(3) + ' ' + hash(5), files: baseline });
  expect(demo.repo.status()).toBe('');
});

it('refuses ff-only on diverged branches without altering any open state', () => {
  const demo = create();
  writeDemoFile(demo.repo, 'LICENSE', 'Independent target change');
  demo.repo.stage(['LICENSE']);
  expect(demo.repo.commit('docs: independent target').success).toBe(true);
  const before = demoRepositoryFingerprint(demo.repo);
  expect(demo.repo.command('merge', '--ff-only', source)).toMatchObject({ success: false, error: expect.stringMatching(/fast-forward/i) });
  expect(demoRepositoryFingerprint(demo.repo)).toBe(before);
});

it.each(['noFf', 'squash'] as const)('performs the selected outward behavior on its actual target: %s', async (mode) => {
  const demo = create(false, source);
  expect(await demo.api.git.runGitCommandForRepo(DEMO_REPO, 'mergeIntoBranch', source, 'main', mode, hash(4), hash(3))).toMatchObject({ success: true });
  expect(demo.repo.branch).toBe('main');
  expect(demo.repo.branchHeads.get(source)).toBe(hash(4));
  expect(demo.repo.commits[0].hash).toBe(mode === 'noFf' ? hash(5) : hash(3));
  expect(demo.repo.commits[0].parent).toBe(mode === 'noFf' ? hash(3) + ' ' + hash(4) : hash(2));
  expect(demo.repo.staged.size > 0).toBe(mode === 'squash');
  expect(demo.repo.indexFiles['README.md']).toBe(historyText('latest', 'en'));
});

it('follows unchanged merged file contents through their source parent without inventing a file change on the merge commit', () => {
  const demo = create();
  expect(demo.repo.command('merge', '--no-ff', source).success).toBe(true);
  const history = demoFileHistory(demo.repo, 'README.md');
  expect(history.map((commit) => commit.hash)).toEqual([hash(4), hash(3), hash(2), hash(1)]);
});

it.each(['--no-ff', '--squash'])('attributes merged lines to their actual saved source or own squash commit: %s', (mode) => {
  const demo = create();
  expect(demo.repo.command('merge', mode, source).success).toBe(true);
  if (mode === '--squash') expect(demo.repo.commit('feat: combined changes').success).toBe(true);
  const greeting = historyText('latest', 'en').split('\n')[2];
  const lines = demoFileBlame(demo.repo, 'README.md', 'HEAD');
  expect(lines.find((line) => line.content === greeting)?.commitHash).toBe(mode === '--squash' ? hash(5) : hash(4));
});

it('includes later current-branch file changes when the selected anchor belongs to the second merge parent', () => {
  const demo = create();
  expect(demo.repo.command('merge', '--no-ff', source).success).toBe(true);
  writeDemoFile(demo.repo, 'README.md', historyText('latest', 'en') + '\nLater change\n');
  demo.repo.stage(['README.md']);
  expect(demo.repo.commit('docs: later change').success).toBe(true);
  const history = demoFileHistory(demo.repo, 'README.md', hash(4), 100, { includeFuture: true });
  expect(history.map((commit) => commit.hash)).toEqual([hash(6), hash(4), hash(3), hash(2), hash(1)]);
});
