import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitStatsDiskCache, statsCacheKey, type StatsCacheEntry } from '../CommitStatsDiskCache';

let root: string, file: string, cache: CommitStatsDiskCache;
const entry = (i: number, accessedAt = i): StatsCacheEntry => ({
  schema: 2,
  namespace: 'e'.repeat(64),
  objectFormat: 'sha1',
  hash: i.toString(16).padStart(40, '0'),
  stats: { files: 1, additions: i, deletions: 0 },
  accessedAt,
});
const key = (record: StatsCacheEntry) => statsCacheKey(record.namespace, record.objectFormat, record.hash);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-stats-disk-'));
  file = path.join(root, 'stats.jsonl');
  cache = new CommitStatsDiskCache(() => file, { compactedEntries: 1 });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cache.dispose();
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-stats-disk-')) throw new Error('Unsafe fixture');
  fs.rmSync(root, { recursive: true, force: true });
});

describe('streamed commit statistics cache', () => {
  it('also bounds memory after a disk write failure without retrying the protected path', async () => {
    cache = new CommitStatsDiskCache(() => file, { maxEntries: 2, compactedEntries: 1 });
    await cache.load();
    const open = vi.spyOn(fs.promises, 'open').mockRejectedValue(Object.assign(new Error('Access denied'), { code: 'EACCES' }));
    await expect(cache.append(entry(1))).rejects.toThrow('Access denied');
    await cache.append(entry(2));
    await cache.append(entry(3));
    expect(cache.entries.size).toBe(1);
    expect(cache.entries.get(key(entry(3)))?.stats).toEqual(entry(3).stats);
    expect(open).toHaveBeenCalledOnce();
    expect(fs.existsSync(file)).toBe(false);
  });
  it('bounds session memory even when an unsupported disk cache remains protected', async () => {
    const foreign = '{"schema":99,"owner":"preserve"}\n';
    fs.writeFileSync(file, foreign);
    cache = new CommitStatsDiskCache(() => file, { maxEntries: 2, compactedEntries: 1 });
    await cache.load();
    for (let i = 1; i <= 3; i++) await cache.append(entry(i));
    expect(cache.entries.size).toBe(1);
    expect(cache.entries.get(key(entry(3)))?.stats).toEqual(entry(3).stats);
    expect(fs.readFileSync(file, 'utf8')).toBe(foreign);
  });
  it('allows other event-loop work while sharing a cold load between requests', async () => {
    fs.writeFileSync(file, Array.from({ length: 4096 }, (_, i) => JSON.stringify(entry(i))).join('\n'));
    let ticked = false;
    setImmediate(() => {
      ticked = true;
    });
    await Promise.all([cache.load(), cache.load()]);
    expect(ticked).toBe(true);
    expect(cache.entries.size).toBe(4096);
    expect(cache.entries.get(key(entry(4095)))?.stats.additions).toBe(4095);
  });

  it('keeps results and accesses arriving during asynchronous compaction', async () => {
    const first = entry(1),
      second = entry(2),
      third = entry(3);
    fs.writeFileSync(file, [first, second, third].map((record) => JSON.stringify(record)).join('\n'));
    await cache.load();
    const rename = fs.promises.rename;
    let release!: () => void;
    let reached = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (...args) => {
      if (String(args[1]) === file && !reached) {
        reached = true;
        await held;
      }
      return rename(...args);
    });
    const compacting = cache.maintain(false, 0);
    await vi.waitFor(() => expect(reached).toBe(true));
    cache.touch(cache.entries.get(key(first))!);
    const fresh = entry(4, cache.nextAccessedAt());
    const writing = cache.append(fresh);
    release();
    await Promise.all([compacting, writing]);
    expect(cache.entries.has(key(first))).toBe(true);
    expect(cache.entries.has(key(second))).toBe(false);
    expect(cache.entries.has(key(fresh))).toBe(true);
    const saved = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(saved.map((record) => record.hash)).toEqual([third.hash, fresh.hash]);
  });

  it('isolates an interrupted final record from the next complete append', async () => {
    fs.writeFileSync(file, '{"schema":2,"hash":');
    await cache.load();
    await cache.append(entry(1));
    const restarted = new CommitStatsDiskCache(() => file);
    await restarted.load();
    expect(restarted.entries.get(key(entry(1)))?.stats).toEqual(entry(1).stats);
    await restarted.dispose();
  });
});
