// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { ActionToastViewport } from '@/components/ActionToastViewport';
import { FeedbackReportProvider } from './FeedbackReportContext';

const { appClientMock, settingsState, uiState, githubState } = vi.hoisted(() => ({
  appClientMock: {
    isAvailable: vi.fn(() => true),
    getFeedbackReportCapability: vi.fn(),
    submitFeedbackReport: vi.fn(),
    openExternalUrl: vi.fn(),
    getDiagnosticsReport: vi.fn(),
  },
  settingsState: { settings: { githubHost: 'github.com' } },
  uiState: { activeTab: 'repo', confirmDialog: null, inputDialog: null },
  githubState: { isAuthenticated: true },
}));

vi.mock('@/services/appClient', () => ({ appClient: appClientMock }));
vi.mock('@/contexts/AppStateContext', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
  useUIStore: (selector: (state: typeof uiState) => unknown) => selector(uiState),
  useGitHubStore: (selector: (state: typeof githubState) => unknown) => selector(githubState),
}));

describe('FeedbackReportProvider', () => {
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
    appClientMock.getFeedbackReportCapability.mockReset().mockResolvedValue({ directSubmissionAvailable: true, reason: null });
    appClientMock.submitFeedbackReport.mockReset();
    appClientMock.openExternalUrl.mockReset().mockResolvedValue({ success: true });
    appClientMock.getDiagnosticsReport.mockReset().mockResolvedValue({ success: true, data: { report: 'diagnostics' } });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  const renderError = async () => {
    root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root?.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(FeedbackReportProvider, {
            children: createElement(ActionToastViewport, { toasts: [{ id: 11, msg: 'Repository failed', isError: true }] }),
          }),
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('never submits an error toast automatically and opens the manual report from its button', async () => {
    await renderError();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(appClientMock.submitFeedbackReport).not.toHaveBeenCalled();

    const report = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Quick report');
    await act(async () => report?.click());

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Feedback & issue report');
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('');
    expect(Array.from(document.querySelectorAll('textarea'))[2]?.value).toBe('Repository failed');
    expect(appClientMock.submitFeedbackReport).not.toHaveBeenCalled();
  });
});
