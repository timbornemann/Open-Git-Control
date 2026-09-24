import { describe, expect, it, vi } from 'vitest';
import { GitHubRepositoryService } from '../GitHubRepositoryService';
import { buildOpenGitControlReadme } from '../../../src/shared/licenseTemplates';

const repository = {
  id: 42, name: 'demo', full_name: 'alice/demo', private: true,
  clone_url: 'https://github.com/alice/demo.git', html_url: 'https://github.com/alice/demo',
  description: 'Demo', updated_at: '2026-01-01T00:00:00Z',
};

describe('GitHubRepositoryService remote creation', () => {
  it('replaces GitHub\'s initial README with the app template', async () => {
    const createForAuthenticatedUser = vi.fn().mockResolvedValue({ data: repository });
    const getContent = vi.fn().mockResolvedValue({ data: { type: 'file', sha: 'initial-sha' } });
    const createOrUpdateFileContents = vi.fn().mockResolvedValue({ data: {} });
    const service = new GitHubRepositoryService(() => ({ rest: { repos: { createForAuthenticatedUser, getContent, createOrUpdateFileContents } } }) as any);

    const result = await service.createRepositoryWithReadme('demo', 'Demo', true);

    expect(result).toEqual({ repository: expect.objectContaining({ id: 42 }), brandedReadme: true });
    expect(createForAuthenticatedUser).toHaveBeenCalledWith(expect.objectContaining({ auto_init: true }));
    expect(createOrUpdateFileContents).toHaveBeenCalledWith(expect.objectContaining({ sha: 'initial-sha' }));
    const encoded = createOrUpdateFileContents.mock.calls[0][0].content as string;
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(buildOpenGitControlReadme('demo'));
  });

  it('reports partial success when branding fails, and keeps local-to-GitHub creation empty', async () => {
    const createForAuthenticatedUser = vi.fn().mockResolvedValue({ data: repository });
    const getContent = vi.fn().mockResolvedValue({ data: { type: 'file', sha: 'initial-sha' } });
    const createOrUpdateFileContents = vi.fn().mockRejectedValue(new Error('permission denied'));
    const service = new GitHubRepositoryService(() => ({ rest: { repos: { createForAuthenticatedUser, getContent, createOrUpdateFileContents } } }) as any);

    const result = await service.createRepositoryWithReadme('demo', 'Demo', true);
    await service.createRepository('local-repo', '', false);

    expect(result.brandedReadme).toBe(false);
    expect(result.warning).toContain('permission denied');
    expect(result.repository.fullName).toBe('alice/demo');
    expect(createForAuthenticatedUser).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'local-repo', auto_init: false }));
  });
});
