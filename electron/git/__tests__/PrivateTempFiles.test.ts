import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPrivateTempDir,
  cleanupPrivateTempDir,
  cleanupPrivateTempDirAsync,
  inspectPrivateTempFiles,
  cleanPrivateTempFiles,
  writePrivateTempFile,
} from '../PrivateTempFiles';

describe('owned temporary workspaces', () => {
  let root: string;
  const now = Date.UTC(2026, 5, 1),
    day = 86_400_000;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-temp-test-'));
    vi.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pid === process.pid) return true;
      throw Object.assign(new Error('dead'), { code: 'ESRCH' });
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-temp-test-')) throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true });
  });
  const leftover = (name: string, days: number, extra = {}) => {
    const directory = path.join(root, name);
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, '.ogc-workspace.json'),
      JSON.stringify({ version: 1, application: 'Open-Git-Control', id: randomUUID(), pid: 424242, createdAt: now - days * day, directory: name, ...extra }),
    );
    fs.writeFileSync(path.join(directory, 'work'), 'private work');
    return directory;
  };
  it('removes normal completed work and keeps active work despite old dates', () => {
    const directory = createPrivateTempDir('test-', root);
    fs.mkdirSync(path.join(directory, 'nested'));
    writePrivateTempFile(path.join(directory, 'nested', 'work'), 'payload');
    expect(inspectPrivateTempFiles(now + 100 * day, root)[0].eligible).toBe(false);
    expect(cleanPrivateTempFiles(now + 100 * day, root).files).toBe(0);
    cleanupPrivateTempDir(directory, root);
    expect(fs.existsSync(directory)).toBe(false);
  });
  it('requires seven days, a dead owner process and an explicit allowed set when supplied', () => {
    const old = leftover('old', 7),
      young = leftover('young', 6),
      alive = leftover('alive', 30, { pid: process.pid });
    expect(cleanPrivateTempFiles(now, root, new Set([young])).files).toBe(0);
    expect(cleanPrivateTempFiles(now, root, new Set([old])).files).toBe(2);
    expect(fs.existsSync(young)).toBe(true);
    expect(fs.existsSync(alive)).toBe(true);
    expect(cleanPrivateTempFiles(now, root).files).toBe(0);
  });
  it('cleans completed work asynchronously while preserving redirected descendants', async () => {
    const directory = createPrivateTempDir('test-', root);
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'sentinel'), 'preserved');
    const link = path.join(directory, 'linked');
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    await cleanupPrivateTempDirAsync(directory, root);
    expect(fs.existsSync(directory)).toBe(true);
    expect(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8')).toBe('preserved');
    fs.unlinkSync(link);
    fs.mkdirSync(path.join(directory, 'nested'));
    fs.writeFileSync(path.join(directory, 'nested', 'index'), 'private');
    await cleanupPrivateTempDirAsync(directory, root);
    expect(fs.existsSync(directory)).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
  });
  it('preserves unknown provenance, invalid PIDs and redirected descendants', () => {
    const unknown = leftover('unknown', 200, { version: 99 }),
      invalid = leftover('invalid', 200, { pid: -1 });
    const redirected = leftover('redirected', 200);
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'sentinel'), 'preserved');
    fs.symlinkSync(outside, path.join(redirected, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(inspectPrivateTempFiles(now, root).filter((entry) => entry.unclear)).toHaveLength(4);
    expect(cleanPrivateTempFiles(now, root).files).toBe(0);
    for (const directory of [unknown, invalid, redirected]) expect(fs.existsSync(directory)).toBe(true);
    expect(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8')).toBe('preserved');
  });
});
