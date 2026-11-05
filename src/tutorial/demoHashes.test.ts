import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoFileHashes, demoMd5 } from './demoHashes';
import { createDemoApi } from './demoApi';
import { demoBlob, demoBlobBytes } from './demoBlob';
import { writeDemoFile } from './demoFiles';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import type { TutorialLaunchContext } from '@/shared/tutorial/types';
import fixtures from './fixtures/file-hashes.json';

afterEach(() => vi.unstubAllGlobals());
const expected = (bytes: Uint8Array) =>
  Object.fromEntries(['sha256', 'sha1', 'md5'].map((algorithm) => [algorithm, createHash(algorithm).update(bytes).digest('hex')]));
const context: TutorialLaunchContext = {
  request: { chapterId: 'hashes-file' },
  language: 'de',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const create = () => createDemoApi(context, { id: 'hashes', title: ['', ''], description: ['', ''], target: 'body', area: 'repo', scenario: 'hashes' });
const file = { repoPath: DEMO_REPO, path: 'README.md', source: 'unstaged' as const };

describe('private byte hashes', () => {
  it.each([0, 1, 7, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 4096, 65536])('matches native MD5 for %i bytes including padding boundaries', (size) => {
    const backing = Uint8Array.from({ length: size + 9 }, (_, index) => (index * 37 + 11) % 256),
      bytes = backing.subarray(4, 4 + size);
    expect(demoMd5(bytes)).toBe(createHash('md5').update(bytes).digest('hex'));
  });
  it('matches all three native hashes and fixed UTF-8/BOM lesson expectations', async () => {
    vi.stubGlobal('crypto', webcrypto);
    for (const [version, blob] of [
      ['base', 'Café\n'],
      ['edited', 'Café!\n'],
      ['bom', demoBlob('Café\n', 'utf8-bom')],
    ] as const) {
      const bytes = demoBlobBytes(blob);
      expect(await demoFileHashes(bytes)).toEqual(expected(bytes));
      expect(await demoFileHashes(bytes)).toEqual(fixtures[version]);
    }
  });
  it('reports missing crypto support without substituting fabricated values', async () => {
    vi.stubGlobal('crypto', {});
    await expect(demoFileHashes(new Uint8Array())).rejects.toThrow('unavailable');
  });
});

describe('source-bound practice file information', () => {
  it('hashes working, index and committed bytes independently, including binary data', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const { api, repo } = create();
    writeDemoFile(repo, 'README.md', demoBlob('Café!\n', 'latin1'));
    repo.indexFiles['README.md'] = demoBlob('Café\n', 'utf16be');
    for (const request of [file, { ...file, source: 'staged' as const }, { ...file, source: 'commit' as const, commitHash: repo.commits[0].hash }]) {
      const result = await api.git.getRepositoryFileInfo(request);
      expect(result).toMatchObject({
        success: true,
        data: { path: request.path, hashes: expected(demoBlobBytes(repo.fileAt(request.source, request.path, request.commitHash)!)) },
      });
    }
    writeDemoFile(repo, 'bytes.bin', '\0data');
    expect(await api.git.getRepositoryFileInfo({ ...file, path: 'bytes.bin' })).toMatchObject({
      success: true,
      data: { hashes: expected(demoBlobBytes('\0data')), editable: false },
    });
    expect((await api.git.getRepositoryFileInfo({ ...file, path: 'missing' })).success).toBe(false);
    expect((await api.git.getRepositoryFileInfo({ ...file, repoPath: 'C:/personal' })).success).toBe(false);
  });
  it.each(['file', 'repository'] as const)('rejects a late digest after the %s changes', async (change) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('crypto', {
      subtle: {
        digest: async (algorithm: string, input: Uint8Array) => {
          await gate;
          return webcrypto.subtle.digest(algorithm, Uint8Array.from(input));
        },
      },
    });
    const { api, repo } = create();
    const pending = api.git.getRepositoryFileInfo(file);
    if (change === 'file') writeDemoFile(repo, 'README.md', 'Changed\n');
    else repo.selectProject(DEMO_SECOND_REPO);
    release();
    expect((await pending).success).toBe(false);
  });
  it('returns legacy metadata from the same stored bytes and updates modification time on a save', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const { api, repo } = create();
    const first = await api.git.getWorkingDirectoryFileInfo('README.md', DEMO_REPO);
    expect(first).toMatchObject({ success: true, data: { bytes: 6, name: 'README.md', hashes: fixtures.base, git: { tracked: true, modified: false } } });
    writeDemoFile(repo, 'README.md', 'Café!\n');
    const next = await api.git.getWorkingDirectoryFileInfo('README.md', DEMO_REPO);
    expect(next).toMatchObject({ success: true, data: { bytes: 7, hashes: fixtures.edited, git: { modified: true } } });
    expect(next.success && first.success && next.data.modifiedAt !== first.data.modifiedAt).toBe(true);
  });
});
