// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubClient } from '@/services/githubClient';
import { useGitHubAuth } from './useGitHubAuth';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useGitHubAuth logout persistence failure', () => {
  it('clears authenticated state when the session was cleared but the saved token could not be deleted', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
    vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(githubClient, 'getSavedAuthStatus').mockResolvedValue({
      hasSavedToken: false,
      authenticated: true,
      username: 'octocat',
      oauthConfigured: true,
    });
    vi.spyOn(githubClient, 'logout').mockResolvedValue({ success: false, error: 'Token file is locked.', sessionCleared: true });
    let current: ReturnType<typeof useGitHubAuth> | null = null;
    const Harness = () => {
      current = useGitHubAuth();
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(createElement(Harness));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(current?.isAuthenticated).toBe(true));

    await act(async () => current!.handleLogout());

    expect(current!.isAuthenticated).toBe(false);
    expect(current!.githubUser).toBeNull();
    expect(current!.githubRepos).toEqual([]);
    expect(current!.authError).toBe('Token file is locked.');
    act(() => root.unmount());
  });
});
