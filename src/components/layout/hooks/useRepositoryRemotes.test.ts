import { describe, expect, it } from 'vitest';
import { parseRepositoryRemotes } from './useRepositoryRemotes';

describe('parseRepositoryRemotes', () => {
  it('preserves spaces in local remote paths', () => {
    const parsed = parseRepositoryRemotes('origin\tD:\\Git Repositories\\server.git (fetch)\norigin\tD:\\Git Repositories\\server.git (push)\n');

    expect(parsed).toEqual({
      hasOrigin: true,
      remotes: [{ name: 'origin', url: 'D:\\Git Repositories\\server.git' }],
    });
  });

  it('prefers the fetch URL when a remote has a separate push URL', () => {
    const parsed = parseRepositoryRemotes('upstream\tssh://write.example/repo.git (push)\nupstream\thttps://read.example/repo.git (fetch)');

    expect(parsed.remotes).toEqual([{ name: 'upstream', url: 'https://read.example/repo.git' }]);
  });
});
