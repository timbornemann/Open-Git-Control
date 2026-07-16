import { JSDOM } from 'jsdom';
import { StrictMode, act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appClient } from '@/services/appClient';
import { githubClient } from '@/services/githubClient';
import { useGithubDomain } from '../useGithubDomain';

type GithubDomain = ReturnType<typeof useGithubDomain>;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const renderStrictHook = () => {
  let current: GithubDomain | null = null;
  let githubHost = 'github.com';
  const root: Root = createRoot(document.createElement('div'));
  const HookHarness = () => {
    current = useGithubDomain({
      onRepoCloned: vi.fn().mockResolvedValue(undefined),
      setActiveTab: vi.fn(),
      language: 'en',
      githubOauthClientId: 'client-id',
      githubHost,
    });
    return null;
  };

  act(() => {
    root.render(createElement(StrictMode, null, createElement(HookHarness)));
  });

  return {
    get current() {
      if (!current) throw new Error('GitHub domain did not render.');
      return current;
    },
    rerenderHost: (nextHost: string) => {
      githubHost = nextHost;
      act(() => root.render(createElement(StrictMode, null, createElement(HookHarness))));
    },
    unmount: () => act(() => root.unmount()),
  };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useGithubDomain StrictMode bootstrap', () => {
  it('does not leave the authentication UI in Connecting after a StrictMode bootstrap without a saved token', async () => {
    vi.spyOn(githubClient, 'getSavedAuthStatus').mockResolvedValue({
      hasSavedToken: false,
      authenticated: false,
      username: null,
      oauthConfigured: true,
    });

    const hook = renderStrictHook();
    await flush();

    expect(hook.current.isAuthenticating).toBe(false);
    expect(hook.current.isAuthenticated).toBe(false);
    expect(hook.current.oauthConfigured).toBe(true);
    hook.unmount();
  });

  it('restores a saved session under StrictMode without leaving the UI locked', async () => {
    vi.spyOn(githubClient, 'getSavedAuthStatus').mockResolvedValue({
      hasSavedToken: true,
      authenticated: false,
      username: null,
      oauthConfigured: true,
    });
    vi.spyOn(githubClient, 'loginWithSavedToken').mockResolvedValue({
      success: true,
      authenticated: true,
      username: 'octocat',
      tokenPersisted: true,
    });
    vi.spyOn(githubClient, 'getRepositories').mockResolvedValue({
      success: true,
      data: { repos: [], nextPage: null, hasMore: false },
    });

    const hook = renderStrictHook();
    await flush();

    expect(hook.current.isAuthenticating).toBe(false);
    expect(hook.current.isAuthenticated).toBe(true);
    expect(hook.current.githubUser).toBe('octocat');
    hook.unmount();
  });

  it('keeps an already active GitHub session visible when restoring the saved token fails transiently', async () => {
    vi.spyOn(githubClient, 'getSavedAuthStatus').mockResolvedValue({
      hasSavedToken: true,
      authenticated: true,
      username: 'octocat',
      oauthConfigured: true,
    });
    vi.spyOn(githubClient, 'loginWithSavedToken').mockResolvedValue({
      success: false,
      authenticated: true,
      username: 'octocat',
      error: 'GitHub token validation timed out after 20 seconds.',
    });
    vi.spyOn(githubClient, 'getRepositories').mockResolvedValue({
      success: true,
      data: { repos: [], nextPage: null, hasMore: false },
    });

    const hook = renderStrictHook();
    await flush();

    expect(hook.current.isAuthenticated).toBe(true);
    expect(hook.current.githubUser).toBe('octocat');
    expect(hook.current.authError).toBe('GitHub token validation timed out after 20 seconds.');
    hook.unmount();
  });

  it('lets the user cancel a pending personal-token login', async () => {
    vi.spyOn(githubClient, 'getSavedAuthStatus').mockResolvedValue({
      hasSavedToken: false,
      authenticated: false,
      username: null,
      oauthConfigured: true,
    });
    let resolveAuthentication: ((value: { success: boolean }) => void) | undefined;
    vi.spyOn(githubClient, 'auth').mockReturnValue(
      new Promise((resolve) => {
        resolveAuthentication = resolve;
      }),
    );
    const cancelAuth = vi.spyOn(githubClient, 'cancelAuth').mockResolvedValue({ success: true });

    const hook = renderStrictHook();
    await flush();

    act(() => {
      hook.current.setTokenInput('token');
    });
    act(() => {
      void hook.current.handleTokenLogin();
    });
    await flush();

    expect(hook.current.isAuthenticating).toBe(true);

    act(() => {
      hook.current.handleCancelAuthentication();
    });

    expect(hook.current.isAuthenticating).toBe(false);
    expect(cancelAuth).toHaveBeenCalledTimes(1);

    resolveAuthentication?.({ success: true });
    await flush();
    hook.unmount();
  });

  it('reports a one-click login failure through the app-wide error channel', async () => {
    const onError = vi.fn();
    vi.spyOn(githubClient, 'getSavedAuthStatus').mockResolvedValue({
      hasSavedToken: false,
      authenticated: false,
      username: null,
      oauthConfigured: true,
    });
    vi.spyOn(githubClient, 'webLogin').mockResolvedValue({ success: false, error: 'GitHub is temporarily unavailable (HTTP 503).' });

    let current: GithubDomain | null = null;
    const root: Root = createRoot(document.createElement('div'));
    const HookHarness = () => {
      current = useGithubDomain({
        onRepoCloned: vi.fn().mockResolvedValue(undefined),
        setActiveTab: vi.fn(),
        language: 'en',
        githubOauthClientId: 'client-id',
        githubHost: 'github.com',
        onError,
      });
      return null;
    };
    act(() => root.render(createElement(HookHarness)));
    await flush();

    await act(async () => current!.handleStartWebFlowLogin());

    expect(onError).toHaveBeenCalledWith('GitHub is temporarily unavailable (HTTP 503).');
    expect(current!.webFlowError).toBe('GitHub is temporarily unavailable (HTTP 503).');
    act(() => root.unmount());
  });

  it('marks a device flow as running before its start request resolves', async () => {
    vi.spyOn(githubClient, 'getSavedAuthStatus').mockResolvedValue({
      hasSavedToken: false,
      authenticated: false,
      username: null,
      oauthConfigured: true,
    });
    let resolveDeviceStart: ((value: { success: boolean; error?: string }) => void) | undefined;
    vi.spyOn(githubClient, 'deviceStart').mockReturnValue(
      new Promise((resolve) => {
        resolveDeviceStart = resolve;
      }),
    );
    const cancelAuth = vi.spyOn(githubClient, 'cancelAuth').mockResolvedValue({ success: true });

    const hook = renderStrictHook();
    await flush();

    let start: Promise<void> | undefined;
    act(() => {
      start = hook.current.handleStartDeviceFlowLogin();
    });
    await flush();

    expect(hook.current.isDeviceFlowRunning).toBe(true);

    act(() => {
      hook.current.handleCancelDeviceFlow();
    });
    expect(hook.current.isDeviceFlowRunning).toBe(false);
    expect(cancelAuth).toHaveBeenCalledTimes(1);

    resolveDeviceStart?.({ success: false, error: 'Cancelled' });
    await act(async () => {
      await start;
    });
    hook.unmount();
  });

  it('clears repositories from the previous host before bootstrapping the next host', async () => {
    let resolveNextHost!: (value: { hasSavedToken: false; authenticated: false; username: null; oauthConfigured: true }) => void;
    vi.spyOn(githubClient, 'getSavedAuthStatus')
      .mockResolvedValueOnce({ hasSavedToken: true, authenticated: false, username: null, oauthConfigured: true })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNextHost = resolve;
        }),
      );
    vi.spyOn(githubClient, 'loginWithSavedToken').mockResolvedValue({
      success: true,
      authenticated: true,
      username: 'octocat',
      tokenPersisted: true,
    });
    vi.spyOn(githubClient, 'getRepositories').mockResolvedValue({
      success: true,
      data: {
        repos: [{ id: 1, name: 'old', fullName: 'octo/old', private: false, cloneUrl: 'https://old', htmlUrl: 'https://old' }],
        nextPage: null,
        hasMore: false,
      },
    });
    const hook = renderStrictHook();
    await flush();
    await vi.waitFor(() => expect(hook.current.githubRepos).toHaveLength(1));

    hook.rerenderHost('github.enterprise.test');
    expect(hook.current.githubRepos).toEqual([]);
    expect(hook.current.isAuthenticated).toBe(false);

    resolveNextHost({ hasSavedToken: false, authenticated: false, username: null, oauthConfigured: true });
    await flush();
    hook.unmount();
  });

  it('fully resets an active device flow when the GitHub host changes', async () => {
    vi.spyOn(githubClient, 'getSavedAuthStatus').mockResolvedValue({
      hasSavedToken: false,
      authenticated: false,
      username: null,
      oauthConfigured: true,
    });
    vi.spyOn(githubClient, 'deviceStart').mockResolvedValue({
      success: true,
      data: {
        deviceCode: 'device-code',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://github.com/login/device',
        expiresIn: 900,
        interval: 30,
      },
    });
    vi.spyOn(appClient, 'openExternalUrl').mockResolvedValue(true);
    const hook = renderStrictHook();
    await flush();

    await act(async () => hook.current.handleStartDeviceFlowLogin());
    expect(hook.current.isDeviceFlowRunning).toBe(true);
    expect(hook.current.deviceFlow?.deviceCode).toBe('device-code');

    hook.rerenderHost('github.enterprise.test');

    expect(hook.current.isAuthenticating).toBe(false);
    expect(hook.current.isDeviceFlowRunning).toBe(false);
    expect(hook.current.deviceFlow).toBeNull();
    expect(hook.current.deviceFlowError).toBeNull();
    expect(hook.current.isWebFlowRunning).toBe(false);
    expect(hook.current.webFlowError).toBeNull();
    hook.unmount();
  });

  it('clears the live UI session but reports the persistence error when secure token deletion fails', async () => {
    vi.spyOn(githubClient, 'getSavedAuthStatus').mockResolvedValue({ hasSavedToken: true, authenticated: false, username: null, oauthConfigured: true });
    vi.spyOn(githubClient, 'loginWithSavedToken').mockResolvedValue({ success: true, authenticated: true, username: 'octocat', tokenPersisted: true });
    vi.spyOn(githubClient, 'getRepositories').mockResolvedValue({
      success: true,
      data: {
        repos: [{ id: 1, name: 'repo', fullName: 'octocat/repo', private: false, cloneUrl: 'https://clone', htmlUrl: 'https://html' }],
        nextPage: null,
        hasMore: false,
      },
    });
    vi.spyOn(githubClient, 'logout').mockResolvedValue({ success: false, error: 'Token file is locked.', sessionCleared: true });
    const hook = renderStrictHook();
    await flush();
    expect(hook.current.isAuthenticated).toBe(true);
    await vi.waitFor(() => expect(hook.current.githubRepos).toHaveLength(1));

    await act(async () => hook.current.handleLogout());

    expect(hook.current.isAuthenticated).toBe(false);
    expect(hook.current.githubUser).toBeNull();
    expect(hook.current.githubRepos).toEqual([]);
    expect(hook.current.authError).toBe('Token file is locked.');
    hook.unmount();
  });
});
