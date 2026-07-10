import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubService } from '../GitHubService';
import { GitHubAuthService } from '../github/GitHubAuthService';

afterEach(() => {
  vi.useRealTimers();
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

  it('keeps an existing session when a replacement token fails for a transient reason', async () => {
    vi.spyOn(GitHubAuthService.prototype, 'authenticate').mockResolvedValueOnce(session('current-user', 'current-token')).mockResolvedValueOnce(null);
    vi.spyOn(GitHubAuthService.prototype, 'getLastAuthenticationFailure').mockReturnValue({
      message: 'GitHub token validation timed out after 20 seconds.',
      invalidCredentials: false,
    });
    const service = new GitHubService();

    await expect(service.authenticate('current-token', 'github.com')).resolves.toBe(true);
    await expect(service.authenticate('replacement-token', 'github.com')).resolves.toBe(false);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.getUsername()).toBe('current-user');
    expect(service.getLastAuthenticationFailure()).toEqual({
      message: 'GitHub token validation timed out after 20 seconds.',
      invalidCredentials: false,
    });
  });
});

describe('GitHubAuthService request guards', () => {
  const timeoutRunner = (service: GitHubAuthService) =>
    service as unknown as {
      runWithTimeout<T>(request: (signal: AbortSignal) => Promise<T>, operation: string, parentSignal?: AbortSignal): Promise<T>;
    };

  it('does not start a request when its parent authentication has already been cancelled', async () => {
    const parent = new AbortController();
    parent.abort();
    const request = vi.fn();

    await expect(timeoutRunner(new GitHubAuthService()).runWithTimeout(request, 'GitHub token validation', parent.signal)).rejects.toThrow(
      'GitHub token validation was cancelled.',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('enforces the authentication deadline even if a request ignores its abort signal', async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      () =>
        new Promise<never>(() => {
          // Intentionally never resolves; the deadline must release the caller.
        }),
    );
    const pending = timeoutRunner(new GitHubAuthService()).runWithTimeout(request, 'GitHub token validation');
    const rejection = expect(pending).rejects.toThrow('GitHub token validation timed out after 20 seconds.');

    await vi.advanceTimersByTimeAsync(20_000);

    await rejection;
    expect(request).toHaveBeenCalledTimes(1);
  });
});
