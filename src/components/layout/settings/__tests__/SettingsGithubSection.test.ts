// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { SettingsGithubSection } from '@/components/layout/settings/SettingsGithubSection';
import { I18nProvider } from '@/i18n';
import { hostingClient } from '@/services/hostingClient';
import { useHostingState } from '@/components/hosting/hostingState';

let root: Root | null = null;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SettingsGithubSection', () => {
  it('configures an account-specific Enterprise server and saves it only after explicit submission', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
    useHostingState.getState().setConnections([]);
    const connection = {
      id: 'enterprise',
      provider: 'github' as const,
      label: 'GitHub',
      baseUrl: 'https://github.enterprise.local',
      apiBaseUrl: 'https://github.enterprise.local/api/v3',
      username: null,
      userId: null,
      authenticated: false,
      hasCredentials: false,
    };
    const request = vi.spyOn(hostingClient, 'request').mockResolvedValueOnce([]).mockResolvedValueOnce(connection).mockResolvedValue([connection]);
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(
          I18nProvider,
          { language: 'en' },
          createElement(SettingsGithubSection, {
            settings: { ...DEFAULT_SETTINGS, githubHost: 'github.com' },
            onUpdateSettings,
            variant: 'main',
          }),
        ),
      );
    });

    expect(container.textContent).toContain('Connected accounts');
    expect(container.querySelector('form')).toBeNull();
    const addConnection = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Add connection');
    if (!addConnection) throw new Error('Missing add connection action.');
    act(() => addConnection.click());
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('Missing connection editor dialog.');
    const provider = dialog.querySelector<HTMLSelectElement>('select');
    if (!provider) throw new Error('Missing provider selector.');
    act(() => {
      provider.value = 'github';
      provider.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    const hostInput = dialog.querySelector<HTMLInputElement>('input[placeholder="https://github.com"]');
    if (!hostInput) throw new Error('Missing GitHub host input.');

    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!valueSetter) throw new Error('Missing input value setter.');
    act(() => {
      valueSetter.call(hostInput, 'https://github.enterprise.local');
      hostInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    expect(onUpdateSettings).not.toHaveBeenCalled();

    await act(async () => {
      hostInput.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });

    expect(request).not.toHaveBeenCalledWith('saveConnection', expect.anything());
    const form = dialog.querySelector('form');
    if (!form) throw new Error('Missing hosting connection form.');
    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(request).toHaveBeenCalledWith('saveConnection', expect.objectContaining({ provider: 'github', baseUrl: 'https://github.enterprise.local' }));
    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain('https://github.enterprise.local');
    expect(useHostingState.getState().connections).toEqual([connection]);
  });
});
