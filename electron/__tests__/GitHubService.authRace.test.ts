import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubService } from '../GitHubService';
import { GitHubAuthService } from '../github/GitHubAuthService';

afterEach(() => {
  vi.restoreAllMocks();
});

const session = (username: string, token: string) => ({
  octokit: {} as any,
  token,
  username,
  host: 'github.com',
});

describe('GitHubService authentication generation', () => {
  it('does not restore a session when logout wins an in-flight authentication race', async () => {
    let resolveAuthentication: ((value: any) => void) | undefined;
    vi.spyOn(GitHubAuthService.prototype, 'authenticate').mockReturnValue(
      new Promise((resolve) => {
        resolveAuthentication = resolve;
      }),
    );
    const service = new GitHubService();

    const authentication = service.authenticate('old-token', 'github.com');
    service.logout();
    resolveAuthentication?.(session('old-user', 'old-token'));

    await expect(authentication).resolves.toBe(false);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getUsername()).toBeNull();
  });

  it('invalidates an in-flight authentication without clearing an existing session', async () => {
    let resolveAuthentication: ((value: any) => void) | undefined;
    vi.spyOn(GitHubAuthService.prototype, 'authenticate')
      .mockResolvedValueOnce(session('current-user', 'current-token'))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAuthentication = resolve;
        }),
      );
    const service = new GitHubService();
    await expect(service.authenticate('current-token', 'github.com')).resolves.toBe(true);

    const replacement = service.authenticate('replacement-token', 'github.com');
    service.cancelPendingAuthentication();
    resolveAuthentication?.(session('replacement-user', 'replacement-token'));

    await expect(replacement).resolves.toBe(false);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.getUsername()).toBe('current-user');
  });

  it('does not let an older authentication clear or replace a newer session', async () => {
    let resolveOlderAuthentication: ((value: any) => void) | undefined;
    vi.spyOn(GitHubAuthService.prototype, 'authenticate')
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlderAuthentication = resolve;
        }),
      )
      .mockResolvedValueOnce(session('new-user', 'new-token'));
    const service = new GitHubService();

    const olderAuthentication = service.authenticate('old-token', 'github.com');
    await expect(service.authenticate('new-token', 'github.com')).resolves.toBe(true);
    resolveOlderAuthentication?.(session('old-user', 'old-token'));

    await expect(olderAuthentication).resolves.toBe(false);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.getUsername()).toBe('new-user');
  });
});
