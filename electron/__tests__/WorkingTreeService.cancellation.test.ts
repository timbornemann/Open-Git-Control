import * as os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { WorkingTreeService } from '../WorkingTreeService';

const deferred = () => {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture() {
  const repo = os.tmpdir();
  const counts = deferred();
  let counting = true;
  const run = vi.fn(async (_repo: string, args: string[], signal: AbortSignal) => {
    if (counting && args.includes('--numstat')) return counts.promise;
    signal.throwIfAborted();
    return args.includes('--numstat') ? '2\t1\tfile.txt' : '';
  });
  const getStatus = vi.fn(async () => ' M file.txt\0');
  const service = new WorkingTreeService({
    getRepoPath: () => repo,
    getStatusPorcelainZAtPath: getStatus,
    runCommandAtPathWithSignal: run,
  } as any);
  return {
    service,
    repo,
    counts,
    run,
    getStatus,
    finish: () => {
      counting = false;
      counts.resolve('1\t0\tfile.txt');
    },
  };
}

describe('cancellable working tree counts', () => {
  it('cancels both background diffs when their last consumer leaves and can immediately retry the same snapshot', async () => {
    const f = fixture();
    const snapshot = await f.service.getSnapshot();
    const controller = new AbortController();
    const cancelled = expect(f.service.getStats(snapshot.snapshotId, f.repo, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const abandonedSignal = f.run.mock.calls[0][2];
    controller.abort();
    await cancelled;
    expect(abandonedSignal.aborted).toBe(true);
    f.finish();
    const retried = f.service.getStats(snapshot.snapshotId, f.repo);
    const joined = f.service.getStats(snapshot.snapshotId, f.repo);
    await expect(retried).resolves.toMatchObject({ snapshotId: snapshot.snapshotId, staged: { additions: 2, deletions: 1 } });
    expect(await joined).toBe(await retried);
    expect(f.run).toHaveBeenCalledTimes(4);
    expect(f.getStatus).toHaveBeenCalledTimes(4); // Only the new count validates twice; the cancelled one publishes nothing.
    expect(f.getStatus.mock.calls[2]).toEqual([f.repo, expect.any(AbortSignal), 'background']);
  });

  it('detaches a cancelled consumer without aborting a shared count still needed by another view', async () => {
    const f = fixture();
    const snapshot = await f.service.getSnapshot();
    const controller = new AbortController();
    const cancelled = expect(f.service.getStats(snapshot.snapshotId, f.repo, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const shared = f.service.getStats(snapshot.snapshotId, f.repo);
    controller.abort();
    await cancelled;
    expect(f.run.mock.calls[0][2].aborted).toBe(false);
    f.finish();
    await expect(shared).resolves.toMatchObject({ staged: { additions: 1 } });
    expect(f.run).toHaveBeenCalledTimes(2);
    await expect(f.service.getStats(snapshot.snapshotId, f.repo)).resolves.toBe(await shared);
  });

  it('stops post-count validation after cancellation and does not cache its result', async () => {
    const f = fixture();
    const snapshot = await f.service.getSnapshot();
    f.finish();
    const status = deferred();
    let validationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      validationStarted = resolve;
    });
    f.getStatus.mockImplementationOnce(async () => {
      validationStarted();
      return status.promise;
    });
    const controller = new AbortController();
    const cancelled = expect(f.service.getStats(snapshot.snapshotId, f.repo, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await started;
    controller.abort();
    status.resolve(' M file.txt\0');
    await cancelled;
    await f.service.getStats(snapshot.snapshotId, f.repo);
    expect(f.run).toHaveBeenCalledTimes(4);
    expect(f.getStatus).toHaveBeenCalledTimes(5); // Initial pair, cancelled first sample, fresh validation pair.
  });
});
