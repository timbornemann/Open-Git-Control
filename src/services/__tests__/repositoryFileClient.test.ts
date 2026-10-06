import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '../gitClient';
import { invalidateResources, resourceKey } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';

afterEach(() => vi.unstubAllGlobals());
describe('source-aware repository file client', () => {
  it('refreshes local LFS availability for a fixed commit after a transfer', async () => {
    const context = { repoPath: 'C:/repo', source: 'commit' as const, path: 'file.txt', commitHash: 'a'.repeat(40) };
    const getRepositoryFileInfo = vi.fn().mockResolvedValue({ success: true, data: { lfs: { available: false }, hashes: null } });
    vi.stubGlobal('window', { electronAPI: { git: { getRepositoryFileInfo } } });
    await gitClient.getRepositoryFileInfo(context);
    invalidateResources('git');
    expect(queryClient.getQueryState(resourceKey('git', 'getRepositoryFileInfo', [context]))?.isInvalidated).toBe(true);
    getRepositoryFileInfo.mockResolvedValue({ success: true, data: { lfs: { available: true }, hashes: { sha256: 'object-hash' } } });
    expect((await gitClient.getRepositoryFileInfo(context)).data?.hashes?.sha256).toBe('object-hash');
    expect(getRepositoryFileInfo).toHaveBeenCalledTimes(2);
  });
  it('binds LFS reads and conversion to their repository, source and checked version and invalidates file status', async () => {
    const git = {
      getGitLfsStatus: vi.fn().mockResolvedValue({ success: true, data: { available: true, files: [] } }),
      trackWithGitLfs: vi.fn().mockResolvedValue({ success: true }),
    };
    vi.stubGlobal('window', { electronAPI: { git } });
    const request = { repoPath: 'C:/lfs', files: [{ path: 'design.psd', source: 'staged' as const }] };
    await gitClient.getGitLfsStatus(request);
    const write = { repoPath: request.repoPath, ...request.files[0], expectedVersion: 'snapshot', scope: 'file' as const };
    await gitClient.trackWithGitLfs(write);
    expect(git.getGitLfsStatus).toHaveBeenCalledWith(request);
    expect(git.trackWithGitLfs).toHaveBeenCalledWith(write);
    expect(queryClient.getQueryState(resourceKey('git', 'getGitLfsStatus', [request]))?.isInvalidated).toBe(true);
  });
  it('delegates preview, info and compare-and-swap saves with the complete source identity', async () => {
    const git = {
      getRepositoryFilePreview: vi.fn().mockResolvedValue({ success: true, data: 'preview' }),
      getRepositoryFileInfo: vi.fn().mockResolvedValue({ success: true, data: 'info' }),
      saveRepositoryFile: vi.fn().mockResolvedValue({ success: true, data: { version: 'new' } }),
    };
    vi.stubGlobal('window', { electronAPI: { git } });
    const context = { repoPath: 'C:/repo', source: 'staged' as const, path: 'src/app.ts' };
    await expect(gitClient.getRepositoryFilePreview(context)).resolves.toMatchObject({ data: 'preview' });
    await expect(gitClient.getRepositoryFileInfo(context)).resolves.toMatchObject({ data: 'info' });
    const save = { ...context, expectedVersion: 'original', content: 'draft', encoding: 'utf8' as const };
    await gitClient.saveRepositoryFile(save);
    expect(git.getRepositoryFilePreview).toHaveBeenCalledWith(context);
    expect(git.getRepositoryFileInfo).toHaveBeenCalledWith(context);
    expect(git.saveRepositoryFile).toHaveBeenCalledWith(save);
    expect(queryClient.getQueryState(resourceKey('git', 'getRepositoryFilePreview', [context]))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(resourceKey('git', 'getRepositoryFileInfo', [context]))?.isInvalidated).toBe(true);
  });
  it('keeps caches independent by source and marks immutable commit reads correctly', async () => {
    const getRepositoryFilePreview = vi.fn().mockImplementation(async (request) => ({ success: true, data: request.source }));
    vi.stubGlobal('window', { electronAPI: { git: { getRepositoryFilePreview } } });
    const staged = { repoPath: 'C:/repo', source: 'staged' as const, path: 'same.txt' };
    const working = { ...staged, source: 'unstaged' as const };
    const commit = { ...staged, source: 'commit' as const, commitHash: 'a'.repeat(40) };
    expect((await gitClient.getRepositoryFilePreview(staged)).data).toBe('staged');
    expect((await gitClient.getRepositoryFilePreview(working)).data).toBe('unstaged');
    expect((await gitClient.getRepositoryFilePreview(commit)).data).toBe('commit');
    invalidateResources('git');
    expect(queryClient.getQueryState(resourceKey('git', 'getRepositoryFilePreview', [staged]))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(resourceKey('git', 'getRepositoryFilePreview', [commit]))?.isInvalidated).toBe(false);
  });
});
