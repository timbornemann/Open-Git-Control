import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGithubHandlers } from '../registerGithubHandlers';

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));
const { clearSavedGithubTokenSecurelyMock, readSavedGithubTokenWithHostMock, saveGithubTokenSecurelyMock } = vi.hoisted(() => ({
  clearSavedGithubTokenSecurelyMock: vi.fn(),
  readSavedGithubTokenWithHostMock: vi.fn(),
  saveGithubTokenSecurelyMock: vi.fn(),
}));
const { runGithubCliOneClickLoginMock } = vi.hoisted(() => ({
  runGithubCliOneClickLoginMock: vi.fn(),
}));
const { getAuthorizedSelectedFileMock } = vi.hoisted(() => ({
  getAuthorizedSelectedFileMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock('../../secureStore', () => ({
  clearSavedGithubTokenSecurely: clearSavedGithubTokenSecurelyMock,
  readSavedGithubTokenWithHost: readSavedGithubTokenWithHostMock,
  saveGithubTokenSecurely: saveGithubTokenSecurelyMock,
}));

vi.mock('../../githubCliAuth', () => ({
  runGithubCliOneClickLogin: runGithubCliOneClickLoginMock,
}));

vi.mock('../../fileAccessGrant', () => ({
  getAuthorizedSelectedFile: getAuthorizedSelectedFileMock,
}));

describe('registerGithubHandlers fork flow', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(() => {
    handlers.clear();
    handleMock.mockReset();
    clearSavedGithubTokenSecurelyMock.mockReset();
    readSavedGithubTokenWithHostMock.mockReset();
    saveGithubTokenSecurelyMock.mockReset();
    runGithubCliOneClickLoginMock.mockReset();
    getAuthorizedSelectedFileMock.mockReset();
    handleMock.mockImplementation((channel: string, callback: (...args: any[]) => Promise<any>) => {
      handlers.set(channel, callback);
    });
  });

  it('keeps a saved token after a transient restore failure', async () => {
    readSavedGithubTokenWithHostMock.mockReturnValue({ token: 'saved-token', host: 'github.com' });
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      authenticate: vi.fn().mockResolvedValue(false),
      getLastAuthenticationFailure: vi.fn().mockReturnValue({
        message: 'GitHub token validation timed out after 20 seconds.',
        invalidCredentials: false,
      }),
      getUsername: vi.fn().mockReturnValue(null),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService: { getRepoPath: vi.fn().mockReturnValue('C:/repos/project') } as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const result = await handlers.get('github:loginWithSavedToken')!({});

    expect(result).toEqual({
      success: false,
      authenticated: false,
      username: null,
      error: 'GitHub token validation timed out after 20 seconds.',
    });
    expect(clearSavedGithubTokenSecurelyMock).not.toHaveBeenCalled();
    expect(githubService.logout).not.toHaveBeenCalled();
  });

  it('removes a saved token only after confirmed invalid credentials', async () => {
    readSavedGithubTokenWithHostMock.mockReturnValue({ token: 'invalid-token', host: 'github.com' });
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      authenticate: vi.fn().mockResolvedValue(false),
      getLastAuthenticationFailure: vi.fn().mockReturnValue({
        message: 'Bad credentials',
        invalidCredentials: true,
      }),
      getUsername: vi.fn().mockReturnValue(null),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService: { getRepoPath: vi.fn().mockReturnValue('C:/repos/project') } as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const result = await handlers.get('github:loginWithSavedToken')!({});

    expect(result).toEqual({
      success: false,
      authenticated: false,
      username: null,
      error: 'Bad credentials',
    });
    expect(clearSavedGithubTokenSecurelyMock).toHaveBeenCalledTimes(1);
    expect(githubService.logout).toHaveBeenCalledTimes(1);
  });

  it('returns a validation failure to a personal-token login instead of leaving the renderer waiting', async () => {
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      authenticate: vi.fn().mockResolvedValue(false),
      getLastAuthenticationFailure: vi.fn().mockReturnValue({
        message: 'GitHub token validation timed out after 20 seconds.',
        invalidCredentials: false,
      }),
      getUsername: vi.fn().mockReturnValue(null),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService: {} as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const result = await handlers.get('github:auth')!({}, 'replacement-token', 'github.com');

    expect(result).toEqual({ success: false, error: 'GitHub token validation timed out after 20 seconds.' });
    expect(saveGithubTokenSecurelyMock).not.toHaveBeenCalled();
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
      runCommandAtPath: vi.fn().mockResolvedValue('abc123\x1fabc123\x1ffeat: release links\x1fTim\x1f2026-06-30'),
      resolveRepositoryPath: vi.fn((repoPath: string) => repoPath),
      getRepoPath: vi.fn(() => '/tmp/repo'),
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

    const result = await handler!({}, { owner: 'acme', repo: 'project', targetCommitish: 'main', repoPath: '/tmp/repo' });

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
      runCommandAtPath: vi.fn(async (_repoPath: string, args: string[]) => {
        if (args[0] === 'rev-parse') {
          throw new Error('missing local tag');
        }
        return 'def456\x1fdef456\x1ffix: fallback release context\x1fTim\x1f2026-06-30';
      }),
      resolveRepositoryPath: vi.fn((repoPath: string) => repoPath),
      getRepoPath: vi.fn(() => '/tmp/repo'),
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

    const result = await handler!({}, { owner: 'acme', repo: 'project', targetCommitish: 'master', repoPath: '/tmp/repo' });

    expect(result.success).toBe(true);
    expect(result.data.fallbackUsed).toBe(true);
    expect(result.data.commitsSinceLastRelease[0].shortHash).toBe('def456');
    expect(gitService.runCommandAtPath).toHaveBeenCalledWith('/tmp/repo', ['rev-parse', '--verify', '--quiet', 'v1.2.5^{commit}']);
    expect(gitService.runCommandAtPath).toHaveBeenCalledWith('/tmp/repo', [
      'log',
      'master',
      '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ad',
      '--date=short',
      '--max-count=150',
    ]);
    expect(gitService.runCommandAtPath.mock.calls.some((call: any[]) => Array.isArray(call[1]) && call[1][1] === 'v1.2.5..master')).toBe(false);
  });

  it('validates and normalizes create release input before calling GitHub', async () => {
    const createRelease = vi.fn().mockResolvedValue({
      id: 42,
      tagName: 'v1.3.0',
      name: 'Release 1.3.0',
      htmlUrl: 'https://github.com/acme/project/releases/tag/v1.3.0',
    });
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      createRelease,
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      authenticate: vi.fn(),
      getUsername: vi.fn().mockReturnValue('tim'),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService: {
        getRepoPath: vi.fn().mockReturnValue('C:/repos/project'),
        getRepoOriginUrl: vi.fn().mockResolvedValue('https://github.com/acme/project.git'),
      } as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const handler = handlers.get('github:createRelease');
    expect(handler).toBeTruthy();

    const invalidResult = await handler!({}, { owner: 'acme', repo: 'project', tagName: '   ', releaseName: 'Release 1.3.0' });
    expect(invalidResult).toEqual({ success: false, error: 'Tag-Name ist erforderlich.' });
    expect(createRelease).not.toHaveBeenCalled();

    const result = await handler!(
      {},
      {
        owner: 'acme',
        repo: 'project',
        repoPath: 'C:/repos/project',
        tagName: ' v1.3.0 ',
        targetCommitish: 'main',
        releaseName: ' Release 1.3.0 ',
        body: 'Notes',
        draft: true,
        prerelease: false,
      },
    );

    expect(result).toEqual({
      success: true,
      data: {
        id: 42,
        tagName: 'v1.3.0',
        name: 'Release 1.3.0',
        htmlUrl: 'https://github.com/acme/project/releases/tag/v1.3.0',
      },
    });
    expect(createRelease).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'project',
      tagName: 'v1.3.0',
      targetCommitish: 'main',
      releaseName: 'Release 1.3.0',
      body: 'Notes',
      draft: true,
      prerelease: false,
    });
  });

  it('accepts the fork origin itself as the release target', async () => {
    const createRelease = vi.fn().mockResolvedValue({ id: 43, tagName: 'v2.0.0' });
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      createRelease,
      normalizeHost: vi.fn((value: string) => String(value || 'github.com').toLowerCase()),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
    } as any;
    registerGithubHandlers({
      gitService: {
        getRepoPath: vi.fn().mockReturnValue('C:/repos/fork'),
        getRepoOriginUrl: vi.fn().mockResolvedValue('ssh://git@github.com/scm/fork-owner/project-fork.git'),
      } as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    await expect(
      handlers.get('github:createRelease')!(
        {},
        {
          owner: 'fork-owner',
          repo: 'project-fork',
          repoPath: 'C:/repos/fork',
          tagName: 'v2.0.0',
          releaseName: 'Fork release',
        },
      ),
    ).resolves.toMatchObject({ success: true });
    expect(createRelease).toHaveBeenCalledWith(expect.objectContaining({ owner: 'fork-owner', repo: 'project-fork' }));
  });

  it.each([
    ['a missing origin', null, 'The active repository has no matching GitHub origin.'],
    ['a changed origin', 'https://github.com/other/other-repo.git', 'Release target does not match the active repository origin.'],
  ])('rejects release creation for %s', async (_label, originUrl, expectedError) => {
    const createRelease = vi.fn();
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      createRelease,
      normalizeHost: vi.fn((value: string) => String(value || 'github.com').toLowerCase()),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
    } as any;
    registerGithubHandlers({
      gitService: {
        getRepoPath: vi.fn().mockReturnValue('C:/repos/project'),
        getRepoOriginUrl: vi.fn().mockResolvedValue(originUrl),
      } as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const result = await handlers.get('github:createRelease')!(
      {},
      {
        owner: 'acme',
        repo: 'project',
        repoPath: 'C:/repos/project',
        tagName: 'v1.0.0',
        releaseName: 'Release',
      },
    );

    expect(result).toEqual({ success: false, error: expectedError });
    expect(createRelease).not.toHaveBeenCalled();
  });

  it('rechecks the active repository after the asynchronous origin lookup', async () => {
    let activeRepo = 'C:/repos/project';
    let resolveOrigin: ((value: string) => void) | undefined;
    const createRelease = vi.fn();
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      createRelease,
      normalizeHost: vi.fn((value: string) => String(value || 'github.com').toLowerCase()),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
    } as any;
    registerGithubHandlers({
      gitService: {
        getRepoPath: vi.fn(() => activeRepo),
        getRepoOriginUrl: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              resolveOrigin = resolve;
            }),
        ),
      } as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const resultPromise = handlers.get('github:createRelease')!(
      {},
      {
        owner: 'acme',
        repo: 'project',
        repoPath: 'C:/repos/project',
        tagName: 'v1.0.0',
        releaseName: 'Release',
      },
    );
    await vi.waitFor(() => expect(resolveOrigin).toBeTypeOf('function'));
    activeRepo = 'C:/repos/other';
    resolveOrigin?.('https://github.com/acme/project.git');

    await expect(resultPromise).resolves.toEqual({ success: false, error: 'Requested repository is not the active repository.' });
    expect(createRelease).not.toHaveBeenCalled();
  });

  it('rejects release creation when the captured local repository is no longer active', async () => {
    const createRelease = vi.fn();
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      createRelease,
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
    } as any;

    registerGithubHandlers({
      gitService: { getRepoPath: vi.fn().mockReturnValue('C:/repos/repo-b') } as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    await expect(
      handlers.get('github:createRelease')!(
        {},
        {
          owner: 'acme',
          repo: 'project',
          tagName: 'v1.0.0',
          releaseName: 'Release v1.0.0',
        },
      ),
    ).resolves.toEqual({ success: false, error: 'Repository path is required.' });

    await expect(
      handlers.get('github:createRelease')!(
        {},
        {
          owner: 'acme',
          repo: 'project',
          repoPath: 'C:/repos/repo-a',
          tagName: 'v1.0.0',
          releaseName: 'Release v1.0.0',
        },
      ),
    ).resolves.toEqual({ success: false, error: 'Requested repository is not the active repository.' });
    expect(createRelease).not.toHaveBeenCalled();
  });

  it('only uploads release assets previously selected through the native dialog', async () => {
    const uploadReleaseAsset = vi.fn().mockResolvedValue({ id: 4, name: 'release.zip' });
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      uploadReleaseAsset,
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

    const handler = handlers.get('github:uploadReleaseAsset');
    expect(handler).toBeTruthy();
    const event = { sender: { id: 7 } };

    getAuthorizedSelectedFileMock.mockReturnValueOnce(null);
    await expect(handler!(event, { owner: 'acme', repo: 'project', releaseId: 4, filePath: 'C:/private/secret.txt' })).resolves.toEqual({
      success: false,
      error: 'RELEASE_ASSET_FILE_NOT_AUTHORIZED',
    });
    expect(uploadReleaseAsset).not.toHaveBeenCalled();

    getAuthorizedSelectedFileMock.mockReturnValueOnce('C:/selected/release.zip');
    await expect(handler!(event, { owner: 'acme', repo: 'project', releaseId: 4, filePath: 'C:/selected/release.zip' })).resolves.toEqual({
      success: true,
      data: { id: 4, name: 'release.zip' },
    });
    expect(getAuthorizedSelectedFileMock).toHaveBeenLastCalledWith(7, 'C:/selected/release.zip');
    expect(uploadReleaseAsset).toHaveBeenCalledWith({ owner: 'acme', repo: 'project', releaseId: 4, filePath: 'C:/selected/release.zip' });
  });

  it('does not persist a device-flow result after logout invalidated the polling request', async () => {
    let resolveAuthentication: ((value: boolean) => void) | undefined;
    const authenticate = vi.fn(
      async () =>
        new Promise<boolean>((resolve) => {
          resolveAuthentication = resolve;
        }),
    );
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      pollDeviceFlow: vi.fn().mockResolvedValue({ status: 'success', accessToken: 'stale-token' }),
      getAuthenticationGeneration: vi.fn().mockReturnValue(0),
      authenticate,
      getUsername: vi.fn().mockReturnValue('stale-user'),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService: {} as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: 'client-id' }),
    });

    const pollPromise = handlers.get('github:devicePoll')!({}, 'device-code');
    await vi.waitFor(() => expect(authenticate).toHaveBeenCalled());
    await handlers.get('github:logout')!({});
    resolveAuthentication?.(true);

    await expect(pollPromise).resolves.toEqual({ success: false, error: 'GitHub-Anmeldung wurde abgebrochen.' });
    expect(saveGithubTokenSecurelyMock).not.toHaveBeenCalled();
    expect(githubService.logout).toHaveBeenCalledTimes(1);
  });

  it('reports persistence failure after clearing the live session when the saved token cannot be deleted', async () => {
    clearSavedGithubTokenSecurelyMock.mockImplementationOnce(() => {
      throw new Error('credential file is locked');
    });
    const githubService = {
      getAuthenticationGeneration: vi.fn().mockReturnValue(0),
      isAuthenticated: vi.fn().mockReturnValue(true),
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService: {} as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    await expect(handlers.get('github:logout')!({})).resolves.toEqual({
      success: false,
      error: 'credential file is locked',
      sessionCleared: true,
    });
    expect(githubService.logout).toHaveBeenCalledTimes(1);
  });

  it('does not persist a device-flow result after explicit login cancellation', async () => {
    let resolvePoll: ((value: any) => void) | undefined;
    let serviceGeneration = 0;
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      getAuthenticationGeneration: vi.fn(() => serviceGeneration),
      cancelPendingAuthentication: vi.fn(() => {
        serviceGeneration += 1;
      }),
      pollDeviceFlow: vi.fn(
        () =>
          new Promise((resolve) => {
            resolvePoll = resolve;
          }),
      ),
      authenticate: vi.fn(),
      getUsername: vi.fn().mockReturnValue(null),
      logout: vi.fn(),
    } as any;
    registerGithubHandlers({
      gitService: {} as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: 'client-id' }),
    });

    const pollPromise = handlers.get('github:devicePoll')!({}, 'device-code');
    await vi.waitFor(() => expect(resolvePoll).toBeTypeOf('function'));
    await handlers.get('github:cancelAuth')!({});
    resolvePoll?.({ status: 'success', accessToken: 'stale-token' });

    await expect(pollPromise).resolves.toEqual({ success: false, error: 'GitHub-Anmeldung wurde abgebrochen.' });
    expect(githubService.cancelPendingAuthentication).toHaveBeenCalledTimes(1);
    expect(githubService.authenticate).not.toHaveBeenCalled();
    expect(saveGithubTokenSecurelyMock).not.toHaveBeenCalled();
  });

  it('aborts the GitHub CLI child process when web login is cancelled', async () => {
    let receivedSignal: AbortSignal | undefined;
    runGithubCliOneClickLoginMock.mockImplementation(
      (_host: string, signal?: AbortSignal) =>
        new Promise((resolve, reject) => {
          receivedSignal = signal;
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      getAuthenticationGeneration: vi.fn().mockReturnValue(0),
      cancelPendingAuthentication: vi.fn(),
      authenticate: vi.fn(),
      getUsername: vi.fn().mockReturnValue(null),
      logout: vi.fn(),
    } as any;

    registerGithubHandlers({
      gitService: {} as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const loginPromise = handlers.get('github:webLogin')!({});
    await vi.waitFor(() => expect(receivedSignal).toBeDefined());
    await handlers.get('github:cancelAuth')!({});

    expect(receivedSignal?.aborted).toBe(true);
    await expect(loginPromise).resolves.toEqual({ success: false, error: 'GitHub-Anmeldung wurde abgebrochen.' });
    expect(githubService.cancelPendingAuthentication).toHaveBeenCalledTimes(1);
  });

  it('invalidates device polling when settings logout changes the service generation', async () => {
    let resolvePoll: ((value: any) => void) | undefined;
    let serviceGeneration = 0;
    const authenticate = vi.fn();
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      getAuthenticationGeneration: vi.fn(() => serviceGeneration),
      pollDeviceFlow: vi.fn(
        () =>
          new Promise((resolve) => {
            resolvePoll = resolve;
          }),
      ),
      authenticate,
      getUsername: vi.fn().mockReturnValue(null),
      logout: vi.fn(() => {
        serviceGeneration += 1;
      }),
    } as any;
    registerGithubHandlers({
      gitService: {} as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: 'client-id' }),
    });

    const pollPromise = handlers.get('github:devicePoll')!({}, 'device-code');
    await vi.waitFor(() => expect(resolvePoll).toBeTypeOf('function'));
    githubService.logout();
    resolvePoll?.({ status: 'success', accessToken: 'stale-token' });

    await expect(pollPromise).resolves.toEqual({ success: false, error: 'GitHub-Anmeldung wurde abgebrochen.' });
    expect(authenticate).not.toHaveBeenCalled();
    expect(saveGithubTokenSecurelyMock).not.toHaveBeenCalled();
  });

  it('returns an outer failure when GitHub declines a pull request merge', async () => {
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      mergePullRequest: vi.fn().mockResolvedValue({ sha: '', merged: false, message: 'Branch protection blocked this merge' }),
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

    const result = await handlers.get('github:mergePR')!({}, { owner: 'acme', repo: 'project', pullNumber: 7, mergeMethod: 'squash' });

    expect(result).toEqual({ success: false, error: 'Branch protection blocked this merge' });
  });

  it('rejects release context reads for a renderer-selected non-active repository', async () => {
    const listRepositoryTags = vi.fn();
    const githubService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      listRepositoryTags,
      normalizeHost: vi.fn().mockReturnValue('github.com'),
      isDeviceFlowConfigured: vi.fn().mockReturnValue(true),
      authenticate: vi.fn(),
      getUsername: vi.fn().mockReturnValue('tim'),
      logout: vi.fn(),
    } as any;
    registerGithubHandlers({
      gitService: { getRepoPath: vi.fn(() => '/tmp/active-repo') } as any,
      githubService,
      readSettingsWithMigration: vi.fn().mockReturnValue({ githubHost: 'github.com', githubOauthClientId: '' }),
    });

    const result = await handlers.get('github:getReleaseContext')!({}, { owner: 'acme', repo: 'project', repoPath: '/tmp/private-other-repo' });

    expect(result).toEqual({ success: false, error: 'Requested repository is not the active repository.' });
    expect(listRepositoryTags).not.toHaveBeenCalled();
  });
});
