// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { SettingsGithubSection } from '@/components/layout/settings/SettingsGithubSection';
import { I18nProvider } from '@/i18n';

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
  it('shows the GitHub Enterprise host and saves it only after editing is complete', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);

    act(() => {
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

    expect(container.textContent).toContain('GitHub host (GitHub Enterprise)');
    const hostInput = container.querySelector<HTMLInputElement>('input[placeholder="github.com"]');
    if (!hostInput) throw new Error('Missing GitHub host input.');

    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!valueSetter) throw new Error('Missing input value setter.');
    act(() => {
      valueSetter.call(hostInput, 'github.enterprise.local');
      hostInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    expect(onUpdateSettings).not.toHaveBeenCalled();

    await act(async () => {
      hostInput.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onUpdateSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateSettings).toHaveBeenCalledWith({ githubHost: 'github.enterprise.local' });
  });
});
