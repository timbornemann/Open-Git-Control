import { describe, expect, it, vi } from 'vitest';
import { SecretScanService } from '../SecretScanService';
import { createGitServiceMock } from './secretScanTestUtils';

describe('SecretScanService push source selection', () => {
  it('falls back to HEAD instead of blocking a push when an explicit source cannot be enumerated', async () => {
    const commitHash = 'd'.repeat(40);
    const diff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-list --reverse --topo-order missing-source': new Error('unknown revision'),
        'rev-list --reverse --topo-order HEAD': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: diff,
      }),
    );

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      pushArgs: ['origin', 'missing-source'],
    });

    expect(result.findings).toHaveLength(1);
    expect(result.historyScanIncomplete).toBe(true);
    expect(result.notes.join('\n')).toContain('Could not inspect requested push source missing-source');
    expect(result.notes.join('\n')).toContain('requested push source HEAD');
  });

  it('scans every explicitly requested push source', async () => {
    const firstCommit = 'e'.repeat(40);
    const secondCommit = 'f'.repeat(40);
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-list --reverse --topo-order first-source': firstCommit,
        'rev-list --reverse --topo-order second-source': secondCommit,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${firstCommit}`]: '',
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${secondCommit}`]: '',
      }),
    );

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      pushArgs: ['origin', 'first-source', 'second-source'],
    });

    expect(result.notes.join('\n')).toContain('requested push source first-source');
    expect(result.notes.join('\n')).toContain('requested push source second-source');
  });

  it('detects conflict-resolution-only secrets in a merge combined diff', async () => {
    const mergeCommit = 'e'.repeat(40);
    const combinedDiff = [
      'diff --cc .env',
      '--- a/.env',
      '+++ b/.env',
      '@@@ -1,1 -1,1 +1,2 @@@',
      '  SAFE=value',
      '++AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF',
    ].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'rev-list --reverse --topo-order origin/main..HEAD': mergeCommit,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${mergeCommit}`]:
          combinedDiff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ filePath: '.env', lineNumber: 2, source: 'to-push' });
  });

  it('scans the full configured push source without trusting potentially stale remote-tracking refs', async () => {
    const commitHash = 'f'.repeat(40);
    const diff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'symbolic-ref --quiet --short HEAD': 'main',
        remote: 'origin',
        'config --get-all remote.origin.push': 'refs/heads/release:refs/heads/release',
        'rev-list --reverse --topo-order refs/heads/release': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: diff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '', pushArgs: [] });

    expect(result.findings).toHaveLength(1);
    expect(result.notes.join('\n')).toContain('refs/heads/release');
  });

  it('uses HEAD for a normal push so an up-to-date push never depends on resolving the branch ref', async () => {
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'symbolic-ref --quiet --short HEAD': 'main',
        remote: 'origin',
        'rev-list --reverse --topo-order HEAD': '',
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '', pushArgs: [] });

    expect(result.historyScanIncomplete).toBeUndefined();
    expect(result.notes).toContain('No unpublished commits found for requested push source HEAD.');
  });

  it('uses HEAD for a normal push with outgoing commits too', async () => {
    const commitHash = '2'.repeat(40);
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'symbolic-ref --quiet --short HEAD': 'main',
        remote: 'origin',
        'rev-list --reverse --topo-order HEAD': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: '',
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '', pushArgs: [] });

    expect(result.historyScanIncomplete).toBeUndefined();
    expect(result.notes).toContain('Scanned 1 commit(s) from requested push source HEAD.');
  });

  it('honors push.default=matching instead of scanning only HEAD', async () => {
    const commitHash = '1'.repeat(40);
    const diff = ['diff --git a/feature.env b/feature.env', '+++ b/feature.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'symbolic-ref --quiet --short HEAD': 'main',
        remote: 'origin',
        'config --get push.default': 'matching',
        'for-each-ref --format=%(refname) refs/heads': 'refs/heads/main\nrefs/heads/feature',
        'for-each-ref --format=%(refname) refs/remotes/origin/': 'refs/remotes/origin/main\nrefs/remotes/origin/feature',
        'rev-list --reverse --topo-order refs/heads/main': '',
        'rev-list --reverse --topo-order refs/heads/feature': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: diff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '', pushArgs: [] });

    expect(result.findings).toHaveLength(1);
    expect(result.notes.join('\n')).toContain('refs/heads/feature');
  });

  it('does not scan an unrelated upstream for an explicit deletion refspec', async () => {
    const runCommandAtPath = vi.fn(async (_repoPath: string, args: string[]) => {
      const key = args.join(' ');
      const values: Record<string, string> = {
        'symbolic-ref --quiet --short HEAD': 'main',
        remote: 'origin',
      };
      return values[key] || '';
    });
    const streamCommandLinesAtPath = vi.fn(async (_repoPath: string, args: string[], _onLine: (line: string) => void) => {
      if (args[0] === 'diff') return;
      throw new Error(`Unexpected commit scan: ${args.join(' ')}`);
    });
    const service = new SecretScanService({ runCommandAtPath, streamCommandLinesAtPath } as any);

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      pushArgs: ['origin', ':refs/heads/obsolete'],
    });

    expect(result.findings).toEqual([]);
    expect(result.notes).toContain('The requested push has no branch commit source to scan.');
    expect(runCommandAtPath.mock.calls.some(([, args]) => args.includes('@{upstream}'))).toBe(false);
  });
});
