import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushSecretScanPreflight } from '../PushSecretScanPreflight';
import type { GitService } from '../../GitService';
import type { SecretScanService } from '../../SecretScanService';
import type { AppSettings } from '../../settings';

const head = 'a'.repeat(40);
function fixture() {
  let active: string | null = '/repo';
  let version = 'original';
  const settings = { secretScanBeforePushEnabled: true, secretScanStrictness: 'low' } as AppSettings;
  const run = vi.fn(async () => head);
  const scan = vi.fn(async (_options: any) => ({ historyScanIncomplete: undefined }));
  const prepare = vi.fn(async () => ({ version, text: `path:${version}` }));
  const preflight = new PushSecretScanPreflight({
    gitService: { getRepoPath: () => active, runner: { run } } as unknown as GitService,
    secretScanService: { scanPushDiffs: scan } as unknown as SecretScanService,
    readSettings: () => settings,
    allowlistReader: { prepare, assertVersion: vi.fn() } as any,
  });
  return {
    preflight,
    run,
    scan,
    settings,
    setPolicy: (value: string) => (version = value),
    select: (value: string | null) => {
      active = value;
      preflight.setActiveRepository(value);
    },
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('offline idle push preflight scheduling', () => {
  it('starts after selection, does no repeated scans for unchanged commits, and refreshes for a new commit or policy', async () => {
    const f = fixture();
    f.select('/repo');
    expect(f.scan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.scan).toHaveBeenCalledOnce();
    expect(f.scan).toHaveBeenLastCalledWith(expect.objectContaining({ background: true, revisions: [head], allowlistText: 'path:original' }));
    expect(f.run).toHaveBeenCalledWith('/repo', ['rev-parse', '--verify', 'HEAD'], expect.objectContaining({ requestedKind: 'background' }));
    expect(f.run).toHaveBeenCalledWith(
      '/repo',
      ['rev-list', '--reverse', '--topo-order', head, '--not', '--remotes'],
      expect.objectContaining({ requestedKind: 'background' }),
    );
    expect(f.scan.mock.calls[0][0].preflightCommits).toEqual([head]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.scan).toHaveBeenCalledOnce();
    f.run.mockResolvedValue('b'.repeat(40));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledTimes(2);
    f.setPolicy('edited');
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledTimes(3);
    f.settings.secretScanStrictness = 'high';
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledTimes(4);
    f.select(null);
  });

  it('yields to foreground scanning, ignores a late cancelled result and retries after foreground work finishes', async () => {
    const f = fixture();
    let finish!: (value: any) => void;
    f.scan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    f.select('/repo');
    await vi.advanceTimersByTimeAsync(1500);
    const signal = f.scan.mock.calls[0][0].signal as AbortSignal;
    const resume = f.preflight.pause();
    expect(signal.aborted).toBe(true);
    finish({});
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.scan).toHaveBeenCalledOnce();
    resume();
    resume();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledTimes(2);
    f.select(null);
  });

  it('cancels on repository changes and never applies a reply to another repository', async () => {
    const f = fixture();
    let finish!: (value: any) => void;
    f.scan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    f.select('/repo');
    await vi.advanceTimersByTimeAsync(1500);
    const signal = f.scan.mock.calls[0][0].signal as AbortSignal;
    f.select('/other');
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    finish({});
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledTimes(2);
    expect(f.scan.mock.calls[1][0].repoPath).toBe('/other');
    f.select(null);
    expect((f.scan.mock.calls[1][0].signal as AbortSignal).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.scan).toHaveBeenCalledTimes(2);
  });

  it('does not start duplicate idle work when an old cancelled scan finishes after the next scan started', async () => {
    const f = fixture();
    let finishOld!: (value: any) => void;
    let finishCurrent!: (value: any) => void;
    f.scan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    f.scan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCurrent = resolve;
        }),
    );
    f.select('/repo');
    await vi.advanceTimersByTimeAsync(1500);
    f.preflight.pause()();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledTimes(2);
    finishOld({});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.scan).toHaveBeenCalledTimes(2);
    finishCurrent({});
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledTimes(2);
    f.select(null);
  });

  it('retries failed and incomplete scans without treating them as a finished preflight', async () => {
    const f = fixture();
    f.scan.mockRejectedValueOnce(new Error('Git read was preempted'));
    f.scan.mockResolvedValueOnce({ historyScanIncomplete: true } as any);
    f.select('/repo');
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledTimes(3);
    f.select(null);
  });

  it('does no background work when push secret scanning is disabled or HEAD is unborn', async () => {
    const f = fixture();
    f.settings.secretScanBeforePushEnabled = false;
    f.select('/repo');
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.run).not.toHaveBeenCalled();
    expect(f.scan).not.toHaveBeenCalled();
    f.settings.secretScanBeforePushEnabled = true;
    f.run.mockRejectedValueOnce(new Error('Unborn HEAD'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.scan).toHaveBeenCalledOnce();
    f.select(null);
  });
});
