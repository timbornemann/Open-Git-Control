import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingTreeRefreshSchedule, workingTreeRefreshDelay, type WorkingTreeRefreshInputs } from '../workingTreeRefreshSchedule';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const small = { detailed: true, large: false, recursiveWatch: true };

describe('working tree refresh scheduling', () => {
  it.each([
    [small, [5000, 10000, 20000, 40000, 60000, 60000]],
    [{ ...small, large: true }, [15000, 30000, 60000, 60000, 60000, 60000]],
    [{ ...small, recursiveWatch: false }, [5000, 10000, 15000, 15000, 15000, 15000]],
    [{ ...small, large: true, recursiveWatch: false }, [15000, 30000, 30000, 30000, 30000, 30000]],
    [{ ...small, detailed: false }, [30000, 60000, 120000, 120000, 120000, 120000]],
  ] satisfies [WorkingTreeRefreshInputs, number[]][])('bounds idle checks for %j', (inputs, expected) => {
    expect(expected.map((_, index) => workingTreeRefreshDelay(inputs, index))).toEqual(expected);
  });

  it('backs off unchanged reads and resets after a real change', async () => {
    let version = 'a';
    const read = vi.fn(async () => {});
    const schedule = new WorkingTreeRefreshSchedule(
      read,
      () => version,
      () => small,
      () => true,
    );
    schedule.start();
    await vi.advanceTimersByTimeAsync(0);
    for (const delay of [5000, 10000, 20000, 40000, 60000]) {
      const calls = read.mock.calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(read).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(read).toHaveBeenCalledTimes(calls + 1);
    }
    version = 'b';
    schedule.changed();
    await vi.advanceTimersByTimeAsync(500);
    const calls = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4999);
    expect(read).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(calls + 1);
    schedule.dispose();
  });

  it('coalesces event storms and queues only one follow-up behind an in-flight read', async () => {
    let finish!: () => void;
    const read = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const schedule = new WorkingTreeRefreshSchedule(
      read,
      () => 'a',
      () => ({ ...small, large: true }),
      () => true,
    );
    schedule.start();
    for (let i = 0; i < 40; i++) schedule.changed();
    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(499);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 40; i++) schedule.changed();
    await vi.advanceTimersByTimeAsync(1499);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    schedule.dispose();
  });

  it('does no work while hidden and refreshes on resume without reviving disposed schedules', async () => {
    let visible = false;
    const read = vi.fn(async () => {});
    const schedule = new WorkingTreeRefreshSchedule(
      read,
      () => 'a',
      () => small,
      () => visible,
    );
    schedule.start();
    await vi.advanceTimersByTimeAsync(120000);
    expect(read).not.toHaveBeenCalled();
    visible = true;
    schedule.resumed();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    visible = false;
    schedule.hidden();
    schedule.changed();
    await vi.advanceTimersByTimeAsync(120000);
    expect(read).toHaveBeenCalledTimes(1);
    visible = true;
    schedule.resumed();
    schedule.dispose();
    await vi.advanceTimersByTimeAsync(120000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not back off failed reads and never reschedules a late completion after disposal', async () => {
    let finish!: () => void;
    const read = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
    const schedule = new WorkingTreeRefreshSchedule(
      read,
      () => 'a',
      () => small,
      () => true,
    );
    schedule.start();
    await vi.advanceTimersByTimeAsync(10000);
    expect(read).toHaveBeenCalledTimes(3);
    schedule.dispose();
    finish();
    await vi.advanceTimersByTimeAsync(120000);
    expect(read).toHaveBeenCalledTimes(3);
  });
});
