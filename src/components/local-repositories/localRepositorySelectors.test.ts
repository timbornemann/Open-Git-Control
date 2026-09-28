import { describe, expect, it } from 'vitest';
import { knownHttpRemote, repoName, selectLocalRepositories } from './localRepositorySelectors';

const paths = ['C:/Code/alpha', 'D:/Projects/Beta'];
const meta = {
  [paths[0]]: { pinned: true, lastOpened: 2, createdAt: 1 },
  [paths[1]]: { pinned: false, lastOpened: 1, createdAt: 1 },
};

describe('local repository selection', () => {
  it('searches the full path while preserving the stored sort order', () => {
    expect(repoName('C:\\Code\\alpha')).toBe('alpha');
    expect(selectLocalRepositories(paths, meta, 'projects', false)).toEqual([paths[1]]);
    expect(selectLocalRepositories(paths, meta, '', true)).toEqual([paths[0]]);
    expect(selectLocalRepositories(paths, meta, '', false)).toEqual(paths);
  });

  it('only exposes known HTTP(S) origins as browser links', () => {
    expect(knownHttpRemote('https://github.com/team/repo.git')).toBe('https://github.com/team/repo.git');
    expect(knownHttpRemote('http://example.test/repo')).toBe('http://example.test/repo');
    expect(knownHttpRemote('git@github.com:team/repo.git')).toBeNull();
    expect(knownHttpRemote('javascript:alert(1)')).toBeNull();
  });
});
