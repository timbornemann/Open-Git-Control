// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import type { SettingsTabId } from '@/app/state/contracts';
import { I18nProvider } from '@/i18n';
import { SettingsMainContent } from './SettingsMainContent';

describe('SettingsMainContent AI and MCP organization', () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (activeTab: SettingsTabId) => {
    act(() => {
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(SettingsMainContent, {
            settings: DEFAULT_SETTINGS,
            onUpdateSettings: vi.fn().mockResolvedValue(undefined),
            jobs: [],
            onClearJobs: vi.fn(),
            activeTab,
            onResetLayout: vi.fn(),
          }),
        }),
      );
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('shows AI configuration with MCP settings instead of integrations', () => {
    render('integrations');
    expect(host.textContent).toContain('GitHub');
    expect(host.textContent).not.toContain('Enable AI auto-commit');

    render('api');
    expect(host.textContent).toContain('Enable AI auto-commit');
    expect(host.textContent).toContain('Local API');
  });
});
