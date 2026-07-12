import { describe, expect, it, vi } from 'vitest';
import { SecretScanService } from '../SecretScanService';

describe('SecretScanService history batching', () => {
  it('streams large histories in bounded commit batches instead of spawning once per commit', async () => {
    const commits = Array.from({ length: 205 }, (_, index) => index.toString(16).padStart(40, '0'));
    const runCommandAtPath = vi.fn(async (_repoPath: string, args: string[]) => {
      if (args[0] === 'rev-list') return commits.join('\n');
      return '';
    });
    const showCalls: string[][] = [];
    const streamCommandLinesAtPath = vi.fn(
      async (_repoPath: string, args: string[], onLine: (line: string) => void, signal?: AbortSignal, options?: { redactOutput?: boolean }) => {
        expect(signal?.aborted).toBe(false);
        expect(options).toMatchObject({ redactOutput: false });
        if (args[0] === 'diff') return;
        expect(args[0]).toBe('show');
        const hashes = args.slice(args.indexOf('--find-copies') + 1);
        showCalls.push(hashes);
        if (showCalls.length === 2) {
          ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].forEach(onLine);
        }
      },
    );
    const service = new SecretScanService({ runCommandAtPath, streamCommandLinesAtPath } as any);
    const controller = new AbortController();

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      revisions: ['HEAD'],
      signal: controller.signal,
    });

    expect(showCalls.map((batch) => batch.length)).toEqual([96, 96, 13]);
    expect(showCalls.flat()).toEqual(commits);
    expect(result.findings).toHaveLength(1);
    expect(result.stats.toPushLines).toBe(1);
  });

  it('stops before starting the next history batch when the scan is cancelled', async () => {
    const commits = Array.from({ length: 120 }, (_, index) => index.toString(16).padStart(40, '0'));
    const controller = new AbortController();
    const runCommandAtPath = vi.fn(async (_repoPath: string, args: string[]) => (args[0] === 'rev-list' ? commits.join('\n') : ''));
    let showCallCount = 0;
    const streamCommandLinesAtPath = vi.fn(async (_repoPath: string, args: string[]) => {
      if (args[0] !== 'show') return;
      showCallCount += 1;
      controller.abort();
    });
    const service = new SecretScanService({ runCommandAtPath, streamCommandLinesAtPath } as any);

    await expect(
      service.scanPushDiffs({
        repoPath: '/tmp/repo',
        strictness: 'low',
        allowlistText: '',
        revisions: ['HEAD'],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(showCallCount).toBe(1);
  });

  it('deduplicates commits shared by multiple requested revisions before batching', async () => {
    const commits = Array.from({ length: 150 }, (_, index) => index.toString(16).padStart(40, '0'));
    const runCommandAtPath = vi.fn(async (_repoPath: string, args: string[]) => {
      if (args[0] !== 'rev-list') return '';
      return (args.includes('main') ? commits.slice(0, 110) : commits.slice(80)).join('\n');
    });
    const streamedHashes: string[] = [];
    const streamCommandLinesAtPath = vi.fn(async (_repoPath: string, args: string[]) => {
      if (args[0] !== 'show') return;
      streamedHashes.push(...args.slice(args.indexOf('--find-copies') + 1));
    });
    const service = new SecretScanService({ runCommandAtPath, streamCommandLinesAtPath } as any);

    await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      revisions: ['main', 'feature'],
    });

    expect(streamedHashes).toEqual(commits);
    expect(new Set(streamedHashes).size).toBe(150);
  });
});
