import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TAG_REFERENCE_STATUS_FORMAT, remoteTagTrackingRefPrefix } from '@/utils/tagConflicts';
import { syncRemoteTags } from './syncRemoteTags';

const mocked = vi.hoisted(() => ({ request: vi.fn(), command: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ transferClient: { request: mocked.request } }));
vi.mock('@/services/gitClient', () => ({ gitClient: { runGitCommandForRepo: mocked.command } }));

const object = (digit: string) => digit.repeat(40);
const refs = [
  `refs/tags/conflict\0${object('a')}\0`,
  `refs/ogc/remote-tags/private/conflict\0${object('b')}\0`,
  `refs/tags/equal\0${object('c')}\0`,
  `refs/ogc/remote-tags/private/equal\0${object('c')}\0`,
  `refs/ogc/remote-tags/private/missing\0${object('d')}\0${object('e')}`,
  `refs/ogc/remote-tags/backup/unrelated\0${object('f')}\0`,
].join('\n');

beforeEach(() => {
  vi.clearAllMocks();
  mocked.request.mockResolvedValue({ output: '' });
  mocked.command.mockImplementation(async (_repo: string, operation: string) => ({ success: true, data: operation === 'forEachRef' ? refs : '' }));
});

describe('manual remote tag synchronization', () => {
  it('adopts only missing tags from the selected source and leaves conflicts intact', async () => {
    const result = await syncRemoteTags('/repo/mixed', 'private');

    expect(mocked.request).toHaveBeenCalledWith('fetch', { repoPath: '/repo/mixed', remote: 'private', tagsOnly: true });
    expect(mocked.command.mock.calls).toEqual([
      ['/repo/mixed', 'forEachRef', TAG_REFERENCE_STATUS_FORMAT, 'refs/tags', remoteTagTrackingRefPrefix('private')],
      ['/repo/mixed', 'adoptRemoteTag', 'private', 'missing'],
    ]);
    expect(result).toEqual({ conflictingTagNames: ['conflict'], remoteOnlyTagNames: ['missing'] });
  });

  it('does not read or adopt tags after a repository change during fetch', async () => {
    let finishFetch!: () => void;
    let currentRepo = '/repo/first';
    mocked.request.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishFetch = resolve;
        }),
    );
    const scoped = async <T>(operation: () => Promise<T>) => {
      const result = await operation();
      if (currentRepo !== '/repo/first') throw new Error('Repository context changed.');
      return result;
    };
    const pending = syncRemoteTags('/repo/first', 'private', scoped);
    const rejected = expect(pending).rejects.toThrow('Repository context changed.');
    currentRepo = '/repo/second';
    finishFetch();
    await rejected;
    expect(mocked.command).not.toHaveBeenCalled();
  });

  it('reports read failures without adopting any local tag', async () => {
    mocked.command.mockResolvedValue({ success: false, error: 'Repository unavailable.' });
    await expect(syncRemoteTags('/repo/mixed', 'private')).rejects.toThrow('Repository unavailable.');
    expect(mocked.command).toHaveBeenCalledTimes(1);
  });
});
