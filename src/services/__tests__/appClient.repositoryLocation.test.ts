import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appClient } from '../appClient';
import { resourceKey } from '@/data/clientCache';
import { queryClient, updateResource } from '@/data/queryClient';

const select = vi.fn(),
  recheck = vi.fn();
const storedKey = resourceKey('app', 'getStoredRepos'),
  planningKey = resourceKey('planner', 'getProjectPlannerData');
beforeEach(() => {
  vi.stubGlobal('window', { electronAPI: { repos: { selectRepositoryLocation: select, recheckRepository: recheck } } });
  queryClient.clear();
  select.mockReset();
  recheck.mockReset();
  updateResource(storedKey, { repos: [{ path: 'C:/old' }] });
  updateResource(planningKey, { projects: [{ repoPath: 'C:/old' }] });
});
afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});
describe('repository location client', () => {
  it('invalidates saved paths and planning after relocation, without changing settings data', async () => {
    const settingsKey = resourceKey('app', 'getSettings');
    updateResource(settingsKey, { language: 'de' });
    select.mockResolvedValue({ success: true, data: 'C:/moved' });
    await expect(appClient.selectRepositoryLocation({ repoPath: 'C:/old' })).resolves.toEqual({ success: true, data: 'C:/moved' });
    expect(select).toHaveBeenCalledWith({ repoPath: 'C:/old' });
    expect(queryClient.getQueryState(storedKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(planningKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(settingsKey)?.isInvalidated).toBe(false);
  });
  it.each([
    { success: true, data: null },
    { success: false, error: 'Invalid folder' },
  ])('retains cached data after cancellation or validation failure: %j', async (result) => {
    select.mockResolvedValue(result);
    await expect(appClient.selectRepositoryLocation({ repoPath: 'C:/old' })).resolves.toEqual(result);
    expect(queryClient.getQueryState(storedKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(planningKey)?.isInvalidated).toBe(false);
  });
  it('delegates rechecking without modifying saved paths', async () => {
    recheck.mockResolvedValue({ success: true, data: 'C:/old' });
    await expect(appClient.recheckRepository({ repoPath: 'C:/old' })).resolves.toEqual({ success: true, data: 'C:/old' });
    expect(recheck).toHaveBeenCalledWith({ repoPath: 'C:/old' });
    expect(queryClient.getQueryState(storedKey)?.isInvalidated).toBe(false);
  });
});
