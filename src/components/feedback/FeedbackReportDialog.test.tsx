// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { FeedbackReportDialog } from './FeedbackReportDialog';

const { appClientMock } = vi.hoisted(() => ({
  appClientMock: {
    isAvailable: vi.fn(() => true),
    getDiagnosticsReport: vi.fn(),
    submitFeedbackReport: vi.fn(),
    openExternalUrl: vi.fn(),
  },
}));

vi.mock('@/services/appClient', () => ({ appClient: appClientMock }));

describe('FeedbackReportDialog', () => {
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
    appClientMock.getDiagnosticsReport.mockReset().mockResolvedValue({ success: true, data: { report: 'safe diagnostics\nrepo=C:/private/repo' } });
    appClientMock.submitFeedbackReport.mockReset().mockResolvedValue({
      success: true,
      data: { issueNumber: 17, htmlUrl: 'https://github.com/timbornemann/Open-Git-Control/issues/17', deduplicated: false },
    });
    appClientMock.openExternalUrl.mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  const renderDialog = async () => {
    root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root?.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(FeedbackReportDialog, {
            request: { category: 'bug', source: 'error-toast', area: 'Settings', errorMessage: 'Settings failed badly', toastId: 4 },
            onClose: vi.fn(),
            onReported: vi.fn(),
          }),
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const setTextarea = (label: string, value: string) => {
    const field = Array.from(document.querySelectorAll('label')).find((candidate) => candidate.querySelector('span')?.textContent === label);
    const textarea = field?.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error(`Missing textarea: ${label}`);
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, value);
      textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  };

  it('prefills a toast error, attaches editable diagnostics by default, and submits a direct issue', async () => {
    await renderDialog();

    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('textarea[rows="8"]')?.value).toContain('safe diagnostics'));

    const diagnosticsToggle = document.querySelector<HTMLInputElement>('.feedback-report-diagnostics-toggle input');
    expect(diagnosticsToggle?.checked).toBe(true);
    expect(document.body.textContent).toContain('This information will be public');

    setTextarea('Steps to reproduce', '1. Open settings');
    setTextarea('Expected behavior', 'Settings save');
    const submit = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Submit to GitHub');
    if (!submit) throw new Error('Missing submit button.');
    await act(async () => submit.click());

    expect(appClientMock.submitFeedbackReport).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'bug',
        submissionMode: 'manual',
        source: 'error-toast',
        actual: 'Settings failed badly',
        diagnostics: expect.stringContaining('safe diagnostics'),
      }),
    );
    expect(document.body.textContent).toContain('The GitHub issue was created successfully.');
    expect(document.body.textContent).toContain('Open issue #17');
  });

  it('opens the sanitized browser fallback and explains that GitHub still requires submission', async () => {
    appClientMock.submitFeedbackReport.mockResolvedValue({
      success: false,
      code: 'DIRECT_UNAVAILABLE',
      error: 'Not authenticated',
      fallbackUrl: 'https://github.com/timbornemann/Open-Git-Control/issues/new?template=bug_report.yml',
    });
    await renderDialog();
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('textarea[rows="8"]')?.value).toContain('safe diagnostics'));
    setTextarea('Steps to reproduce', '1. Open settings');
    setTextarea('Expected behavior', 'Settings save');
    const submit = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Submit to GitHub');
    await act(async () => submit?.click());

    expect(appClientMock.openExternalUrl).toHaveBeenCalledWith(expect.stringContaining('template=bug_report.yml'));
    expect(document.body.textContent).toContain('The prefilled GitHub issue form was opened');
    expect(document.body.textContent).toContain('Diagnostics were not included in the URL');
  });
});
