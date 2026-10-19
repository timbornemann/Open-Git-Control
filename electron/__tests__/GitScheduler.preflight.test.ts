import { describe, expect, it } from 'vitest';
import { GitScheduler } from '../GitScheduler';

describe('idle push preparation scheduling', () => {
  it('allows interactive reads without discarding in-progress preparation', async () => {
    const scheduler = new GitScheduler();
    let finish!: () => void;
    let signal!: AbortSignal;
    const preparation = scheduler.schedule('/repo', 'preflight', 'show', async (active) => {
      signal = active;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return 'prepared';
    });
    expect(await scheduler.schedule('/repo', 'interactive', 'diff', async () => 'diff')).toBe('diff');
    expect(signal.aborted).toBe(false);
    finish();
    expect(await preparation).toBe('prepared');
  });

  it('cancels preparation for a local write and waits for its resources to close', async () => {
    const scheduler = new GitScheduler();
    let release!: () => void;
    let signal!: AbortSignal;
    const preparation = scheduler.schedule('/repo', 'preflight', 'cat-file', async (active) => {
      signal = active;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      active.throwIfAborted();
    });
    let written = false;
    const write = scheduler.schedule('/repo', 'write', 'add', async () => {
      written = true;
    });
    expect(signal.aborted).toBe(true);
    expect(written).toBe(false);
    release();
    await expect(preparation).rejects.toMatchObject({ name: 'AbortError' });
    await write;
    expect(written).toBe(true);
  });
});
