import { describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: () => true,
  statSync: () => ({ isFile: () => true, size: 10 }),
  createReadStream: () => 'STREAM',
}));

import { GitHubReleaseService, uploadBaseUrlForHost } from '../GitHubReleaseService';

describe('uploadBaseUrlForHost', () => {
  it('uses the public upload host for github.com (and unset host)', () => {
    expect(uploadBaseUrlForHost('github.com')).toBe('https://uploads.github.com');
    expect(uploadBaseUrlForHost('')).toBe('https://uploads.github.com');
    expect(uploadBaseUrlForHost('GitHub.com')).toBe('https://uploads.github.com');
  });

  it('uses the enterprise upload host for a GHES host', () => {
    expect(uploadBaseUrlForHost('ghe.example.com')).toBe('https://ghe.example.com/api/uploads');
  });
});

describe('GitHubReleaseService.uploadReleaseAsset', () => {
  it('routes the asset upload to the configured enterprise host, not uploads.github.com', async () => {
    const uploadReleaseAsset = vi.fn().mockResolvedValue({
      data: { id: 1, name: 'a.zip', browser_download_url: 'https://ghe.example.com/download/a.zip' },
    });
    const octokit = { rest: { repos: { uploadReleaseAsset } } } as any;
    const service = new GitHubReleaseService(
      () => octokit,
      () => 'ghe.example.com',
    );

    await service.uploadReleaseAsset({ owner: 'o', repo: 'r', releaseId: 5, filePath: '/tmp/a.zip', name: 'a.zip' });

    expect(uploadReleaseAsset).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://ghe.example.com/api/uploads' }));
  });

  it('routes the asset upload to uploads.github.com for github.com', async () => {
    const uploadReleaseAsset = vi.fn().mockResolvedValue({
      data: { id: 2, name: 'b.zip', browser_download_url: 'https://github.com/download/b.zip' },
    });
    const octokit = { rest: { repos: { uploadReleaseAsset } } } as any;
    const service = new GitHubReleaseService(
      () => octokit,
      () => 'github.com',
    );

    await service.uploadReleaseAsset({ owner: 'o', repo: 'r', releaseId: 7, filePath: '/tmp/b.zip', name: 'b.zip' });

    expect(uploadReleaseAsset).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://uploads.github.com' }));
  });
});
