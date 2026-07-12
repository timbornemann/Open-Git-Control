// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { ActionToastViewport } from '@/components/ActionToastViewport';
import { FeedbackReportProvider } from './FeedbackReportContext';

const { appClientMock, settingsState, uiState, githubState, onUpdateSettingsMock } = vi.hoisted(() => ({
  appClientMock: {
    isAvailable: vi.fn(() => true),
    getFeedbackReportCapability: vi.fn(),
    submitFeedbackReport: vi.fn(),
    openExternalUrl: vi.fn(),
  },
  settingsState: {
    settings: { errorReportConsentShown: false, automaticErrorReportsEnabled: false, githubHost: 'github.com' },
    onUpdateSettings: vi.fn(),
  },
  uiState: { activeTab: 'repo', confirmDialog: null, inputDialog: null },
  githubState: { isAuthenticated: true },
  onUpdateSettingsMock: vi.fn(),
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
    settingsState.settings.errorReportConsentShown = false;
    settingsState.settings.automaticErrorReportsEnabled = false;
    settingsState.onUpdateSettings = onUpdateSettingsMock;
    onUpdateSettingsMock.mockReset().mockResolvedValue({ success: true, settings: settingsState.settings });
    appClientMock.getFeedbackReportCapability.mockReset().mockResolvedValue({ directSubmissionAvailable: true, reason: null });
    appClientMock.submitFeedbackReport.mockReset().mockResolvedValue({
      success: true,
      data: { issueNumber: 8, htmlUrl: 'https://github.com/timbornemann/Open-Git-Control/issues/8', deduplicated: false },
    });
    appClientMock.openExternalUrl.mockReset().mockResolvedValue({ success: true });
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

  it('shows the one-time public GitHub consent with automatic reporting selected', async () => {
    await renderError();

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('public GitHub issue');
    const checkbox = document.querySelector<HTMLInputElement>('.feedback-report-diagnostics-toggle input');
    expect(checkbox?.checked).toBe(true);
    const confirm = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Report this error');
    await act(async () => confirm?.click());

    expect(onUpdateSettingsMock).toHaveBeenCalledWith({ errorReportConsentShown: true, automaticErrorReportsEnabled: true });
    expect(appClientMock.submitFeedbackReport).toHaveBeenCalledWith(
      expect.objectContaining({ submissionMode: 'automatic', errorMessage: 'Repository failed', area: 'Repository workspace' }),
    );
    expect(document.body.textContent).toContain('Open issue #8');
  });

  it('persists opt-out without submitting when the first consent is declined', async () => {
    await renderError();
    const decline = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Do not report');
    await act(async () => decline?.click());

    expect(onUpdateSettingsMock).toHaveBeenCalledWith({ errorReportConsentShown: true, automaticErrorReportsEnabled: false });
    expect(appClientMock.submitFeedbackReport).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.textContent).toContain('Quick report');
  });
});
