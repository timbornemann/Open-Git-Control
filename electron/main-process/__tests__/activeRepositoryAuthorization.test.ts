import { describe, expect, it } from 'vitest';
import { requireActiveRepositoryPath } from '../activeRepositoryAuthorization';

describe('requireActiveRepositoryPath', () => {
  it('returns the backend-owned active path for an equivalent renderer path', () => {
    expect(requireActiveRepositoryPath('C:/work/repo', 'C:/work/repo')).toBe('C:/work/repo');
  });

  it('rejects absent or different repository contexts', () => {
    expect(() => requireActiveRepositoryPath('C:/work/other', 'C:/work/repo')).toThrow('not the active repository');
    expect(() => requireActiveRepositoryPath('C:/work/repo', null)).toThrow('No repository selected');
  });

  it('accepts a saved subdirectory path that Git canonicalized to the active root', () => {
    expect(requireActiveRepositoryPath('/work/repo/packages/app', '/work/repo')).toBe('/work/repo');
    expect(() => requireActiveRepositoryPath('/work/repository-other', '/work/repo')).toThrow('not the active repository');
  });
});
