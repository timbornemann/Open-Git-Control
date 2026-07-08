import { describe, expect, it } from 'vitest';
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
    streamCommandLines: async (args: string[], onLine: (line: string) => void) => {
      const output = await resolve(args);
      output.split(/\r?\n/).forEach(onLine);
    },
  } as any;
}

describe('SecretScanService', () => {
  it('detects staged and outgoing secrets', async () => {
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
        'diff --cached --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'diff --no-color --unified=0 origin/main..HEAD': outgoingDiff,
      }),
    );

    const result = await service.scanPushDiffs({ strictness: 'low', allowlistText: '' });
    expect(result.findings.length).toBe(2);
    expect(result.findings.map((f) => f.source).sort()).toEqual(['staged', 'to-push']);
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
        'diff --cached --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
      }),
    );

    const result = await service.scanPushDiffs({
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
        'diff --cached --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
        'rev-list --reverse --topo-order HEAD --not --remotes': commitHash,
        [`show --format= --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: outgoingCommitDiff,
      }),
    );

    const result = await service.scanPushDiffs({ strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].source).toBe('to-push');
    expect(result.notes.join('\n')).toContain('No upstream tracking branch available; scanned 1 HEAD commit');
  });

  it('scans commits that would only be published by push --tags', async () => {
    const tagCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tagDiff = ['diff --git a/release.env b/release.env', '+++ b/release.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');

    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'diff --no-color --unified=0 origin/main..HEAD': '',
        'rev-list --reverse --topo-order --tags --not --remotes': tagCommit,
        [`show --format= --no-color --unified=0 --find-renames --find-copies ${tagCommit}`]: tagDiff,
      }),
    );

    const result = await service.scanPushDiffs({
      strictness: 'low',
      allowlistText: '',
      includeTags: true,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].source).toBe('tag');
    expect(result.stats.tagLines).toBe(1);
  });
});
