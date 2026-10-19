import { describe, expect } from 'vitest';
import { inventoryTest, lfsPointer, pointerText } from './lfsInventoryFixture';

describe('foreground inventory reuse and priority', () => {
  inventoryTest('reuses a complete offline inventory when the foreground reader permits lazy fetching', async (f) => {
    const object = lfsPointer('offline asset');
    const head = await f.commit({ 'asset.bin': pointerText(object) });
    expect(
      await f.inventory.read(f.repo, [head], f.runner, {
        signal: f.lifecycle.signal,
        requestedKind: 'preflight',
        envOverrides: { GIT_NO_LAZY_FETCH: '1' },
      }),
    ).toEqual([object]);
    f.inspect.mockClear();
    expect(await f.inventory.read(f.repo, [head], f.runner, { signal: f.lifecycle.signal })).toEqual([object]);
    expect(f.objectWalks()).toHaveLength(0);
  });

  inventoryTest('reuses a matching in-flight idle inventory without a second historical object walk', async (f) => {
    const object = lfsPointer('asset');
    const head = await f.commit({ 'asset.bin': pointerText(object) });
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.inspect.mockImplementation(async (...args) => {
      if (args[1].includes('--objects')) {
        entered();
        await gate;
      }
      return f.runBuffer(...args);
    });
    const idle = f.inventory.read(f.repo, [head], f.runner, { requestedKind: 'preflight', signal: f.lifecycle.signal });
    await ready;
    const push = f.inventory.read(f.repo, [head], f.runner, { signal: f.lifecycle.signal });
    release();
    expect(await idle).toEqual([object]);
    expect(await push).toEqual([object]);
    expect(f.objectWalks()).toHaveLength(1);
  });

  inventoryTest('preempts an unrelated idle inventory instead of blocking a push to another source', async (f) => {
    const first = await f.commit({ plain: 'first\n' });
    const second = await f.commit({ plain: 'second\n' });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let blocked = false;
    f.inspect.mockImplementation(async (...args) => {
      if (!blocked && args[1].includes('--objects')) {
        blocked = true;
        entered();
        await new Promise<void>((_resolve, reject) => {
          args[2].signal!.addEventListener('abort', () => reject(args[2].signal!.reason), { once: true });
        });
      }
      return f.runBuffer(...args);
    });
    const idle = f.inventory.read(f.repo, [first], f.runner, { requestedKind: 'preflight', signal: f.lifecycle.signal });
    const cancelled = expect(idle).rejects.toMatchObject({ name: 'AbortError' });
    await ready;
    const push = f.inventory.read(f.repo, [second], f.runner, { signal: f.lifecycle.signal });
    await cancelled;
    expect(await push).toEqual([]);
  });
});
