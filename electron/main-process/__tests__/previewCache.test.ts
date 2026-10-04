import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import type { PreviewSnapshot } from '../../../src/shared/cache/resource';

const state = vi.hoisted(() => ({ directory: '', encrypted: true }));
vi.mock('electron', () => ({
  app: { getPath: () => state.directory },
  safeStorage: {
    encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')),
    decryptString: (value: Buffer) => value.toString().split('').reverse().join(''),
  },
}));
vi.mock('../secureStore', () => ({ isSecureStorageAvailable: () => state.encrypted }));
import { readPreviewCache, savePreviewCache, trimPreviewCache, validatePreview } from '../previewCache';

const preview = (): PreviewSnapshot => ({
  version: 1,
  key: ['resource', 'planner', 'application', 'getData'],
  savedAt: Date.now(),
  sourceRevision: '1',
  complete: true,
  data: { success: true, data: { version: 1, projects: [], items: [] } },
});
beforeEach(async () => {
  state.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ogc-preview-test-'));
  state.encrypted = true;
});
afterEach(async () => {
  if (path.dirname(state.directory) !== os.tmpdir() || !path.basename(state.directory).startsWith('ogc-preview-test-'))
    throw new Error('Unexpected test directory');
  await fs.rm(state.directory, { recursive: true, force: true });
});

describe('persistent preview cache', () => {
  it('persists bounded repository summaries and rejects malformed or mismatched counts', async () => {
    const entry: PreviewSnapshot = {
      ...preview(),
      key: ['resource', 'git', '/repo', 'getRepositoryChangeSummary'],
      data: { success: true, data: { repoPath: '/repo', changeCount: 12, checkedAt: Date.now() } },
    };
    expect(validatePreview(entry)).toBe(true);
    await savePreviewCache([entry], () => true);
    expect(await readPreviewCache(() => true)).toEqual([entry]);
    for (const changes of [
      { changeCount: -1 },
      { changeCount: 1.5 },
      { changeCount: Infinity },
      { repoPath: '/other' },
      { checkedAt: NaN },
      { checkedAt: Date.now() + 120_000 },
      { logs: 'not allowed' },
    ]) {
      expect(validatePreview({ ...entry, data: { success: true, data: { repoPath: '/repo', changeCount: 12, checkedAt: Date.now(), ...changes } } })).toBe(
        false,
      );
    }
  });
  it('restores a successful empty result across store reads', async () => {
    const entry = preview();
    await savePreviewCache([entry], () => true);
    expect(await readPreviewCache(() => true)).toEqual([entry]);
  });
  it('only restores explicitly authorized repository/account scopes', async () => {
    await savePreviewCache([preview()], () => true);
    expect(await readPreviewCache(() => false)).toEqual([]);
  });
  it('rejects unsupported data, full file contents and incompatible versions', async () => {
    const entry = preview();
    expect(validatePreview({ ...entry, version: 2 })).toBe(false);
    expect(validatePreview({ ...entry, data: { success: true, data: { projects: null } } })).toBe(false);
    expect(validatePreview({ ...entry, key: ['resource', 'git', '/repo', 'readRepoFile'] })).toBe(false);
    await savePreviewCache([{ ...entry, version: 2 }], () => true);
    expect(await readPreviewCache(() => true)).toEqual([]);
  });
  it('discards a corrupt cache file without affecting valid snapshots', async () => {
    await savePreviewCache([preview()], () => true);
    const directory = path.join(state.directory, 'preview-cache-v1');
    const damaged = path.join(directory, `${'a'.repeat(64)}.json`);
    await fs.writeFile(damaged, '{partial');
    expect(await readPreviewCache(() => true)).toHaveLength(1);
    await expect(fs.stat(damaged)).rejects.toThrow();
  });
  it('evicts the least recently used disk snapshots when the budget is exceeded', async () => {
    const entries: PreviewSnapshot[] = [0, 1, 2].map((index) => ({
      ...preview(),
      key: ['resource', 'git', `/repo-${index}`, 'command', 'branch', '-a'],
      data: { success: true, data: '* main' },
    }));
    await savePreviewCache(entries, () => true);
    const directory = path.join(state.directory, 'preview-cache-v1');
    const files = entries.map((entry) => path.join(directory, `${createHash('sha256').update(JSON.stringify(entry.key)).digest('hex')}.json`));
    for (const [index, file] of files.entries()) await fs.utimes(file, new Date(1000 + index * 1000), new Date(1000 + index * 1000));
    const sizes = await Promise.all(files.map(async (file) => (await fs.stat(file)).size));
    await trimPreviewCache(directory, sizes[1] + sizes[2]);
    await expect(fs.stat(files[0])).rejects.toThrow();
    expect(await readPreviewCache(() => true)).toHaveLength(2);
  });
  it('never persists retired GitHub metadata, even with encryption and a granted account scope', async () => {
    const entry: PreviewSnapshot = {
      ...preview(),
      key: ['resource', 'github', 'github.com/alice', 'getRepository', 'alice', 'private'],
      data: { success: true, data: { owner: 'alice', repo: 'private', fork: false, parent: null, defaultBranch: 'main', fullName: 'alice/private' } },
    };
    const authorize = vi.fn(() => true);
    expect(validatePreview(entry)).toBe(false);
    await savePreviewCache([entry], authorize);
    const file = path.join(state.directory, 'preview-cache-v1', `${createHash('sha256').update(JSON.stringify(entry.key)).digest('hex')}.json`);
    await expect(fs.stat(file)).rejects.toThrow();
    expect(await readPreviewCache(authorize)).toEqual([]);
    expect(authorize).not.toHaveBeenCalled();
    state.encrypted = false;
    const denied = { ...entry, key: [...entry.key, 'uncached'] as PreviewSnapshot['key'] };
    await savePreviewCache([denied], authorize);
    expect(await fs.readdir(path.dirname(file))).toEqual([]);
    expect(authorize).not.toHaveBeenCalled();

    // Existing private cache files from the retired API cannot become visible
    // after account logout or when a different hosting connection is selected.
    for (const encrypted of [true, false]) {
      state.encrypted = true;
      const raw = JSON.stringify(entry);
      await fs.writeFile(file, encrypted ? JSON.stringify({ encrypted: Buffer.from(raw.split('').reverse().join('')).toString('base64') }) : raw);
      expect(await readPreviewCache(authorize)).toEqual([]);
      await expect(fs.stat(file)).rejects.toThrow();
    }
    expect(authorize).not.toHaveBeenCalled();
  });
});
