// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appClient } from '@/services/appClient';
import { DEFAULT_SETTINGS } from './defaultSettings';
import { useSettingsState } from './useSettingsState';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useSettingsState update results', () => {
  it('returns a failure result and keeps renderer settings unchanged when persistence fails', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
    vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(appClient, 'getSettings').mockResolvedValue(DEFAULT_SETTINGS);
    vi.spyOn(appClient, 'setSettings').mockRejectedValue(new Error('GitHub token file is locked.'));
    const setGitActionToast = vi.fn();
    let current: ReturnType<typeof useSettingsState> | null = null;
    const Harness = () => {
      current = useSettingsState({ setGitActionToast });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(createElement(Harness));
      await Promise.resolve();
    });

    let result: Awaited<ReturnType<NonNullable<typeof current>['updateSettingsWithResult']>> | undefined;
    await act(async () => {
      result = await current!.updateSettingsWithResult({ githubHost: 'github.enterprise.test' });
    });

    expect(result).toEqual({ success: false, error: 'GitHub token file is locked.' });
    expect(current!.settings.githubHost).toBe(DEFAULT_SETTINGS.githubHost);
    expect(setGitActionToast).toHaveBeenLastCalledWith({ msg: 'GitHub token file is locked.', isError: true });
    act(() => root.unmount());
  });
});
