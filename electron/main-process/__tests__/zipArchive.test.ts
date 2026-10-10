import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Writable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createZipArchive, type ZipArchiveEntry } from '../zipArchive';

vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal<typeof fs>()) }));

describe('ZIP output errors', () => {
  let directory: string;
  let target: string;
  let entries: ZipArchiveEntry[];
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-zip-errors-'));
    target = path.join(directory, 'archive.zip');
    const source = path.join(directory, 'source.txt');
    fs.writeFileSync(source, 'source content');
    entries = [{ sourcePath: source, archivePath: 'source.txt', kind: 'file', modifiedAt: new Date() }];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('rejects an exclusive-open collision without an uncaught error or overwriting the file', async () => {
    fs.writeFileSync(target, 'existing archive');
    await expect(createZipArchive(target, entries)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(fs.readFileSync(target, 'utf8')).toBe('existing archive');
  });

  it('rejects a missing target folder instead of crashing or hanging', async () => {
    await expect(createZipArchive(path.join(directory, 'missing', 'archive.zip'), entries)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects output failures after opening while source reads are in progress', async () => {
    const diskFull = Object.assign(new Error('Disk is full'), { code: 'ENOSPC' });
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback(diskFull);
      },
    });
    vi.spyOn(fs, 'createWriteStream').mockReturnValue(output as fs.WriteStream);
    process.nextTick(() => output.emit('open', 123));
    await expect(createZipArchive(target, entries)).rejects.toBe(diskFull);
    expect(output.destroyed).toBe(true);
  });
});
