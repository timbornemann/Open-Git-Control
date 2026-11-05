import { expect, it } from 'vitest';
import { nativeMergeFixture } from './__tests__/nativeMergeFixture';
import { writeDemoFile } from './demoFiles';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';

type Case = {
  name: string;
  path?: string;
  staged?: boolean;
  choice?: 'ours' | 'theirs' | 'delete';
  later?: boolean;
  rename?: boolean;
  continue?: boolean;
  refuses?: boolean;
};
const cases: Case[] = [
  { name: 'unrelated tracked and staged', path: 'package.json', staged: true },
  { name: 'new and staged', path: 'new-note.txt', staged: true },
  { name: 'new and untracked', path: 'new-note.txt' },
  { name: 'unrelated tracked and unstaged', path: 'package.json' },
  { name: 'unrelated staged then edited', path: 'package.json', staged: true, later: true, refuses: true },
  { name: 'resolved incoming then edited', choice: 'theirs', later: true, refuses: true },
  { name: 'resolved current then edited', choice: 'ours', later: true },
  { name: 'resolved deletion then recreated', choice: 'delete', later: true, refuses: true },
  { name: 'renamed active branch then abort', rename: true },
  { name: 'renamed resolved branch then continue', choice: 'theirs', rename: true, continue: true },
];
it.each(cases)(
  'matches real Git for $name',
  (scenario) => {
    const { repo, git, read, writeNative } = nativeMergeFixture();
    const work = (name: string, contents: string) => {
      writeNative(name, contents);
      writeDemoFile(repo, name, contents);
    };
    if (scenario.choice === 'delete') {
      git(['rm', '-f', '--', 'README.md']);
      expect(repo.command('conflictTakeDeleted', 'README.md').success).toBe(true);
    } else if (scenario.choice) {
      git(['checkout', '--' + scenario.choice, '--', 'README.md']);
      expect(repo.command(scenario.choice === 'ours' ? 'conflictTakeOurs' : 'conflictTakeTheirs', 'README.md').success).toBe(true);
      git(['add', '--', 'README.md']);
      expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
    }
    if (scenario.path) {
      work(scenario.path, 'A new practice edit\n');
      if (scenario.staged) {
        git(['add', '--', scenario.path]);
        expect(repo.stage([scenario.path]).success).toBe(true);
      }
    }
    if (scenario.later) work(scenario.path || 'README.md', 'A later practice draft\n');
    if (scenario.rename) {
      git(['branch', '-m', 'topic/renamed']);
      expect(repo.command('branch', '-m', 'topic/renamed').success).toBe(true);
    }
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    const before = demoRepositoryFingerprint(repo);
    git(['merge', scenario.continue ? '--continue' : '--abort'], scenario.refuses ? 128 : 0);
    expect(repo.command(scenario.continue ? 'mergeContinue' : 'mergeAbort').success).toBe(!scenario.refuses);
    if (scenario.refuses) expect(demoRepositoryFingerprint(repo)).toBe(before);
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    expect(repo.branch).toBe(git(['branch', '--show-current']).trim());
    for (const path of ['README.md', 'package.json', 'new-note.txt']) expect(repo.files[path]).toEqual(read(path));
    if (scenario.continue) expect(repo.commits[0].parent).toBe(hash(4) + ' ' + hash(5));
  },
  30_000,
);
