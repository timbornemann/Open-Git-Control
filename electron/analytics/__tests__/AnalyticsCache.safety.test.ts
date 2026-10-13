import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsCache } from '../AnalyticsCache';
import { STORAGE_BUDGETS } from '../../../src/shared/ipc/storageMaintenance';

describe('analytics cache ownership, byte limits and external changes', () => {
  let fixture: string, root: string, repo: string, cache: AnalyticsCache;
  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-analytics-safety-test-'));
    root = path.join(fixture, 'cache');
    repo = path.join(fixture, 'repo');
    fs.mkdirSync(repo);
    cache = new AnalyticsCache(root, repo, 'context');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (path.dirname(fixture) !== os.tmpdir() || !path.basename(fixture).startsWith('ogc-analytics-safety-test-')) throw new Error('Unsafe fixture');
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  const classified = (oid: string) => JSON.stringify({ type: 'classified', value: { oid } });
  it('keeps unsupported replacement data untouched while returning newly calculated data in memory', async () => {
    await cache.load();
    const file = path.join(cache.directory, 'records.jsonl');
    fs.writeFileSync(file, classified('a'.repeat(40)) + '\n');
    await cache.load();
    fs.writeFileSync(file, '{"version":99,"type":"classified"}\n');
    cache.put('classified', { oid: 'b'.repeat(40) });
    await cache.flush();
    await cache.compact();
    await cache.discardRecords();
    expect(fs.readFileSync(file, 'utf8')).toBe('{"version":99,"type":"classified"}\n');
    expect(cache.data.classified.has('b'.repeat(40))).toBe(true);
  });
  it('omits damaged and duplicate records during atomic compaction', async () => {
    await cache.load();
    const file = path.join(cache.directory, 'records.jsonl');
    fs.writeFileSync(file, [classified('a'.repeat(40)), classified('a'.repeat(40)), '{interrupted'].join('\n'));
    await cache.load();
    await cache.compact();
    expect(fs.readFileSync(file, 'utf8').trim().split('\n')).toEqual([classified('a'.repeat(40))]);
    expect(fs.readdirSync(cache.directory)).toEqual(['records.jsonl']);
  });
  it('does not persist another context after the repository itself reaches 256 MiB', async () => {
    await cache.load();
    const large = path.join(cache.directory, 'unrecognized-preserved-data');
    const fd = fs.openSync(large, 'w');
    fs.ftruncateSync(fd, 256 * 1024 ** 2);
    fs.closeSync(fd);
    const second = new AnalyticsCache(root, repo, 'another-context');
    await second.load();
    second.put('classified', { oid: 'c'.repeat(40) });
    await second.flush();
    await second.compact();
    expect(second.data.classified.has('c'.repeat(40))).toBe(true);
    expect(fs.existsSync(path.join(second.directory, 'records.jsonl'))).toBe(false);
    expect(fs.statSync(large).size).toBe(256 * 1024 ** 2);
  });
  it('preserves an oversized damaged record without allocating the whole JSONL file', async () => {
    await cache.load();
    const file = path.join(cache.directory, 'records.jsonl');
    const fd = fs.openSync(file, 'w');
    fs.ftruncateSync(fd, 64 * 1024 ** 2);
    fs.closeSync(fd);
    await cache.load();
    cache.put('classified', { oid: 'd'.repeat(40) });
    await cache.flush();
    await cache.compact();
    expect(fs.statSync(file).size).toBe(64 * 1024 ** 2);
    expect(cache.data.classified.has('d'.repeat(40))).toBe(true);
  });

  it('preserves a file replaced while its quota check is awaiting directory I/O', async () => {
    await cache.load();
    const file = path.join(cache.directory, 'records.jsonl');
    const readdir = fs.promises.readdir;
    let replaced = false;
    vi.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: Parameters<typeof readdir>) => {
      const result = await readdir(...args);
      if (!replaced) {
        replaced = true;
        await fs.promises.writeFile(file, '{"version":99}\n');
      }
      return result;
    });
    cache.put('classified', { oid: 'e'.repeat(40) });
    await cache.flush();
    expect(fs.readFileSync(file, 'utf8')).toBe('{"version":99}\n');
  });

  it('serializes quota checks across contexts so concurrent appends cannot exceed the global budget', async () => {
    await cache.load();
    const full = path.join(root, 'unknown-preserved-data');
    const fd = fs.openSync(full, 'w');
    fs.ftruncateSync(fd, STORAGE_BUDGETS.analytics - 100);
    fs.closeSync(fd);
    const second = new AnalyticsCache(root, repo, 'second-context');
    await second.load();
    cache.put('classified', { oid: 'a'.repeat(40) });
    second.put('classified', { oid: 'b'.repeat(40) });
    await Promise.all([cache.flush(), second.flush()]);
    const sizes = [cache, second].map((entry) => {
      const file = path.join(entry.directory, 'records.jsonl');
      return fs.existsSync(file) ? fs.statSync(file).size : 0;
    });
    expect(sizes.filter(Boolean)).toHaveLength(1);
    expect(sizes.reduce((sum, bytes) => sum + bytes, 0)).toBeLessThanOrEqual(100);
  });

  it('keeps the event loop responsive while automatic flushes and compaction persist many records', async () => {
    await cache.load();
    let ticked = false;
    const timer = setTimeout(() => {
      ticked = true;
    }, 0);
    try {
      for (let i = 0; i < 1024; i++) cache.put('classified', { oid: i.toString(16).padStart(40, '0') });
      await cache.compact();
      expect(ticked).toBe(true);
      expect(fs.readFileSync(path.join(cache.directory, 'records.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1024);
    } finally {
      clearTimeout(timer);
    }
  });

  it('cancels loading a large cache without rewriting its partially consumed records', async () => {
    await cache.load();
    const file = path.join(cache.directory, 'records.jsonl');
    const original = Array.from({ length: 4096 }, (_, i) => classified(i.toString(16).padStart(40, '0'))).join('\n');
    fs.writeFileSync(file, original);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 0);
    try {
      await expect(cache.load(controller.signal)).rejects.toThrow();
      expect(fs.readFileSync(file, 'utf8')).toBe(original);
    } finally {
      clearTimeout(timer);
    }
  });
});
