import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGithubHandlers } from '../registerGithubHandlers';

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

describe('registerGithubHandlers fork flow', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    handleMock.mockImplementation((channel: string, callback: (...args: any[]) => Promise<any>) => {
      handlers.set(channel, callback);
    });
  });

  it('returns not authenticated for github:forkRepo when session is missing', async () => {
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(false),
      authenticate: vi.fn(),
      getUsername: vi.fn().mockReturnValue(null),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService: {} as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const handler = handlers.get('github:forkRepo');
    expect(handler).toBeTruthy();

    const result = await handler!({}, { owner: 'octocat', repo: 'hello-world' });
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('forks repository via GitHub service and returns mapped data', async () => {
    const forkRepository = vi.fn().mockResolvedValue({
      id: 1,
      name: 'hello-world',
      fullName: 'tim/hello-world',
      private: false,
      cloneUrl: 'https://github.com/tim/hello-world.git',
      htmlUrl: 'https://github.com/tim/hello-world',
      description: 'fork',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      forkRepository,
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      authenticate: vi.fn(),
      getUsername: vi.fn().mockReturnValue('tim'),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService: {} as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const handler = handlers.get('github:forkRepo');
    expect(handler).toBeTruthy();

    const result = await handler!({}, { owner: 'octocat', repo: 'hello-world', name: 'hello-world' });
    expect(result).toEqual({
      success: true,
      data: {
        id: 1,
        name: 'hello-world',
        fullName: 'tim/hello-world',
        private: false,
        cloneUrl: 'https://github.com/tim/hello-world.git',
        htmlUrl: 'https://github.com/tim/hello-world',
        description: 'fork',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    });
    expect(forkRepository).toHaveBeenCalledWith('octocat', 'hello-world', {
      name: 'hello-world',
      defaultBranchOnly: undefined,
    });
  });

  it('adds real repository and commit urls to release context', async () => {
    const gitService = {
      runCommand: vi.fn().mockResolvedValue('abc123\x1fabc123\x1ffeat: release links\x1fTim\x1f2026-06-30'),
    } as any;
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      listRepositoryTags: vi.fn().mockResolvedValue(['v1.0.0']),
      getLatestReleaseTag: vi.fn().mockResolvedValue('v1.0.0'),
      normalizeHost: vi.fn((host: string) => host),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      authenticate: vi.fn(),
      getUsername: vi.fn().mockReturnValue('tim'),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.internal', githubOauthClientId: '' }),
    });

    const handler = handlers.get('github:getReleaseContext');
    expect(handler).toBeTruthy();

    const result = await handler!({}, { owner: 'acme', repo: 'project', targetCommitish: 'main' });

    expect(result.success).toBe(true);
    expect(result.data.repositoryHtmlUrl).toBe('https://github.internal/acme/project');
    expect(result.data.commitsSinceLastRelease[0].htmlUrl).toBe('https://github.internal/acme/project/commit/abc123');
    expect(result.data.commitsSinceLastRelease[0].htmlUrl).not.toContain('example');
  });

  it('falls back without logging a missing local release tag range', async () => {
    const gitService = {
      runCommand: vi.fn(async (args: string[]) => {
        if (args[0] === 'rev-parse') {
          throw new Error('missing local tag');
        }
        return 'def456\x1fdef456\x1ffix: fallback release context\x1fTim\x1f2026-06-30';
      }),
    } as any;
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      listRepositoryTags: vi.fn().mockResolvedValue(['v1.2.5']),
      getLatestReleaseTag: vi.fn().mockResolvedValue('v1.2.5'),
      normalizeHost: vi.fn((host: string) => host),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      authenticate: vi.fn(),
      getUsername: vi.fn().mockReturnValue('tim'),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const handler = handlers.get('github:getReleaseContext');
    expect(handler).toBeTruthy();

    const result = await handler!({}, { owner: 'acme', repo: 'project', targetCommitish: 'master' });

    expect(result.success).toBe(true);
    expect(result.data.fallbackUsed).toBe(true);
    expect(result.data.commitsSinceLastRelease[0].shortHash).toBe('def456');
    expect(gitService.runCommand).toHaveBeenCalledWith(['rev-parse', '--verify', '--quiet', 'v1.2.5^{commit}']);
    expect(gitService.runCommand).toHaveBeenCalledWith([
      'log',
      'master',
      '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ad',
      '--date=short',
      '--max-count=150',
    ]);
    expect(gitService.runCommand.mock.calls.some((call: any[]) => (
      Array.isArray(call[0]) && call[0][1] === 'v1.2.5..master'
    ))).toBe(false);
  });
});
