import { expect, it } from 'vitest';
import { nativeMergeFixture } from './__tests__/nativeMergeFixture';
import { TUTORIAL_MERGE_GUARD } from '@/shared/tutorial/catalogMergeGuard';
import { TUTORIAL_MERGE_SQUASH_DIVERGED } from '@/shared/tutorial/catalogMergeSquashDiverged';
import { squashDivergedMessage, squashDivergedDescription } from '@/shared/tutorial/mergeSquashDivergedHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';

it.each(['de', 'en'] as const)('matches Git for a refused ff-only followed by a separate normal merge in %s', (language) => {
  const { repo, git, source, read } = nativeMergeFixture(language, TUTORIAL_MERGE_GUARD.steps[0], { flags: ['--ff-only'], exit: 128 });
  const before = demoRepositoryFingerprint(repo);
  expect(repo.command('merge', '--ff-only', source)).toMatchObject({ success: false });
  expect(demoRepositoryFingerprint(repo)).toBe(before);
  expect(repo.files['README.md']).toBe(read());
  expect(repo.files.LICENSE).toBe(read('LICENSE'));
  expect(repo.status()).toBe(git(['status', '--porcelain']));
  expect(repo.status()).toBe('');
  git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], 1);
  git(['merge', source]);
  expect(repo.command('merge', source).success).toBe(true);
  expect(repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(4) + ' ' + hash(5) });
  expect(repo.files['README.md']).toBe(read());
  expect(repo.files.LICENSE).toBe(read('LICENSE'));
  expect(repo.status()).toBe(git(['status', '--porcelain']));
  expect(git(['show', '-s', '--format=%P', 'HEAD']).trim().split(' ')).toHaveLength(2);
});

it.each(['de', 'en'] as const)('matches Git for divergent squash, its one-parent commit and retained unmerged source in %s', (language) => {
  const { repo, git, source, read } = nativeMergeFixture(language, TUTORIAL_MERGE_SQUASH_DIVERGED.steps[0], { flags: ['--squash'], exit: 0 });
  const nativeTarget = git(['rev-parse', 'HEAD']).trim();
  expect(repo.command('merge', '--squash', source).success).toBe(true);
  expect(repo.commits[0].hash).toBe(hash(4));
  expect(repo.status()).toBe(git(['status', '--porcelain']));
  expect([...repo.staged]).toEqual(['LICENSE']);
  expect(git(['diff', '--cached', '--name-only', '-z'])).toBe('LICENSE\0');
  expect(repo.files['README.md']).toBe(read());
  expect(repo.files.LICENSE).toBe(read('LICENSE'));
  git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], 1);
  const index = language === 'de' ? 0 : 1;
  const title = 'docs(lernen): ' + squashDivergedMessage[index],
    description = squashDivergedDescription[index];
  git(['commit', '-m', title, '-m', description]);
  expect(repo.commit(title, { description }).success).toBe(true);
  expect(repo.commits[0]).toMatchObject({ hash: hash(6), parent: hash(4), subject: title, body: description });
  expect(git(['show', '-s', '--format=%P', 'HEAD']).trim()).toBe(nativeTarget);
  expect(git(['show', '-s', '--format=%B', 'HEAD']).trimEnd()).toBe(title + '\n\n' + description);
  expect(repo.files['README.md']).toBe(read());
  expect(repo.files.LICENSE).toBe(read('LICENSE'));
  expect(repo.status()).toBe(git(['status', '--porcelain']));
  git(['branch', '-d', source], 1);
  expect(repo.command('branch', '-d', source).success).toBe(false);
  expect(repo.branchHeads.get(source)).toBe(hash(5));
});
