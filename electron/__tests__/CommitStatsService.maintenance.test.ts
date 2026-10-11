import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitStatsService } from '../CommitStatsService';
import type { GitService } from '../GitService';

describe('statistics compaction and safe cache replacement', () => {
  let root: string, file: string, service: CommitStatsService;
  const git = {
    getRepoPath: () => 'C:/repo',
    runCommandAtPath: vi.fn(async (_repo: string, args: string[]) => (args.includes('--show-object-format') ? 'sha1' : '.git')),
    getCommitStatsAtPath: vi.fn(async () => ({ files: 2, additions: 4, deletions: 1 })),
  } as unknown as GitService;
  const entry = (hash: string, accessedAt: number, additions = 1) => ({
    schema: 2,
    namespace: 'e'.repeat(64),
    objectFormat: 'sha1',
    hash,
    stats: { files: 1, additions, deletions: 0 },
    accessedAt,
  });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-stats-maintenance-test-'));
    file = path.join(root, 'commit-stats-v1.jsonl');
    service = new CommitStatsService(git, () => file, { maxBytes: 700 });
  });
  afterEach(() => {
    service.dispose();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-stats-maintenance-test-')) throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });
  it('drops invalid and duplicate rows, retains the latest value and applies actual byte limits', () => {
    const hash = 'a'.repeat(40);
    const rows = [entry(hash, 1), entry(hash, 4, 8), entry('b'.repeat(40), 3), entry('c'.repeat(40), 2), entry('d'.repeat(40), 9, -1), '{broken'];
    fs.writeFileSync(file, rows.map((row) => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n'));
    expect(service.maintain(false, 0)).toBe(true);
    const raw = fs.readFileSync(file, 'utf8');
    expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(700);
    const parsed = raw
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(parsed[0]).toMatchObject({ hash, accessedAt: 4, stats: { additions: 8 } });
    expect(parsed.filter((row) => row.hash === hash)).toHaveLength(1);
    expect(parsed.some((row) => row.hash === 'd'.repeat(40))).toBe(false);
    expect(fs.readdirSync(root)).toEqual(['commit-stats-v1.jsonl']);
    expect(service.maintain(false, 3)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).not.toContain('c'.repeat(40));
  });
  it('refuses a changed cache during an asynchronous statistics calculation', async () => {
    fs.writeFileSync(file, JSON.stringify(entry('a'.repeat(40), 1)) + '\n');
    const replacement = '{"schema":99,"owner":"preserve"}\n';
    const ready = vi.fn();
    service.onUpdate((update) => {
      if (update.state === 'ready') {
        fs.writeFileSync(file, replacement);
        ready(update);
      }
    });
    await service.requestStats(['b'.repeat(40)]);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    expect(ready.mock.lastCall?.[0].stats).toEqual({ files: 2, additions: 4, deletions: 1 });
    expect(service.maintain(true, Date.now())).toBe(false);
    service.dispose();
    expect(fs.readFileSync(file, 'utf8')).toBe(replacement);
  });
  it('preserves oversized damaged lines and continues calculating statistics', async () => {
    const fd = fs.openSync(file, 'w');
    fs.ftruncateSync(fd, 64 * 1024 ** 2);
    fs.closeSync(fd);
    const ready = vi.fn();
    service.onUpdate((update) => {
      if (update.state === 'ready') ready(update);
    });
    await service.requestStats(['f'.repeat(40)]);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    expect(fs.statSync(file).size).toBe(64 * 1024 ** 2);
    expect(service.maintain(false, 0)).toBe(false);
  });
});
