import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitLfsInspectionCache } from '../GitLfsInspectionCache';
import { lfsStatusFixture } from './lfsStatusFixture';

let f: ReturnType<typeof lfsStatusFixture>;
beforeEach(() => {
  f = lfsStatusFixture();
});
afterEach(() => {
  vi.restoreAllMocks();
  f.cleanup();
});

describe('LFS preview cache freshness and bounds', () => {
  it('keeps only bounded recently used values and does not retain oversized records', () => {
    const cache = new GitLfsInspectionCache(400);
    cache.set('first', 1);
    cache.set('second', 2);
    expect(cache.get('first')).toBe(1);
    cache.set('third', 3);
    expect(cache.get('first')).toBe(1);
    expect(cache.get('second')).toBeUndefined();
    cache.set('large', 'x'.repeat(1000));
    expect(cache.get('large')).toBeUndefined();
    expect(cache.get('third')).toBe(3);
  });

  it('does not cache an index read across atomic replacement, and bypasses reuse for split indexes', async () => {
    const cache = new GitLfsInspectionCache();
    await cache.index(f.root, f.reader);
    await cache.index(f.root, f.reader);
    const indexReads = () => f.reader.run.mock.calls.filter(([, args]) => args[0] === 'ls-files').length;
    expect(indexReads()).toBe(1);
    const before = fs.statSync(f.index);
    f.write('.git/new-index', 'index-0');
    fs.utimesSync(path.join(f.gitDir, 'new-index'), before.atime, before.mtime);
    fs.renameSync(path.join(f.gitDir, 'new-index'), f.index);
    await cache.index(f.root, f.reader);
    expect(indexReads()).toBe(2);
    f.write('.git/sharedindex.test', 'split');
    await cache.index(f.root, f.reader);
    await cache.index(f.root, f.reader);
    expect(indexReads()).toBe(4);
  });

  it('never publishes a file cache value when the file changes during its read', async () => {
    const target = f.write('file.txt', 'before');
    const cache = new GitLfsInspectionCache();
    const load = vi.fn(async () => {
      f.write('file.txt', 'after');
      return 'read while changing';
    });
    await cache.file(target, load);
    const stable = vi.fn(async () => 'current');
    expect(await cache.file(target, stable)).toBe('current');
    expect(await cache.file(target, stable)).toBe('current');
    expect(stable).toHaveBeenCalledTimes(1);
  });

  it('does not cache missing/unreadable files and revalidates paths rather than trusting a prior safe target', async () => {
    const cache = new GitLfsInspectionCache();
    const read = vi.fn(async () => 'value');
    await cache.file(path.join(f.root, 'missing'), read);
    await cache.file(path.join(f.root, 'missing'), read);
    expect(read).toHaveBeenCalledTimes(2);
    f.write('folder/file.txt', 'content');
    const file = { path: 'folder/file.txt', source: 'unstaged' as const };
    expect((await f.status([file])).files[0].eligible).toBe(true);
    fs.renameSync(path.join(f.root, 'folder'), path.join(f.root, 'target'));
    fs.symlinkSync(path.join(f.root, 'target'), path.join(f.root, 'folder'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(f.status([file])).rejects.toThrow(/symbolic link/);
  });

  it('does not publish samples when replacement refs change during inspection', async () => {
    const file = { path: 'file.bin', source: 'staged' as const };
    f.stage(file.path, f.blob('content'));
    const original = f.reader.prefix.getMockImplementation()!;
    f.reader.prefix.mockImplementationOnce(async (...args) => {
      f.context.replacements = 'changed';
      return original(...args);
    });
    await expect(f.status([file])).rejects.toThrow(/replacements changed/);
    f.context.replacements = '';
    await f.status([file]);
    expect(f.reader.prefix).toHaveBeenCalledTimes(2);
  });

  it('does not retain failed blob samples', async () => {
    const file = { path: 'file.bin', source: 'staged' as const };
    f.stage(file.path, f.blob('content'));
    f.reader.prefix.mockRejectedValueOnce(new Error('temporary Git failure'));
    await expect(f.status([file])).rejects.toThrow('temporary Git failure');
    expect((await f.status([file])).files[0].eligible).toBe(true);
    expect(f.reader.prefix).toHaveBeenCalledTimes(2);
  });

  it('rejects truncated large samples without caching them', async () => {
    const file = { path: 'file.bin', source: 'staged' as const };
    f.stage(file.path, f.blob(Buffer.from([0]), 12 * 1024 * 1024));
    f.reader.prefix.mockResolvedValueOnce(Buffer.from([0]));
    await expect(f.status([file])).rejects.toThrow(/Incomplete/);
    expect((await f.status([file])).files[0].recommendation).toBe('binary');
    expect(f.reader.prefix).toHaveBeenCalledTimes(2);
  });
});
