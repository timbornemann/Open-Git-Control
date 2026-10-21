import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '../gitClient';
import * as electronApi from '../electronApi';
import type { ElectronGitAPI } from '@/shared/ipc/contracts/electronApi';
import { resourceKey, setActiveResourceRepository } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';

afterEach(() => vi.restoreAllMocks());
describe('selected-line client and cache invalidation', () => {
  it('delegates the typed request and invalidates both diff sources only for its repository', async () => {
    const apply = vi.fn().mockResolvedValue({ success: true, data: { status: 'applied' } });
    vi.spyOn(electronApi, 'requireElectronGitApi').mockReturnValue({ applyDiffLineSelection: apply } as unknown as ElectronGitAPI);
    setActiveResourceRepository('C:/repo');
    const keys = [
      resourceKey('git', 'getDiffPreview', [['diff', '--', 'file.txt'], undefined, 'C:/repo']),
      resourceKey('git', 'getDiffPreview', [['diff', '--cached', '--', 'file.txt'], undefined, 'C:/repo']),
      ['resource', 'git', 'c:/other', 'getDiffPreview'],
    ];
    for (const key of keys) queryClient.setQueryData(key, { success: true, data: { text: 'before' } });
    const request = { repoPath: 'C:/repo', path: 'file.txt', source: 'unstaged' as const, expectedDiff: 'diff', selectedUnitIds: ['hunk-1:0'] };
    expect(await gitClient.applyDiffLineSelection(request)).toEqual({ success: true, data: { status: 'applied' } });
    expect(apply).toHaveBeenCalledExactlyOnceWith(request);
    expect(queryClient.getQueryState(keys[0])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys[1])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys[2])?.isInvalidated).toBe(false);
  });
});
