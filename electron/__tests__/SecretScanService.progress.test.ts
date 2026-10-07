import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecretScanService } from '../SecretScanService';
import { SecretScanProgress } from '../git/SecretScanProgress';
import type { SecretScanProgressDto } from '../../src/types/secretScan';

const hashes = (length: number) => Array.from({ length }, (_, index) => index.toString(16).padStart(40, '0'));
const options = { repoPath: '/repo', strictness: 'low' as const, allowlistText: '', revisions: ['HEAD'] };
afterEach(() => vi.useRealTimers());

describe('secret scan progress', () => {
  it('advances commit counts only after the entire diff batch was inspected and reports final checks separately', async () => {
    const commits = hashes(205);
    const events: SecretScanProgressDto[] = [];
    let batch = 0;
    const service = new SecretScanService({
      runCommandAtPath: vi.fn(async (_repo: string, args: string[]) => (args[0] === 'rev-list' ? commits.join('\n') : '')),
      streamCommandLinesAtPath: vi.fn(async (_repo: string, args: string[], line: (text: string) => void) => {
        if (args[0] !== 'show') return;
        expect(events.at(-1)?.processedCommits).toBe(batch * 96);
        ['diff --git a/app.ts b/app.ts', '+++ b/app.ts', '@@ -0,0 +1 @@', '+const safe = true;'].forEach(line);
        // Even when lines arrive, this batch is still running.
        expect(events.at(-1)?.processedCommits).toBe(batch * 96);
        batch++;
      }),
    } as any);
    const result = await service.scanPushDiffs({ ...options, onScanProgress: (event) => events.push(event) });
    expect(events.filter((event) => event.phase === 'history').map(({ processedCommits, totalCommits }) => [processedCommits, totalCommits])).toEqual([
      [0, 205],
      [96, 205],
      [192, 205],
      [205, 205],
    ]);
    expect(events.at(-1)).toEqual({ phase: 'verifying', checkedLines: 3 });
    expect(events.some((event) => event.phase === 'complete')).toBe(false);
    expect(result.stats.checkedLines).toBe(3);
  });

  it('reports tag-only commits after deduplicating the branch pass and clears counters when changing phase', async () => {
    const commits = hashes(4);
    const events: SecretScanProgressDto[] = [];
    const service = new SecretScanService({
      runCommandAtPath: vi.fn(async (_repo: string, args: string[]) => {
        if (args[0] !== 'rev-list') return '';
        return (args.includes('--tags') ? commits : commits.slice(0, 2)).join('\n');
      }),
      streamCommandLinesAtPath: vi.fn(async () => {}),
    } as any);
    await service.scanPushDiffs({ ...options, includeTags: true, onScanProgress: (event) => events.push(event) });
    expect(events.filter((event) => event.phase === 'tags')).toEqual([
      { phase: 'tags', checkedLines: 0, processedCommits: 0, totalCommits: 2 },
      { phase: 'tags', checkedLines: 0, processedCommits: 2, totalCommits: 2 },
    ]);
    expect(events.at(-1)).toEqual({ phase: 'verifying', checkedLines: 0 });
  });

  it('never reports the cancelled batch as inspected or emits final checks after cancellation', async () => {
    const events: SecretScanProgressDto[] = [];
    const controller = new AbortController();
    const service = new SecretScanService({
      runCommandAtPath: vi.fn(async (_repo: string, args: string[]) => (args[0] === 'rev-list' ? hashes(120).join('\n') : '')),
      streamCommandLinesAtPath: vi.fn(async (_repo: string, args: string[]) => {
        if (args[0] === 'show') controller.abort();
      }),
    } as any);
    await expect(service.scanPushDiffs({ ...options, signal: controller.signal, onScanProgress: (event) => events.push(event) })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(events.at(-1)).toEqual({ phase: 'history', checkedLines: 0, processedCommits: 0, totalCommits: 120 });
    expect(events.some((event) => event.phase === 'verifying')).toBe(false);
  });

  it('updates long-running line scans without flooding IPC and preserves immutable event snapshots', () => {
    vi.useFakeTimers();
    const events: SecretScanProgressDto[] = [];
    const reporter = new SecretScanProgress((event) => events.push(event));
    reporter.beginCommits(205, false);
    reporter.lines(250);
    expect(events).toHaveLength(1);
    vi.advanceTimersByTime(100);
    reporter.lines(251);
    expect(events.at(-1)).toEqual({ phase: 'history', processedCommits: 0, totalCommits: 205, checkedLines: 251 });
    reporter.lines(500);
    vi.advanceTimersByTime(100);
    reporter.lines(501);
    expect(events).toHaveLength(3);
    reporter.completeBatch(96);
    expect(events.at(-1)).toEqual({ phase: 'history', processedCommits: 96, totalCommits: 205, checkedLines: 501 });
    expect(events[0]).toEqual({ phase: 'history', processedCommits: 0, totalCommits: 205, checkedLines: 0 });
    reporter.phase('verifying');
    expect(events.at(-1)).toEqual({ phase: 'verifying', checkedLines: 501 });
  });
});
