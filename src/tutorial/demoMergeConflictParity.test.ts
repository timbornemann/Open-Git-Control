import { expect, it } from 'vitest';
import { nativeMergeFixture } from './__tests__/nativeMergeFixture';
it.each(['de', 'en'] as const)(
  'matches native merge contents, save-only, index resolution, continuation and abort in %s',
  async (language) => {
    const { repo, api, step, git, source, read, writeNative } = nativeMergeFixture(language);
    expect(repo.files['README.md']).toBe(read());
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    const replacement =
      language === 'de' ? '# OGC-Lernprojekt\n\nBewusst zusammengeführter Inhalt.\n' : '# OGC-Lernprojekt\n\nDeliberately combined content.\n';
    writeNative('README.md', replacement);
    await api.git.writeRepoFile('README.md', replacement);
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    expect(repo.conflicted).toBe(true);
    git(['add', '--', 'README.md']);
    expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    expect(repo.indexFiles['README.md']).toBe(git(['show', ':README.md']));
    git(['merge', '--continue']);
    expect(repo.command('mergeContinue').success).toBe(true);
    expect(repo.commits[0].parent.split(' ')).toHaveLength(git(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(' ').length - 1);
    expect(repo.files['README.md']).toBe(read());
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    git(['reset', '--hard', 'HEAD~1']);
    git(['merge', source], 1);
    repo.reset(step, language);
    git(['merge', '--abort']);
    expect(repo.command('mergeAbort').success).toBe(true);
    expect(repo.files['README.md']).toBe(read());
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    git(['merge', source], 1);
    repo.reset(step, language);
    git(['checkout', '--', 'README.md'], 1);
    expect(repo.command('checkout', '--', 'README.md').success).toBe(false);
    git(['rm', '--cached', '--', 'README.md']);
    expect(repo.command('rm', '--cached', '--', 'README.md').success).toBe(true);
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    git(['checkout', 'HEAD', '--', 'README.md']);
    expect(repo.command('checkout', 'HEAD', '--', 'README.md').success).toBe(true);
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    expect(repo.files['README.md']).toBe(read());
    git(['merge', '--abort']);
    expect(repo.command('mergeAbort').success).toBe(true);
    git(['merge', source], 1);
    repo.reset(step, language);
    git(['reset', 'HEAD', '--', 'README.md']);
    expect(repo.command('reset', 'HEAD', '--', 'README.md').success).toBe(true);
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    expect(repo.files['README.md']).toBe(read());
    git(['merge', '--abort']);
    expect(repo.command('mergeAbort').success).toBe(true);
  },
  30_000,
);
