// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import type { SettingsTabId } from '@/app/state/contracts';
import { I18nProvider } from '@/i18n';
import { SettingsMainContent } from './SettingsMainContent';
import { hostingClient } from '@/services/hostingClient';
import { useHostingState } from '@/components/hosting/hostingState';
import * as feedbackContext from '@/contexts/FeedbackReportContext';

describe('SettingsMainContent AI and MCP organization', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onSelectTab = vi.fn();
  const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
  const onResetLayout = vi.fn();

  const changeInput = (input: HTMLInputElement, value: string) => {
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  };

  const render = async (activeTab: SettingsTabId, language: 'en' | 'de' = 'en') => {
    await act(async () => {
      root.render(
        createElement(I18nProvider, {
          language,
          children: createElement(SettingsMainContent, {
            settings: { ...DEFAULT_SETTINGS, language },
            onUpdateSettings,
            jobs: [],
            onClearJobs: vi.fn(),
            activeTab,
            onSelectTab,
            onResetLayout,
          }),
        }),
      );
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useHostingState.getState().setConnections([]);
    vi.spyOn(feedbackContext, 'useFeedbackReport').mockReturnValue({
      capability: null,
      openManualReport: vi.fn(),
      getToastStatus: () => ({ state: 'idle' }),
      handleToastAction: vi.fn(),
    });
    vi.spyOn(hostingClient, 'request').mockResolvedValue([]);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('shows AI configuration with MCP settings instead of integrations', async () => {
    await render('integrations');
    expect(host.textContent).toContain('Connected accounts');
    expect(host.textContent).toContain('Add connection');
    expect(host.textContent).not.toContain('Enable AI auto-commit');

    await render('api');
    expect(host.textContent).toContain('Enable AI auto-commit');
    expect(host.textContent).toContain('Local API');
  });

  it('finds a setting in another category and focuses its group after navigation', async () => {
    await render('general');
    changeInput(host.querySelector<HTMLInputElement>('input[type="search"]')!, 'secret scan');
    const result = [...host.querySelectorAll<HTMLButtonElement>('.settings-search-result')].find(
      (button) => button.querySelector('strong')?.textContent === 'Secret scan',
    )!;
    expect(result).toBeDefined();
    act(() => result.click());
    expect(onSelectTab).toHaveBeenCalledExactlyOnceWith('security');
    await render('security');
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');
    expect(document.activeElement).toBe(host.querySelector('#settings-secret-scan-title'));
    expect(onUpdateSettings).not.toHaveBeenCalled();
  });

  it('provides a separate searchable Git identity group in General settings', async () => {
    await render('general');
    expect(host.querySelector('#settings-git-identity-title')?.textContent).toBe('Git commit identity');
    expect(host.querySelector('#settings-git-identity')?.textContent).toContain('Globally on this computer');
    changeInput(host.querySelector<HTMLInputElement>('input[type="search"]')!, 'user.email');
    const result = host.querySelector<HTMLButtonElement>('.settings-search-result')!;
    expect(result.textContent).toContain('Git commit identity');
    act(() => result.click());
    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(host.querySelector('#settings-git-identity-title'));
  });

  it('keeps an unsaved URL draft while searching and clearing search', async () => {
    await render('api');
    const url = host.querySelector<HTMLInputElement>('input[placeholder="http://127.0.0.1:11434"]')!;
    changeInput(url, 'http:');
    changeInput(host.querySelector<HTMLInputElement>('input[type="search"]')!, 'not-a-setting');
    expect(host.querySelector('.settings-empty')?.textContent).toContain('No matching settings');
    expect(host.querySelector('.settings-category-content')?.hasAttribute('hidden')).toBe(true);
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]')!.click());
    expect(host.querySelector('.settings-category-content')?.hasAttribute('hidden')).toBe(false);
    expect(host.querySelector<HTMLInputElement>('input[placeholder="http://127.0.0.1:11434"]')).toBe(url);
    expect(url.value).toBe('http:');
    expect(onUpdateSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['Standardbranch', 'Git & Commits'],
    ['Auto-Fetch', 'Synchronisierung'],
  ])('finds the German field label %s', async (query, title) => {
    await render('general', 'de');
    changeInput(host.querySelector<HTMLInputElement>('input[type="search"]')!, query);
    expect([...host.querySelectorAll('.settings-search-result strong')].map((item) => item.textContent)).toContain(title);
    expect(onUpdateSettings).not.toHaveBeenCalled();
  });

  it('saves theme and checkbox changes and keeps layout reset reachable', async () => {
    await render('general');
    const theme = host.querySelector<HTMLSelectElement>('#settings-appearance select')!;
    act(() => {
      theme.value = 'porcelain-light';
      theme.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    expect(onUpdateSettings).toHaveBeenCalledWith({ theme: 'porcelain-light' });
    const history = host.querySelector<HTMLInputElement>('#settings-workflow input[type="checkbox"]')!;
    const checked = history.checked;
    act(() => history.click());
    expect(onUpdateSettings).toHaveBeenCalledWith({ showSecondaryHistory: !checked });
    act(() => host.querySelector<HTMLButtonElement>('.settings-reset-layout-btn')!.click());
    expect(onResetLayout).toHaveBeenCalledOnce();
  });

  it('exposes diagnostics and operation history in system settings', async () => {
    await render('system');
    expect(host.querySelector('#settings-diagnostics button')?.textContent).toContain('Copy diagnostics report');
    expect(host.querySelector('#settings-jobs')?.textContent).toContain('No jobs available');
  });
});
