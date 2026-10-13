import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyIndexIfPresent, indexFileHash } from '../IndexFileIO';
import { withPrivateIndex } from '../PrivateIndex';
import type { CommitEditGit } from '../CommitEditGit';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-index-io-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-index-io-')) throw new Error('Unsafe fixture');
  fs.rmSync(root, { recursive: true, force: true });
});

describe('asynchronous index files', () => {
  it('hashes a large index in bounded reads and allows the event loop to run', async () => {
    const file = path.join(root, 'index');
    const chunk = Buffer.alloc(64 * 1024, 'index-data');
    const expected = createHash('sha256');
    const fd = fs.openSync(file, 'wx');
    try {
      for (let i = 0; i < 256; i++) {
        fs.writeSync(fd, chunk);
        expected.update(chunk);
      }
    } finally {
      fs.closeSync(fd);
    }
    const open = fs.promises.open;
    const reads: unknown[][][] = [];
    vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      reads.push(vi.spyOn(handle, 'read').mock.calls as unknown[][]);
      return handle;
    });
    let ticked = false;
    setTimeout(() => {
      ticked = true;
    }, 0);
    expect(await indexFileHash(file)).toBe(expected.digest('hex'));
    const lengths = reads.flat().map((args) => args[2] as number);
    expect(ticked).toBe(true);
    expect(lengths.length).toBeGreaterThan(256);
    expect(lengths.every((length) => length <= 64 * 1024)).toBe(true);
  });

  it('distinguishes an absent index, an empty index and non-files', async () => {
    expect(await indexFileHash(path.join(root, 'missing'))).toBeNull();
    const file = path.join(root, 'empty');
    fs.writeFileSync(file, '');
    expect(await indexFileHash(file)).toBe(createHash('sha256').digest('hex'));
    await expect(indexFileHash(root)).rejects.toThrow();
    const destination = path.join(root, 'copy');
    expect(await copyIndexIfPresent(path.join(root, 'missing'), destination)).toBeNull();
    expect(await copyIndexIfPresent(file, destination)).not.toBeNull();
    expect(fs.readFileSync(destination)).toEqual(Buffer.alloc(0));
  });

  it.each(['foreign index', 'cancellation'] as const)('keeps the real index intact after %s during asynchronous preparation', async (change) => {
    const real = path.join(root, 'index');
    fs.writeFileSync(real, 'original index');
    const controller = new AbortController();
    const git = {
      signal: controller.signal,
      run: vi.fn().mockImplementation(async (_repo, args) => (args[0] === 'rev-parse' ? real : '')),
    } as unknown as CommitEditGit;
    let validations = 0;
    const result = withPrivateIndex(git, root, async (index, publish) => {
      await fs.promises.writeFile(index, 'prepared index');
      await publish(async () => {
        if (++validations !== 2) return;
        if (change === 'foreign index') await fs.promises.writeFile(real, 'foreign index');
        else controller.abort();
      });
    });
    await expect(result).rejects.toThrow(change === 'foreign index' ? 'index changed outside the lock' : 'aborted');
    expect(fs.readFileSync(real, 'utf8')).toBe(change === 'foreign index' ? 'foreign index' : 'original index');
    expect(fs.existsSync(`${real}.lock`)).toBe(false);
  });
});
