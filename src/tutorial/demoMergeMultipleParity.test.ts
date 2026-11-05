import { expect, it } from 'vitest';
import { nativeMergeFixture } from './__tests__/nativeMergeFixture';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { writeDemoFile } from './demoFiles';
import { mergeConflictText } from './demoMergeExamples';
import { parseConflictBlocks } from '@/components/staging-area/utils';
import { demoFileBlame, demoFileHistory } from './demoHistory';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';

const scenarios = (['de', 'en'] as const).flatMap((language) => [false, true].map((deleted) => ({ language, deleted })));
const ordered = (status: string) => status.trimEnd().split('\n').sort();
it.each(scenarios)(
  'matches real Git for separate blocks and deletion=$deleted in $language',
  ({ language, deleted }) => {
    const first = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'conflicts')!.steps[0];
    const step = { ...first, prepare: { ...first.prepare!, branches: { ...first.prepare!.branches!, fixture: 'diverged-conflicts' as const } } };
    const { repo, git, read, writeNative, source } = nativeMergeFixture(language, step);
    expect(repo.files['README.md']).toEqual(read());
    expect(repo.files.LICENSE).toEqual(read('LICENSE'));
    expect(ordered(repo.status())).toEqual(ordered(git(['status', '--porcelain'])));
    expect(parseConflictBlocks(String(repo.files['README.md']))).toHaveLength(2);
    const mixed = mergeConflictText('mixed', language);
    writeNative('README.md', mixed);
    writeDemoFile(repo, 'README.md', mixed);
    git(['add', '--', 'README.md']);
    expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
    if (deleted) git(['rm', '-f', '--', 'LICENSE']);
    else git(['add', '--', 'LICENSE']);
    expect(repo.command(deleted ? 'conflictTakeDeleted' : 'conflictMarkResolved', 'LICENSE').success).toBe(true);
    expect(ordered(repo.status())).toEqual(ordered(git(['status', '--porcelain'])));
    git(['merge', '--continue']);
    expect(repo.command('mergeContinue').success).toBe(true);
    expect(repo.files['README.md']).toEqual(read());
    expect(repo.files.LICENSE).toEqual(read('LICENSE'));
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    const incomingAuthor = git(['blame', '--line-porcelain', '-L', '3,3', 'HEAD', '--', 'README.md']).split(' ')[0];
    expect(incomingAuthor).toBe(git(['rev-parse', source]).trim());
    expect(demoFileBlame(repo, 'README.md', 'HEAD').find((line) => line.lineNumber === 3)!.commitHash).toBe(hash(5));
    expect(git(['blame', '--line-porcelain', '-L', '10,10', 'HEAD', '--', 'README.md']).split(' ')[0]).toBe(git(['rev-parse', 'HEAD^1']).trim());
    expect(demoFileBlame(repo, 'README.md', 'HEAD').find((line) => line.lineNumber === 10)!.commitHash).toBe(hash(4));
    const revisions = new Map([
      [git(['rev-parse', 'HEAD']).trim(), hash(6)],
      [git(['rev-parse', 'HEAD^1']).trim(), hash(4)],
      [git(['rev-parse', source]).trim(), hash(5)],
      [git(['rev-parse', source + '^']).trim(), hash(3)],
    ]);
    const nativeHistory = (
      git(['log', '--follow', '--topo-order', '--name-status', '-M', '-z', '-100', '--pretty=format:%H%x00', '--date=iso', 'HEAD', '--', 'README.md']).match(
        /[0-9a-f]{40}(?=\0)/g,
      ) || []
    ).map((oid) => revisions.get(oid));
    expect(nativeHistory).toEqual([hash(5), hash(4), hash(3)]);
    expect(
      demoFileHistory(repo, 'README.md', 'HEAD')
        .filter((entry) => [hash(3), hash(4), hash(5), hash(6)].includes(entry.hash))
        .map((entry) => entry.hash),
    ).toEqual(nativeHistory);
  },
  30_000,
);
