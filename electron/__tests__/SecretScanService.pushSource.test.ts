import { describe, expect, it } from 'vitest';
import { SecretScanService } from '../SecretScanService';

function createGitServiceMock(outputs: Record<string, string | Error>) {
  const resolve = async (args: string[]) => {
    const value = outputs[args.join(' ')];
    if (value instanceof Error) throw value;
    return typeof value === 'string' ? value : '';
  };
  return {
    runCommandAtPath: async (_repoPath: string, args: string[]) => resolve(args),
    streamCommandLinesAtPath: async (_repoPath: string, args: string[], onLine: (line: string) => void) => {
      (await resolve(args)).split(/\r?\n/).forEach(onLine);
    },
  } as any;
}

describe('SecretScanService push source recovery', () => {
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
});
