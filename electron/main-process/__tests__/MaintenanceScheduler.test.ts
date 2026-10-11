import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaintenanceScheduler } from '../MaintenanceScheduler';
import type { StorageOverview } from '../../../src/shared/ipc/storageMaintenance';

describe('automatic maintenance scheduling', () => {
  let scheduler: MaintenanceScheduler;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    scheduler?.dispose();
    vi.useRealTimers();
  });
  const overview = {} as StorageOverview;
  it('starts at 30 seconds, repeats every six hours, and merges triggers', async () => {
    const run = vi.fn(async () => overview),
      publish = vi.fn();
    scheduler = new MaintenanceScheduler({ enabled: () => true, busy: () => false, run, publish, error: vi.fn() });
    scheduler.schedule();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(overview);
    await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.schedule();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(3);
  });
  it('defers while writers are active and honors the automatic maintenance switch', async () => {
    let busy = true,
      enabled = true;
    const run = vi.fn(async () => overview);
    scheduler = new MaintenanceScheduler({ enabled: () => enabled, busy: () => busy, run, publish: vi.fn(), error: vi.fn() });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(run).not.toHaveBeenCalled();
    busy = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(run).toHaveBeenCalledTimes(1);
    enabled = false;
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('does not run overlapping jobs and schedules one merged follow-up', async () => {
    let finish!: (value: StorageOverview) => void;
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(overview);
    scheduler = new MaintenanceScheduler({ enabled: () => true, busy: () => false, run, publish: vi.fn(), error: vi.fn() });
    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.schedule();
    scheduler.schedule();
    expect(run).toHaveBeenCalledTimes(1);
    finish(overview);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('reports errors and continues on the next trigger', async () => {
    const error = vi.fn(),
      run = vi.fn().mockRejectedValueOnce(new Error('IO failed')).mockResolvedValue(overview);
    scheduler = new MaintenanceScheduler({ enabled: () => true, busy: () => false, run, publish: vi.fn(), error });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(error).toHaveBeenCalledOnce();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
