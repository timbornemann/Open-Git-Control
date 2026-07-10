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
  const root: Root = createRoot(document.createElement('div'));
  const HookHarness = () => {
    current = useGithubDomain({
      onRepoCloned: vi.fn().mockResolvedValue(undefined),
      setActiveTab: vi.fn(),
      language: 'en',
      githubOauthClientId: 'client-id',
      githubHost: 'github.com',
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
});
