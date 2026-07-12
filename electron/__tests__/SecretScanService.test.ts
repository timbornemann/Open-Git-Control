import { describe, expect, it, vi } from 'vitest';
import { SecretScanService } from '../SecretScanService';

function createGitServiceMock(outputs: Record<string, string | Error>) {
  const resolve = async (args: string[]) => {
    const key = args.join(' ');
    const value = outputs[key];
    if (value instanceof Error) {
      throw value;
    }
    return typeof value === 'string' ? value : '';
  };
  return {
    runCommand: resolve,
    runCommandAtPath: async (_repoPath: string, args: string[]) => resolve(args),
    streamCommandLines: async (args: string[], onLine: (line: string) => void) => {
      const output = await resolve(args);
      output.split(/\r?\n/).forEach(onLine);
    },
    streamCommandLinesAtPath: async (_repoPath: string, args: string[], onLine: (line: string) => void) => {
      const output = await resolve(args);
      output.split(/\r?\n/).forEach(onLine);
    },
  } as any;
}

describe('SecretScanService', () => {
  it('scans only the staged patch for the fast pre-commit check', async () => {
    const stagedDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const runCommandAtPath = vi.fn();
    const streamCommandLinesAtPath = vi.fn(async (_repoPath: string, args: string[], onLine: (line: string) => void) => {
      expect(args).toEqual(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=0']);
      stagedDiff.split(/\r?\n/).forEach(onLine);
    });
    const service = new SecretScanService({ runCommandAtPath, streamCommandLinesAtPath } as any);

    const result = await service.scanStagedDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ source: 'staged', filePath: '.env' });
    expect(result.stats).toMatchObject({ checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 });
    expect(streamCommandLinesAtPath).toHaveBeenCalledTimes(1);
    expect(runCommandAtPath).not.toHaveBeenCalled();
  });

  it('detects staged and outgoing secrets', async () => {
    const outgoingCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const stagedDiff = [
      'diff --git a/src/app.ts b/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -0,0 +1,2 @@',
      '+const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";',
      '+console.log("ok");',
    ].join('\n');
    const outgoingDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');

    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'rev-list --reverse --topo-order origin/main..HEAD': outgoingCommit,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${outgoingCommit}`]:
          outgoingDiff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });
    expect(result.findings.length).toBe(2);
    expect(result.findings.map((f) => f.source).sort()).toEqual(['staged', 'to-push']);
  });

  it('detects fine-grained GitHub PATs in unquoted .env assignments', async () => {
    const stagedDiff = [
      'diff --git a/.env b/.env',
      '+++ b/.env',
      '@@ -0,0 +1 @@',
      '+GITHUB_TOKEN=github_pat_11ABCDEFG0abcdefghijkl_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN',
    ].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
        'rev-list --reverse --topo-order HEAD --not --remotes': '',
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings.map((finding) => finding.ruleId)).toContain('github-fine-grained-pat');
    expect(result.findings.find((finding) => finding.ruleId === 'github-fine-grained-pat')?.source).toBe('staged');
  });

  it('scans every outgoing commit so a secret removed by a later commit is still found', async () => {
    const secretCommit = '1111111111111111111111111111111111111111';
    const removalCommit = '2222222222222222222222222222222222222222';
    const secretDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const removalDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -1 +0,0 @@', '-AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'rev-list --reverse --topo-order origin/main..HEAD': `${secretCommit}\n${removalCommit}`,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${secretCommit}`]:
          secretDiff,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${removalCommit}`]:
          removalDiff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ source: 'to-push', filePath: '.env' });
    expect(result.notes.join('\n')).toContain('Scanned 2 commit(s) ahead of origin/main.');
  });

  it('accepts SHA-256 commit ids while enumerating outgoing commits', async () => {
    const sha256Commit = 'a'.repeat(64);
    const diff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'rev-list --reverse --topo-order origin/main..HEAD': sha256Commit,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${sha256Commit}`]: diff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
  });

  it('respects project allowlist', async () => {
    const stagedDiff = [
      'diff --git a/src/app.ts b/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -0,0 +1 @@',
      '+const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";',
    ].join('\n');

    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
      }),
    );

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: 'regex:ghp_[a-z0-9]+',
    });

    expect(result.findings).toHaveLength(0);
  });

  it('falls back to unpushed HEAD commits when no upstream is configured', async () => {
    const commitHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const outgoingCommitDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');

    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
        'rev-list --reverse --topo-order HEAD --not --remotes': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]:
          outgoingCommitDiff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].source).toBe('to-push');
    expect(result.notes.join('\n')).toContain('Scanned 1 commit(s) from requested push source HEAD.');
  });

  it('scans commits that would only be published by push --tags', async () => {
    const tagCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tagDiff = ['diff --git a/release.env b/release.env', '+++ b/release.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');

    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'diff --no-ext-diff --no-textconv --no-color --unified=0 origin/main..HEAD': '',
        'rev-list --reverse --topo-order --tags --not --remotes': tagCommit,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${tagCommit}`]: tagDiff,
      }),
    );

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      includeTags: true,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].source).toBe('tag');
    expect(result.stats.tagLines).toBe(1);
  });

  it('scans paths that were previously skipped by built-in ignore rules and redacts every matched secret', async () => {
    const exposedKey = 'sk_live_1234567890abcdefghijklmnop';
    const stagedDiff = ['diff --git a/dist/runtime.js b/dist/runtime.js', '+++ b/dist/runtime.js', '@@ -0,0 +1 @@', `+window.runtimeKey = ${exposedKey};`].join(
      '\n',
    );
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'diff --no-ext-diff --no-textconv --no-color --unified=0 origin/main..HEAD': '',
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ filePath: 'dist/runtime.js', contextLine: expect.stringContaining('[REDACTED_SECRET]') });
    expect(result.findings[0].contextLine).not.toContain(exposedKey);
  });

  it('decodes quoted patch file headers instead of skipping secrets in special file names', async () => {
    const stagedDiff = [
      'diff --git "a/secrets\\tconfig.env" "b/secrets\\tconfig.env"',
      '+++ "b/secrets\\tconfig.env"',
      '@@ -0,0 +1 @@',
      '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF',
    ].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'diff --no-ext-diff --no-textconv --no-color --unified=0 origin/main..HEAD': '',
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].filePath).toBe('secrets\tconfig.env');
  });

  it('fails closed when it cannot enumerate outgoing commits without an upstream', async () => {
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
        'rev-list --reverse --topo-order HEAD --not --remotes': new Error('repository unavailable'),
      }),
    );

    await expect(service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' })).rejects.toThrow(
      'Could not determine commits that would be pushed',
    );
  });

  it('scans the local source branch selected by an explicit push refspec', async () => {
    const commitHash = 'cccccccccccccccccccccccccccccccccccccccc';
    const branchDiff = [
      'diff --git a/config/release.ts b/config/release.ts',
      '+++ b/config/release.ts',
      '@@ -0,0 +1 @@',
      '+const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";',
    ].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-list --reverse --topo-order release-candidate --not --remotes=backup': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: branchDiff,
      }),
    );

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      revisions: ['release-candidate'],
      excludeRemote: 'backup',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.notes.join('\n')).toContain('requested push source release-candidate');
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

  it('honors remote push refspecs for a no-refspec push', async () => {
    const commitHash = 'f'.repeat(40);
    const diff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'symbolic-ref --quiet --short HEAD': 'main',
        remote: 'origin',
        'config --get-all remote.origin.push': 'refs/heads/release:refs/heads/release',
        'rev-list --reverse --topo-order refs/heads/release --not --remotes=origin': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: diff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '', pushArgs: [] });

    expect(result.findings).toHaveLength(1);
    expect(result.notes.join('\n')).toContain('refs/heads/release');
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
        'rev-list --reverse --topo-order refs/heads/main --not --remotes=origin': '',
        'rev-list --reverse --topo-order refs/heads/feature --not --remotes=origin': commitHash,
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
