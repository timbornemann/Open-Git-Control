import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJsonlLines, streamJsonlLines } from '../boundedJsonl';

describe('bounded JSONL decoding', () => {
  let root: string, file: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-jsonl-test-'));
    file = path.join(root, 'records');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-jsonl-test-')) throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true });
  });
  it('preserves UTF-8 across buffer boundaries, CRLF and an unfinished final line', async () => {
    const long = 'x'.repeat(65535) + 'ä🙂';
    fs.writeFileSync(file, `${long}\r\n\nlast`);
    const asyncLines = [];
    for await (const line of streamJsonlLines(file)) asyncLines.push(line);
    expect([...readJsonlLines(file)]).toEqual([long, '', 'last']);
    expect(asyncLines).toEqual([long, '', 'last']);
  });
  it('stops oversized records while closing file handles', async () => {
    const fd = fs.openSync(file, 'w');
    fs.ftruncateSync(fd, 9 * 1024 ** 2);
    fs.closeSync(fd);
    expect(() => [...readJsonlLines(file)]).toThrow('oversized');
    await expect(
      (async () => {
        for await (const _line of streamJsonlLines(file)) {
          /* Consume until the limit. */
        }
      })(),
    ).rejects.toThrow('oversized');
    fs.unlinkSync(file);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('copies a large multi-chunk record only once rather than its growing prefix on every chunk', async () => {
    const line = '🙂'.repeat(512 * 1024);
    fs.writeFileSync(file, `${line}\nlast`);
    const concat = Buffer.concat;
    let copied = 0;
    vi.spyOn(Buffer, 'concat').mockImplementation((chunks, total) => {
      copied += total ?? chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      return concat(chunks, total);
    });
    const result = [];
    for await (const record of streamJsonlLines(file)) result.push(record);
    expect(result).toEqual([line, 'last']);
    expect(copied).toBeLessThan(Buffer.byteLength(line) * 2);
    expect([...readJsonlLines(file)]).toEqual([line, 'last']);
  });
});
