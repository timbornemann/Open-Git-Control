import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { GitService } from '../GitService';
import { fingerprintWorkingTreeIndex } from '../WorkingTreeIndexFingerprint';

const oid = 'a'.repeat(40);
const record = (path: string, blob = oid, stage = 0) => `100644 ${blob} ${stage}\t${path}\0`;
const paths = Array.from({ length: 1100 }, (_, i) => `source/long-file-name-${String(i).padStart(4, '0')}.txt`)
  .concat('source/Grüße[tab]\t.txt')
  .sort();
async function digest(service: Partial<GitService>, selected = paths, signal?: AbortSignal) {
  const hash = createHash('sha256');
  await fingerprintWorkingTreeIndex(service as GitService, '/repo', selected, hash, signal);
  return hash.digest('hex');
}
describe('working tree index fingerprint', () => {
  it('uses one NUL-safe stream for large selections and hashes the same records as targeted batches', async () => {
    const output = paths.map((file) => record(file)).join('') + record('unrelated/other.txt');
    const streamReadAtPath = vi.fn(async (_repo, _args, consume) => {
      const bytes = Buffer.from(output);
      for (let i = 0; i < bytes.length; i += 17) consume(bytes.subarray(i, i + 17));
    });
    const batchRead = vi.fn(async (_repo, args: string[]) =>
      args
        .slice(4)
        .map((value) => record(value.replace(/^:\(literal\)/, '')))
        .join(''),
    );
    const streamed = await digest({ streamReadAtPath });
    const targeted = await digest({ runPollingCommandAtPath: batchRead });
    expect(streamed).toBe(targeted);
    expect(streamReadAtPath).toHaveBeenCalledOnce();
    expect(batchRead.mock.calls.length).toBeGreaterThan(1);
  });

  it('retains exact blob IDs and conflict stages and ignores unrelated index changes', async () => {
    let output = record('file', oid, 1) + record('file', 'b'.repeat(40), 2) + record('other');
    const service = { runPollingCommandAtPath: vi.fn(async () => output) };
    const first = await digest(service, ['file']);
    output = output.replace(record('other'), record('other', 'c'.repeat(40)));
    expect(await digest(service, ['file'])).toBe(first);
    output = output.replace('b'.repeat(40), 'd'.repeat(40));
    expect(await digest(service, ['file'])).not.toBe(first);
  });

  it('rejects truncated streams instead of publishing a partial identity', async () => {
    const streamReadAtPath = vi.fn(async (_repo, _args, consume) => {
      consume(Buffer.from(record(paths[0]).slice(0, -1)));
    });
    await expect(digest({ streamReadAtPath })).rejects.toThrow('Incomplete Git index record');
  });

  it('stops parsing a cancelled stream', async () => {
    const controller = new AbortController();
    const streamReadAtPath = vi.fn(async (_repo, _args, consume) => {
      controller.abort();
      consume(Buffer.from(record(paths[0])));
    });
    await expect(digest({ streamReadAtPath }, paths, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
