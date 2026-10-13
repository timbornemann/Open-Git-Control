import * as cp from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runGitChunkStream } from '../GitChunkStream';

vi.mock('node:child_process', async (original) => ({ ...(await original<typeof cp>()), spawn: vi.fn((await original<typeof cp>()).spawn) }));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(() => {
  vi.clearAllMocks();
});

describe('asynchronous Git stream consumers', () => {
  it('waits for the final consumer even when Git has already exited', async () => {
    const ready = deferred(),
      release = deferred(),
      closed = deferred();
    let settled = false;
    const command = runGitChunkStream(
      process.cwd(),
      ['--version'],
      async () => {
        ready.resolve();
        await release.promise;
      },
      new AbortController().signal,
    );
    const child = vi.mocked(cp.spawn).mock.results[0].value as cp.ChildProcess;
    child.once('close', closed.resolve);
    void command.then(() => {
      settled = true;
    });
    try {
      await ready.promise;
      await closed.promise;
      expect(settled).toBe(false);
    } finally {
      release.resolve();
      await command;
    }
  });

  it('reports asynchronous consumer failures rather than an unhandled rejection', async () => {
    const ready = deferred(),
      release = deferred();
    const command = runGitChunkStream(
      process.cwd(),
      ['--version'],
      async () => {
        ready.resolve();
        await release.promise;
        throw new Error('Consumer failed.');
      },
      new AbortController().signal,
    );
    const rejected = expect(command).rejects.toThrow('Consumer failed.');
    await ready.promise;
    release.resolve();
    await rejected;
  });

  it('applies backpressure so a slow consumer processes only one chunk at a time', async () => {
    let active = 0,
      peak = 0,
      chunks = 0;
    const input = Array.from({ length: 16_384 }, (_, i) => `audit-${i}.txt`).join('\n') + '\n';
    await runGitChunkStream(
      process.cwd(),
      ['check-attr', '--stdin', 'filter'],
      async () => {
        peak = Math.max(peak, ++active);
        chunks++;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        active--;
      },
      new AbortController().signal,
      input,
    );
    expect(chunks).toBeGreaterThan(1);
    expect(peak).toBe(1);
    expect(active).toBe(0);
  }, 30_000);
});
