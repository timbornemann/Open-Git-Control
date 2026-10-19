import { describe, expect, vi } from 'vitest';
import { inventoryTest, lfsPointer, pointerText } from './lfsInventoryFixture';
import { classifyLfsObjects } from '../GitLfsPointers';
import * as childProcess from 'node:child_process';
import { fastImportHistory } from './gitFixtureHistory';
import * as fs from 'node:fs';
import * as path from 'node:path';
type ChildProcessModule = typeof childProcess;

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<ChildProcessModule>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

describe('persistent Git object reader', () => {
  inventoryTest('classifies more than two metadata batches using two native processes, without reading large blobs', async (f) => {
    const pointer = lfsPointer('LFS text');
    const files = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`file-${index}.txt`, `Content ${index}\n`]));
    await f.runner.runWithInput(
      f.repo,
      ['fast-import', '--quiet'],
      fastImportHistory(
        [{ message: 'Batch objects', files: { ...files, 'large.bin': 'a'.repeat(2 * 1024 * 1024), 'pointer.bin': pointerText(pointer) } }],
        'LFS Inventory <lfs-inventory@example.test>',
        f.base,
      ),
      { signal: f.lifecycle.signal },
    );
    const oids = (await f.git('ls-tree', '-r', '--format=%(objectname)', 'HEAD')).split(/\r?\n/);
    const spawn = vi.mocked(childProcess.spawn).mockClear();
    const result = await classifyLfsObjects(f.repo, oids, f.runner, { signal: f.lifecycle.signal });
    expect(result.size).toBe(603);
    expect([...result.values()].filter(Boolean)).toEqual([pointer]);
    const processes = spawn.mock.calls.filter(([, args]) => args?.[0] === 'cat-file');
    expect(processes.map(([, args]) => args?.[1])).toEqual(['--batch-check=%(objectname) %(objecttype) %(objectsize)', '--batch']);
    expect(spawn.mock.results.every(({ value }) => value.exitCode !== null)).toBe(true);
  });

  inventoryTest('uses the native reader for a complete inventory and extends it after another commit', async (f) => {
    const first = lfsPointer('first');
    const head = await f.commit({ 'asset.bin': pointerText(first), plain: 'text\n' });
    const read = (refs: string[]) => f.inventory.read(f.repo, refs, f.runner, { signal: f.lifecycle.signal });
    expect(await read([head])).toEqual([first]);
    const next = lfsPointer('second');
    const changed = await f.commit({ 'other.bin': pointerText(next) });
    expect(await read([changed])).toEqual([first, next].sort((a, b) => a.oid.localeCompare(b.oid)));
  });

  inventoryTest('rejects a missing object rather than caching it as a non-pointer and releases all readers', async (f) => {
    const oid = await f.git('rev-parse', 'HEAD:README.md');
    const spawn = vi.mocked(childProcess.spawn).mockClear();
    await expect(classifyLfsObjects(f.repo, [oid, 'f'.repeat(40)], f.runner, { signal: f.lifecycle.signal })).rejects.toThrow('unavailable');
    expect(
      spawn.mock.results.filter(({ value }) => value.spawnargs?.[1] === 'cat-file').every(({ value }) => value.exitCode !== null || value.signalCode !== null),
    ).toBe(true);
    expect(await classifyLfsObjects(f.repo, [oid], f.runner, { signal: f.lifecycle.signal })).toEqual(new Map([[oid, null]]));
  });

  inventoryTest('cancels a queued inspection without starting another process', async (f) => {
    let release!: () => void;
    const blocked = f.runner.schedule(
      f.repo,
      'write',
      'fixture',
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = classifyLfsObjects(f.repo, ['f'.repeat(40)], f.runner, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    release();
    await blocked;
  });

  inventoryTest('terminates an active stalled object reader before rejecting cancellation', async (f) => {
    const actual = await vi.importActual<ChildProcessModule>('node:child_process');
    const spawn = vi.mocked(childProcess.spawn).mockClear();
    spawn.mockImplementationOnce((_file, _args, options) =>
      actual.spawn(process.execPath, ['-e', 'process.stdin.resume(); setInterval(() => {}, 1000);'], options!),
    );
    const controller = new AbortController();
    const pending = classifyLfsObjects(f.repo, ['f'.repeat(40)], f.runner, { signal: controller.signal });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    const child = spawn.mock.results[0].value;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });

  inventoryTest('releases both readers before reporting cancellation between batches and permits repository cleanup', async (f) => {
    const files = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`batch-${index}.txt`, `Content ${index}\n`]));
    await f.runner.runWithInput(
      f.repo,
      ['fast-import', '--quiet'],
      fastImportHistory([{ message: 'Cancel batch', files }], 'Fixture <fixture@example.test>', f.base),
      {
        signal: f.lifecycle.signal,
      },
    );
    const oids = (await f.git('ls-tree', '-r', '--format=%(objectname)', 'HEAD')).split(/\r?\n/);
    const spawn = vi.mocked(childProcess.spawn).mockClear();
    const controller = new AbortController();
    let resume!: () => void;
    let started!: () => void;
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const firstBatch = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = f.runner.inspectLfsObjects(f.repo, oids, { signal: controller.signal }, async () => {
      started();
      await paused;
    });
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await firstBatch;
    controller.abort();
    resume();
    await cancelled;
    const readers = spawn.mock.results.map(({ value }) => value).filter((child) => child.spawnargs?.[1] === 'cat-file');
    expect(readers).toHaveLength(2);
    expect(readers.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true);
    const moved = path.join(f.root, 'released-repo');
    if (![f.repo, moved].every((target) => path.dirname(path.resolve(target)) === path.resolve(f.root))) throw new Error('Unsafe fixture move');
    await fs.promises.rename(f.repo, moved);
    await fs.promises.rename(moved, f.repo);
  });

  inventoryTest('rejects malformed metadata and can immediately open a clean reader afterwards', async (f) => {
    const oid = await f.git('rev-parse', 'HEAD:README.md');
    const actual = await vi.importActual<ChildProcessModule>('node:child_process');
    vi.mocked(childProcess.spawn).mockImplementationOnce((_file, _args, options) =>
      actual.spawn(process.execPath, ['-e', 'process.stdin.once("data", () => process.stdout.write("malformed\\n"));'], options!),
    );
    await expect(classifyLfsObjects(f.repo, [oid], f.runner, { signal: f.lifecycle.signal })).rejects.toThrow('Invalid');
    expect(await classifyLfsObjects(f.repo, [oid], f.runner, { signal: f.lifecycle.signal })).toEqual(new Map([[oid, null]]));
  });
});
