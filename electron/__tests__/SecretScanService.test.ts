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
    const outgoingDiff = [
      'diff --git a/.env b/.env',
      '+++ b/.env',
      '@@ -0,0 +1 @@',
      '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF',
    ].join('\n');

    const service = new SecretScanService(createGitServiceMock({
      'diff --cached --no-color --unified=0': stagedDiff,
      'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
      'diff --no-color --unified=0 origin/main..HEAD': outgoingDiff,
    }));

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

    const service = new SecretScanService(createGitServiceMock({
      'diff --cached --no-color --unified=0': stagedDiff,
      'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
    }));

    const result = await service.scanPushDiffs({
      strictness: 'low',
      allowlistText: 'regex:ghp_[a-z0-9]+',
    });

    expect(result.findings).toHaveLength(0);
  });
});
