import { afterEach, expect, it, vi } from 'vitest';
import type { ElectronGitAPI } from '@/shared/ipc/contracts/electronApi';
import * as electronApi from '../electronApi';
import { gitClient } from '../gitClient';

afterEach(() => vi.restoreAllMocks());

it('forwards repository identity and cancellation metadata to the summary API without installing a second cache owner', async () => {
  const response = { success: true, data: { repoPath: 'C:/repo', changeCount: 4, checkedAt: Date.now() } };
  const read = vi.fn().mockResolvedValue(response);
  vi.spyOn(electronApi, 'requireElectronGitApi').mockReturnValue({ getRepositoryChangeSummary: read } as unknown as ElectronGitAPI);
  const request = { requestId: 'activity-read', priority: 'speculative' as const };
  expect(await gitClient.getRepositoryChangeSummary('C:/repo', request)).toBe(response);
  expect(read).toHaveBeenCalledExactlyOnceWith('C:/repo', request);
});
