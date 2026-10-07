import { describe, expect, it, vi } from 'vitest';
import { createHostingReleaseLocalTag } from '../HostingReleaseLocalTag';

const target = 'a'.repeat(40);
describe('local release tag follow-up', () => {
  it('fetches only the verified missing commit from the selected endpoint and creates the ref with a zero-OID lease', async () => {
    const git = vi.fn(async (args: string[]) => {
      if (args[0] === 'rev-parse' || args[0] === 'cat-file') throw new Error('Missing object');
      return '';
    });
    expect(await createHostingReleaseLocalTag(git, 'v2.0.0', target, 'https://private.example/repo.git')).toEqual({
      name: 'v2.0.0',
      targetOid: target,
      status: 'created',
    });
    expect(git).toHaveBeenCalledWith(['fetch', '--no-tags', '--no-write-fetch-head', '--', 'https://private.example/repo.git', target], true);
    expect(git).toHaveBeenCalledWith(['update-ref', '-m', 'Release v2.0.0', 'refs/tags/v2.0.0', target, '0'.repeat(40)]);
    expect(git.mock.calls.some(([args]) => args[0] === 'push' || args.includes('--force'))).toBe(false);
  });

  it('recognizes a tag written concurrently instead of replacing it after a failed compare-and-swap', async () => {
    let wrote = false;
    const git = vi.fn(async (args: string[]) => {
      if (args[0] === 'rev-parse') {
        if (!wrote) throw new Error('No local tag');
        return 'b'.repeat(40);
      }
      if (args[0] === 'update-ref') {
        wrote = true;
        throw new Error('Ref already exists');
      }
      return '';
    });
    expect(await createHostingReleaseLocalTag(git, 'v2.0.0', target, 'https://private.example/repo.git')).toMatchObject({
      status: 'conflict',
      targetOid: target,
    });
    expect(git.mock.calls.filter(([args]) => args[0] === 'update-ref')).toHaveLength(1);
  });

  it('returns an explicit failed follow-up and redacts credentials without hiding the published release', async () => {
    const git = vi.fn(async (args: string[]) => {
      if (args[0] === 'rev-parse' || args[0] === 'cat-file') throw new Error('Missing');
      if (args[0] === 'fetch') throw new Error('Connection failed https://user:super-secret@example.test/repo.git');
      return '';
    });
    const result = await createHostingReleaseLocalTag(git, 'v2.0.0', target, 'https://private.example/repo.git');
    expect(result.status).toBe('failed');
    expect(result.message).toContain('Connection failed');
    expect(result.message).not.toContain('super-secret');
    expect(git.mock.calls.some(([args]) => args[0] === 'update-ref')).toBe(false);
  });
});
