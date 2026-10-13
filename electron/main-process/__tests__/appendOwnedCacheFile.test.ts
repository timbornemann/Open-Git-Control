import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendOwnedCacheFile } from '../appendOwnedCacheFile';
import { cacheFileIdentityAsync } from '../cacheFileIdentity';

let root: string, file: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-owned-append-'));
  file = path.join(root, 'records.jsonl');
});
afterEach(() => {
  vi.restoreAllMocks();
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-owned-append-')) throw new Error('Unsafe fixture');
  fs.rmSync(root, { recursive: true, force: true });
});

describe('owned cache appends', () => {
  it('creates exclusively, appends to the same file and returns its own identity', async () => {
    const first = await appendOwnedCacheFile(root, file, 'first\n', null);
    expect(first).toBe(await cacheFileIdentityAsync(file));
    const second = await appendOwnedCacheFile(root, file, 'second\n', first);
    expect(second).toBe(await cacheFileIdentityAsync(file));
    expect(fs.readFileSync(file, 'utf8')).toBe('first\nsecond\n');
  });

  it.each([false, true])('preserves a foreign file created before opening (previously present: %s)', async (present) => {
    if (present) fs.writeFileSync(file, 'original\n');
    const identity = await cacheFileIdentityAsync(file);
    const open = fs.promises.open;
    let release!: () => void,
      reached = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      if (String(args[0]) === file) {
        reached = true;
        await held;
      }
      return open(...args);
    });
    const writing = appendOwnedCacheFile(root, file, 'new record\n', identity);
    const rejected = expect(writing).rejects.toThrow();
    await vi.waitFor(() => expect(reached).toBe(true));
    fs.writeFileSync(file, 'foreign version\n');
    release();
    await rejected;
    expect(fs.readFileSync(file, 'utf8')).toBe('foreign version\n');
  });

  it('never claims a foreign path that replaces an already open cache', async () => {
    fs.writeFileSync(file, 'original\n');
    const identity = await cacheFileIdentityAsync(file);
    const open = fs.promises.open;
    vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (String(args[0]) === file) {
        const write = handle.writeFile.bind(handle);
        vi.spyOn(handle, 'writeFile').mockImplementation(async (...args) => {
          await fs.promises.rename(file, path.join(root, 'previous.jsonl'));
          await fs.promises.writeFile(file, 'foreign version\n');
          return write(...args);
        });
      }
      return handle;
    });
    await expect(appendOwnedCacheFile(root, file, 'new record\n', identity)).rejects.toThrow('changed during its append');
    expect(fs.readFileSync(file, 'utf8')).toBe('foreign version\n');
  });
});
