import { afterEach, expect, it, vi } from 'vitest';
import { githubClient } from '@/legacy/github/githubClient';
import type { GithubCatalogSnapshotDto } from '@/types/githubDtos';
import { catalogKey, clearGithubCatalogSession, restoreGithubCatalog } from '../githubCatalog';
import { getGithubResourceScope, setGithubResourceScope } from '../clientCache';
import { queryClient } from '../queryClient';

afterEach(() => {
  vi.restoreAllMocks();
});

it('does not restore an earlier account from a late disk read after logout', async () => {
  let finish!: (value: { success: true; data: GithubCatalogSnapshotDto }) => void;
  vi.spyOn(githubClient, 'getCatalogSnapshot').mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const restored = restoreGithubCatalog('github.com', null);
  clearGithubCatalogSession();
  setGithubResourceScope('github.com', null);
  finish({ success: true, data: { host: 'github.com', username: 'previous', repos: [], savedAt: new Date().toISOString() } });
  await restored;
  expect(getGithubResourceScope()).toBe('github.com/anonymous');
  expect(queryClient.getQueryData(catalogKey('github.com/previous'))).toBeUndefined();
});

it('does not restore a previous host after settings switch to another GitHub host', async () => {
  let finish!: (value: { success: true; data: GithubCatalogSnapshotDto }) => void;
  vi.spyOn(githubClient, 'getCatalogSnapshot').mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const restored = restoreGithubCatalog('github.com', null);
  setGithubResourceScope('github.enterprise', 'current');
  finish({ success: true, data: { host: 'github.com', username: 'previous', repos: [], savedAt: new Date().toISOString() } });
  await restored;
  expect(getGithubResourceScope()).toBe('github.enterprise/current');
  expect(queryClient.getQueryData(catalogKey('github.com/previous'))).toBeUndefined();
});
