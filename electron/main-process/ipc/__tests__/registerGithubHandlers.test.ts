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
});
