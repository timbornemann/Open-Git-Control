import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupMetadataFixture, cleanupSha, cleanupSourceSha } from './branchCleanupMetadataFixture';

vi.mock('../HostingNetwork', () => ({ hostingFetch: (...args: Parameters<typeof fetch>) => fetch(...args) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalized branch cleanup metadata', () => {
  it.each(['github', 'forgejo', 'gitlab', 'bitbucket-cloud', 'bitbucket-data-center'] as const)(
    'reads protection, open requests and exact merge proof for %s',
    async (provider) => {
      const f = cleanupMetadataFixture(provider);
      const metadata = await f.adapter.branchCleanupMetadata(f.repository);
      expect(metadata).toMatchObject({
        complete: true,
        defaultBranch: 'main',
        branches: [{ name: 'release/stable', oid: cleanupSha, protected: true }],
        openRequests: [
          expect.objectContaining({ number: '9', sourceRepository: 'team/repo', sourceBranch: 'feature', targetRepository: 'team/repo', targetBranch: 'main' }),
        ],
        mergedRequests: [expect.objectContaining({ number: '9', headSha: cleanupSourceSha, mergeSha: cleanupSha })],
      });
      expect(f.fetch.mock.calls.every((call) => new URL(String(call[0])).host === 'forge.example')).toBe(true);
    },
  );

  it.each(['github', 'forgejo', 'gitlab', 'bitbucket-cloud', 'bitbucket-data-center'] as const)(
    'never treats incomplete %s protection data as unprotected',
    async (provider) => {
      const f = cleanupMetadataFixture(provider);
      f.state.malformedBranches = true;
      const metadata = await f.adapter.branchCleanupMetadata(f.repository);
      expect(metadata.complete).toBe(false);
      expect(metadata.problem).toBeTruthy();
    },
  );

  it.each(['bitbucket-cloud', 'bitbucket-data-center'] as const)('keeps %s protection unknown when permissions are missing', async (provider) => {
    const f = cleanupMetadataFixture(provider);
    f.state.rejectProtection = true;
    expect(await f.adapter.branchCleanupMetadata(f.repository)).toMatchObject({ complete: false });
  });

  it.each(['github', 'forgejo', 'gitlab', 'bitbucket-cloud', 'bitbucket-data-center'] as const)(
    'rejects incomplete open-request inventory for %s',
    async (provider) => {
      const f = cleanupMetadataFixture(provider);
      f.state.malformedOpen = true;
      expect(await f.adapter.branchCleanupMetadata(f.repository)).toMatchObject({ complete: false });
    },
  );

  it.each(['github', 'forgejo', 'gitlab', 'bitbucket-cloud', 'bitbucket-data-center'] as const)(
    'detects %s pagination loops instead of accepting a partial inventory',
    async (provider) => {
      const f = cleanupMetadataFixture(provider);
      f.state.loop = true;
      expect(await f.adapter.branchCleanupMetadata(f.repository)).toMatchObject({ complete: false });
      expect(f.fetch.mock.calls.length).toBeLessThan(10);
    },
  );

  it('includes outgoing open requests in a fork parent repository', async () => {
    const f = cleanupMetadataFixture('github');
    f.state.parent = true;
    const metadata = await f.adapter.branchCleanupMetadata(f.repository);
    expect(metadata.complete).toBe(true);
    expect(metadata.openRequests.some((request) => request.sourceRepository === 'team/repo' && request.targetRepository === 'parent/repo')).toBe(true);
  });

  it('requires Forgejo inventory counts when pagination headers are absent and propagates cancellation', async () => {
    const f = cleanupMetadataFixture('forgejo');
    f.state.omitCount = true;
    expect(await f.adapter.branchCleanupMetadata(f.repository)).toMatchObject({ complete: false });
    const controller = new AbortController();
    controller.abort();
    await expect(f.adapter.branchCleanupMetadata(f.repository, controller.signal)).rejects.toThrow();
  });
});
