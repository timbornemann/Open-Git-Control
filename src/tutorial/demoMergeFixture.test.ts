import { expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { resolveDemoCommit } from './demoHistory';
import { parseConflictBlocks, parseConflictEntries } from '@/components/staging-area/utils';
const source = 'feature/begruessung';
it.each(['de', 'en'] as const)('loads complete independent branch trees without creating a dirty working state in %s', async (language) => {
  for (const current of ['main', source]) {
    const prepare = branchRecipe({ current });
    prepare.branches = {
      ...prepare.branches!,
      fixture: 'diverged-license',
      heads: [
        { name: 'main', commit: 4 },
        { name: source, commit: 5 },
      ],
    };
    const step = { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'branches')!.steps[0], prepare };
    const demo = createDemoApi(
      { request: { chapterId: 'branches' }, language, theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
      step,
    );
    const incoming = resolveDemoCommit(demo.repo, source)!;
    const base = resolveDemoCommit(demo.repo, hash(3))!;
    const target = resolveDemoCommit(demo.repo, 'main')!;
    expect(incoming.parent).toBe(hash(3));
    expect(incoming.files!['README.md']).toEqual(base.files!['README.md']);
    expect(incoming.files!['LICENSE']).not.toEqual(base.files!['LICENSE']);
    expect(target.files!['LICENSE']).toEqual(base.files!['LICENSE']);
    expect(demo.repo.commits[0].hash).toBe(hash(current === 'main' ? 4 : 5));
    expect(demo.repo.files).toEqual(resolveDemoCommit(demo.repo, current)!.files);
    expect(demo.repo.indexFiles).toEqual(demo.repo.files);
    expect(demo.repo.status()).toBe('');
    expect((await demo.api.git.readRepoFile('LICENSE')).data).toEqual(demo.repo.files.LICENSE);
    demo.repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'merge-review')!.steps[0], language);
    expect(demo.repo.commits).toHaveLength(4);
    expect(resolveDemoCommit(demo.repo, hash(5))).toBeUndefined();
  }
});

it.each(['de', 'en'] as const)('prepares two real conflict files, separate text blocks and a modify/delete choice in %s', (language) => {
  const first = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'conflicts')!.steps[0];
  const step = { ...first, prepare: { ...first.prepare!, branches: { ...first.prepare!.branches!, fixture: 'diverged-conflicts' as const } } };
  const { repo } = createDemoApi(
    { request: { chapterId: 'conflicts' }, language, theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    step,
  );
  for (const deleted of [false, true]) {
    repo.reset(step, language);
    expect(
      parseConflictEntries(repo.status())
        .map((entry) => [entry.path, entry.code])
        .sort(),
    ).toEqual([
      ['LICENSE', 'UD'],
      ['README.md', 'UU'],
    ]);
    expect(parseConflictBlocks(String(repo.files['README.md']))).toHaveLength(2);
    const current = resolveDemoCommit(repo, 'main')!.files!,
      incoming = resolveDemoCommit(repo, source)!.files!;
    expect(incoming.LICENSE).toBeUndefined();
    expect(repo.files.LICENSE).toEqual(current.LICENSE);
    expect(repo.indexFiles['README.md']).toEqual(current['README.md']);
    expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
    expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
    expect(parseConflictEntries(repo.status()).map((entry) => entry.path)).toEqual(['LICENSE']);
    expect(repo.command(deleted ? 'conflictTakeDeleted' : 'conflictMarkResolved', 'LICENSE').success).toBe(true);
    expect(repo.command('mergeContinue').success).toBe(true);
    expect(repo.commits[0].parent).toBe(hash(4) + ' ' + hash(5));
    expect(repo.headFiles['README.md']).toEqual(incoming['README.md']);
    expect(repo.headFiles.LICENSE).toEqual(deleted ? undefined : current.LICENSE);
    expect(repo.status()).toBe('');
  }
});
