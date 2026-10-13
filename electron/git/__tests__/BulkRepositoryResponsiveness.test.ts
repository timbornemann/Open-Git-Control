import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectLfsFiles, type LfsReader } from '../GitLfsInspection';
import { WorkingTreeService } from '../../WorkingTreeService';

let root: string;
const files = Array.from({ length: 512 }, (_, index) => `file-${index}.txt`);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-bulk-responsive-'));
  for (const file of files) fs.writeFileSync(path.join(root, file), `${file}\n`);
});
afterEach(() => {
  if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-bulk-responsive-')) throw new Error('Unexpected fixture root.');
  fs.rmSync(root, { recursive: true, force: true });
});

describe('bulk repository responsiveness', () => {
  it('keeps handling event-loop work during working-file LFS inspection', async () => {
    let ticked = false;
    const timer = setTimeout(() => {
      ticked = true;
    }, 0);
    try {
      const result = await inspectLfsFiles(
        root,
        files.map((path) => ({ path, source: 'unstaged' })),
        {
          run: async () => '',
          input: async () => '',
          prefix: async () => Buffer.alloc(0),
        },
      );
      expect(ticked).toBe(true);
      expect(result).toHaveLength(files.length);
      expect(result.every((file) => file.state.eligible && file.state.bytes > 0)).toBe(true);
    } finally {
      clearTimeout(timer);
    }
  }, 30_000);

  it('reads hundreds of distinct staged small blobs in batches and still yields', async () => {
    const blobs = new Map(files.map((file) => [createHash('sha1').update(file).digest('hex'), Buffer.from(`${file}\n`)]));
    const entries = [...blobs.keys()].map((oid, index) => `H 100644 ${oid} 0\t${files[index]}\0`).join('');
    const reader: LfsReader = {
      run: vi.fn(async (_repo, args) => (args[0] === 'ls-files' ? entries : '')),
      input: vi.fn(async (_repo, args, input) =>
        args[0] === 'cat-file'
          ? String(input)
              .trim()
              .split('\n')
              .map((oid) => `${oid} blob ${blobs.get(oid)!.length}\n`)
              .join('')
          : '',
      ),
      prefix: vi.fn(async (_repo, _args, _max, input) =>
        Buffer.concat(
          String(input)
            .trim()
            .split('\n')
            .flatMap((oid) => [Buffer.from(`${oid} blob ${blobs.get(oid)!.length}\n`), blobs.get(oid)!, Buffer.from('\n')]),
        ),
      ),
    };
    let ticked = false;
    const timer = setTimeout(() => {
      ticked = true;
    }, 0);
    try {
      const result = await inspectLfsFiles(
        root,
        files.map((path) => ({ path, source: 'staged' })),
        reader,
      );
      expect(result.every((file) => file.state.eligible && file.state.bytes > 0)).toBe(true);
      expect(reader.prefix).toHaveBeenCalledTimes(2);
      expect(vi.mocked(reader.input).mock.calls.filter(([, args]) => args[0] === 'cat-file')).toHaveLength(2);
      expect(vi.mocked(reader.run).mock.calls.some(([, args]) => args[0] === 'cat-file')).toBe(false);
      expect(ticked).toBe(true);
    } finally {
      clearTimeout(timer);
    }
  });

  it('batches index fingerprints while retaining exact staged identities and file changes', async () => {
    let index = '100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\tfile-0.txt\0';
    const runPollingCommandAtPath = vi.fn(async () => index);
    const service = new WorkingTreeService({
      getRepoPath: () => root,
      getStatusPorcelainAtPath: async () => files.map((file) => `A  ${file}`).join('\n'),
      runPollingCommandAtPath,
    } as any);
    const first = await service.getSnapshot();
    expect(first.changeCount).toBe(files.length);
    expect(runPollingCommandAtPath).toHaveBeenCalledTimes(2);
    index = index.replace(/a{40}/, 'b'.repeat(40));
    expect((await service.getSnapshot()).snapshotId).not.toBe(first.snapshotId);
  }, 30_000);
});
