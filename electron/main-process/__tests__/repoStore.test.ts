import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { normalizeStoredData } from '../repoStore';

describe('normalizeStoredData repository aliases', () => {
  it('deduplicates equivalent paths and merges their metadata', () => {
    const repoPath = path.join(process.cwd(), 'repos', 'example');
    const aliasPath = path.join(process.cwd(), 'repos', 'nested', '..', 'example');

    const result = normalizeStoredData({
      repos: [
        { path: repoPath, lastOpened: 10, createdAt: 8, pinned: false },
        { path: aliasPath, lastOpened: 20, createdAt: 4, pinned: true },
      ],
      activeRepo: aliasPath,
      sortBy: 'lastOpenedDesc',
    });

    expect(result.repos).toEqual([{ path: repoPath, lastOpened: 20, createdAt: 4, pinned: true }]);
    expect(result.activeRepo).toBe(repoPath);
  });

  it.runIf(process.platform === 'win32')('deduplicates Windows separator and case aliases', () => {
    const result = normalizeStoredData({
      repos: [
        { path: 'C:\\Work\\Repo', lastOpened: 1, createdAt: 1, pinned: false },
        { path: 'c:/work/repo/', lastOpened: 2, createdAt: 1, pinned: false },
      ],
      activeRepo: 'c:/WORK/repo',
      sortBy: 'lastOpenedDesc',
    });

    expect(result.repos).toHaveLength(1);
    expect(result.activeRepo).toBe('C:\\Work\\Repo');
  });
});
