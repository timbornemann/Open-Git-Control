import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readBoundedTextFile, readBoundedTextFileAsync } from '../boundedTextFile';

vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('fs')>()) }));

describe('bounded regular-file reads', () => {
  let directory: string;
  let file: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-bounded-read-'));
    file = path.join(directory, 'data.txt');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('accepts an exact byte limit and decodes multi-byte text', async () => {
    fs.writeFileSync(file, 'ä'.repeat(40_000));
    expect(readBoundedTextFile(file, 80_000, 'Data')).toBe('ä'.repeat(40_000));
    expect(await readBoundedTextFileAsync(file, 80_000, 'Data')).toBe('ä'.repeat(40_000));
  });

  it('rejects oversized files before opening them', async () => {
    fs.writeFileSync(file, '12345');
    const open = vi.spyOn(fs, 'openSync');
    const openAsync = vi.spyOn(fs.promises, 'open');
    expect(() => readBoundedTextFile(file, 4, 'Data')).toThrow('too large');
    await expect(readBoundedTextFileAsync(file, 4, 'Data')).rejects.toThrow('too large');
    expect(open).not.toHaveBeenCalled();
    expect(openAsync).not.toHaveBeenCalled();
  });

  it('bounds the actual read even when stat underreports the size', () => {
    fs.writeFileSync(file, '123456789');
    const stat = fs.statSync(file);
    const reported = Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { size: 1 }) as fs.Stats;
    vi.spyOn(fs, 'lstatSync').mockReturnValue(reported);
    vi.spyOn(fs, 'fstatSync').mockReturnValue(reported);
    const read = vi.spyOn(fs, 'readSync');
    const close = vi.spyOn(fs, 'closeSync');
    expect(() => readBoundedTextFile(file, 4, 'Data')).toThrow('too large');
    expect((read.mock.calls[0] as unknown[])[3]).toBe(5);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects directories instead of opening special entries', async () => {
    expect(() => readBoundedTextFile(directory, 100, 'Data')).toThrow('regular file');
    await expect(readBoundedTextFileAsync(directory, 100, 'Data')).rejects.toThrow('regular file');
  });
});
