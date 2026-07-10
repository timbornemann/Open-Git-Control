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
});
