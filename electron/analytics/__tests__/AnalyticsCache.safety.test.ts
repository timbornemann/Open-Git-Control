import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsCache } from '../AnalyticsCache';

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
    cache.flush();
    cache.compact();
    cache.discardRecords();
    expect(fs.readFileSync(file, 'utf8')).toBe('{"version":99,"type":"classified"}\n');
    expect(cache.data.classified.has('b'.repeat(40))).toBe(true);
  });
  it('omits damaged and duplicate records during atomic compaction', async () => {
    await cache.load();
    const file = path.join(cache.directory, 'records.jsonl');
    fs.writeFileSync(file, [classified('a'.repeat(40)), classified('a'.repeat(40)), '{interrupted'].join('\n'));
    await cache.load();
    cache.compact();
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
    second.flush();
    second.compact();
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
    cache.flush();
    cache.compact();
    expect(fs.statSync(file).size).toBe(64 * 1024 ** 2);
    expect(cache.data.classified.has('d'.repeat(40))).toBe(true);
  });
});
