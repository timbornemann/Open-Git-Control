// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { button, click, client, deferred, field, previewOf, renderDialog, reported, unmount } from './feedbackDialogFixture';

describe('reviewed feedback delivery', () => {
  it('shows the browser payload before opening it, including exclusions and shortened content', async () => {
    client.previewFeedbackReport.mockImplementation(async (input) => ({ success: true, data: { ...previewOf(input, 'browser'), truncated: true } }));
    await renderDialog();
    await click('Review report');
    expect(document.body.textContent).toContain('Some details were shortened');
    expect(document.body.textContent).toContain('Diagnostics are not included in the browser URL');
    expect(document.querySelector('.feedback-report-preview')?.textContent).not.toContain('safe diagnostics');
    expect(client.openExternalUrl).not.toHaveBeenCalled();
    await click('Continue in browser');
    expect(client.openExternalUrl).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('template=bug_report.yml'));
    expect(client.submitFeedbackReport).not.toHaveBeenCalled();
    expect(reported).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Review and submit the report there');
  });

  it('requires a new browser review after direct submission fails instead of opening a different payload automatically', async () => {
    client.submitFeedbackReport.mockResolvedValueOnce({
      success: false,
      code: 'GITHUB_FAILED',
      error: 'GitHub unavailable',
      fallbackUrl: 'https://github.com/example',
    });
    await renderDialog();
    await click('Review report');
    await click('Submit to GitHub');
    expect(client.previewFeedbackReport).toHaveBeenLastCalledWith(expect.objectContaining({ actual: 'Settings failed badly' }), 'browser');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('GitHub unavailable');
    expect(client.openExternalUrl).not.toHaveBeenCalled();
    await click('Continue in browser');
    expect(client.openExternalUrl).toHaveBeenCalledOnce();
    expect(client.submitFeedbackReport).toHaveBeenCalledOnce();
  });

  it('prevents duplicate previews and sends while a request is pending', async () => {
    const pendingPreview = deferred<unknown>();
    const pendingSubmission = deferred<unknown>();
    client.previewFeedbackReport.mockReturnValueOnce(pendingPreview.promise);
    client.submitFeedbackReport.mockReturnValueOnce(pendingSubmission.promise);
    await renderDialog();
    const review = button('Review report');
    await act(async () => {
      review.click();
      review.click();
    });
    expect(client.previewFeedbackReport).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLTextAreaElement>('.feedback-report-message textarea')?.disabled).toBe(true);
    await pendingPreview.resolve({ success: true, data: previewOf(client.previewFeedbackReport.mock.calls[0][0]) });
    const send = button('Submit to GitHub');
    await act(async () => {
      send.click();
      send.click();
    });
    expect(client.submitFeedbackReport).toHaveBeenCalledOnce();
    await pendingSubmission.resolve({ success: true, data: { issueNumber: 17, htmlUrl: 'https://github.com/example/17' } });
    expect(reported).toHaveBeenCalledOnce();
  });

  it('keeps the reviewed draft on network errors and allows editing again', async () => {
    client.submitFeedbackReport.mockRejectedValueOnce(new Error('Connection lost'));
    await renderDialog();
    await click('Review report');
    await click('Submit to GitHub');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Connection lost');
    await click('Back to editing');
    expect(field('What happened?').value).toBe('Settings failed badly');
  });

  it('does not report or open a browser from late submission results after the dialog has unmounted', async () => {
    const pending = deferred<unknown>();
    client.submitFeedbackReport.mockReturnValueOnce(pending.promise);
    await renderDialog();
    await click('Review report');
    await click('Submit to GitHub');
    unmount();
    await pending.resolve({ success: true, data: { issueNumber: 17, htmlUrl: 'https://github.com/example/17' } });
    expect(reported).not.toHaveBeenCalled();
    expect(client.openExternalUrl).not.toHaveBeenCalled();
  });

  it('renders sanitized review content without fetching remote images', async () => {
    client.previewFeedbackReport.mockImplementation(async (input) => ({
      success: true,
      data: {
        ...previewOf(input),
        body: '## Report\n\n<script>evil()</script>\n![tracker](https://example.test/pixel.png)\n\n[Details](https://github.com/example/1)',
      },
    }));
    await renderDialog();
    await click('Review report');
    expect(document.querySelector('.feedback-report-preview script')).toBeNull();
    expect(document.querySelector('.feedback-report-preview img[src]')).toBeNull();
    await act(async () => document.querySelector<HTMLAnchorElement>('.feedback-report-preview a')!.click());
    expect(client.openExternalUrl).toHaveBeenCalledExactlyOnceWith('https://github.com/example/1');
  });
});
