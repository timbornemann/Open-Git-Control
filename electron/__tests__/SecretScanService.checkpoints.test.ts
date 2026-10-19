import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecretScanService } from '../SecretScanService';
import { SecretScanHistoryCache } from '../git/SecretScanHistoryCache';
import type { GitService } from '../GitService';
import type { PushSecretScanScope } from '../git/PushSecretScanScope';

afterEach(() => vi.restoreAllMocks());

describe('secret scan checkpoint consistency', () => {
  it('rejects a changed earlier file when validating the end of a multi-batch push', async () => {
    const commits = Array.from({ length: 97 }, (_, index) => (index + 1).toString(16).padStart(40, '0'));
    const assertCurrent = vi.fn(async (batch?: string[]) => {
      if (!batch) throw new Error('Git attributes changed for a file from the first batch.');
    });
    vi.spyOn(SecretScanHistoryCache.prototype, 'prepare').mockResolvedValue({
      keys: new Map(commits.map((oid) => [oid, oid])),
      pointers: new Map(),
      lfsPaths: () => new Map(),
      assertCurrent,
    });
    const scanner = new SecretScanService({
      runner: {},
      streamCommandLinesAtPath: async (_repo: string, args: string[], onLine: (line: string) => Promise<void>) => {
        for (const oid of args.filter((arg) => commits.includes(arg))) {
          await onLine(`OGC_SECRET_COMMIT:${oid}`);
          await onLine('diff --git a/source.ts b/source.ts');
          await onLine('+++ b/source.ts');
          await onLine('@@ -0,0 +1 @@');
          await onLine('+export const safe = true;');
        }
      },
    } as unknown as GitService);
    const pushScanScope: PushSecretScanScope = {
      historyCommits: commits,
      tagCommits: [],
      notes: [],
      assertCurrent: async () => {},
      summary: { mode: 'incremental', endpointCount: 1, totalCommits: commits.length, fallbackReasons: [] },
    };
    await expect(scanner.scanPushDiffs({ repoPath: '/repo', strictness: 'low', allowlistText: '', pushScanScope })).rejects.toThrow('attributes changed');
    expect(assertCurrent.mock.calls.map(([batch]) => batch?.length)).toEqual([96, undefined]);
  });
});
