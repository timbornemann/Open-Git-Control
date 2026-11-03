import { afterEach, expect, it, vi } from 'vitest';
import { gitClient } from '../gitClient';

afterEach(() => vi.unstubAllGlobals());
it('forwards the fast status and its cancellation request through the isolated API provider', async () => {
  const getWorkingTreeStatus = vi.fn(async () => ({ success: true, data: { repoPath: 'c:/repo', statusRaw: '', changeCount: 0, checkedAt: 123 } }));
  vi.stubGlobal('window', { electronAPI: { git: { getWorkingTreeStatus } } });
  const request = { requestId: 'status', priority: 'visible' as const };
  expect(await gitClient.getWorkingTreeStatus('c:/repo', request)).toMatchObject({ success: true, data: { checkedAt: 123 } });
  expect(getWorkingTreeStatus).toHaveBeenCalledWith('c:/repo', request);
});
