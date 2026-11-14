// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { button, click, client, deferred, expand, fill, renderDialog } from './feedbackDialogFixture';

describe('optional feedback diagnostics', () => {
  it('automatically loads diagnostics, allows editing, and shows the full attachment before sending', async () => {
    await renderDialog();
    expect(document.querySelector<HTMLInputElement>('.feedback-report-diagnostics-toggle input')?.checked).toBe(true);
    await expand('View and edit diagnostics');
    await fill('Diagnostics report', 'My edited diagnostic\nrepo=C:/private/repo');
    await click('Review report');
    expect(document.querySelector('.feedback-report-preview pre')?.textContent).toContain('My edited diagnostic\nrepo=C:/private/repo');
    expect(client.submitFeedbackReport).not.toHaveBeenCalled();
    await click('Submit to GitHub');
    expect(client.submitFeedbackReport).toHaveBeenCalledWith(
      expect.objectContaining({ actual: 'Settings failed badly', diagnostics: 'My edited diagnostic\nrepo=C:/private/repo' }),
    );
  });

  it('allows opting out while diagnostics load and ignores a late result after the overview is prepared', async () => {
    const pending = deferred<unknown>();
    client.getDiagnosticsReport.mockReturnValueOnce(pending.promise);
    await renderDialog();
    expect(button('Review report').disabled).toBe(true);
    await act(async () => document.querySelector<HTMLInputElement>('.feedback-report-diagnostics-toggle input')!.click());
    expect(button('Review report').disabled).toBe(false);
    await click('Review report');
    const input = client.previewFeedbackReport.mock.calls[0][0];
    expect(input).not.toHaveProperty('diagnostics');
    await pending.resolve({ success: true, data: { report: 'Late private information' } });
    expect(document.querySelector('.feedback-report-preview')?.textContent).not.toContain('Late private information');
    await click('Submit to GitHub');
    expect(client.submitFeedbackReport).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('offers retry and explicit continuation without diagnostics after a load failure', async () => {
    client.getDiagnosticsReport.mockRejectedValueOnce(new Error('Diagnostics failed'));
    await renderDialog();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Diagnostics failed');
    expect(button('Review report').disabled).toBe(true);
    await click('Retry');
    expect(client.getDiagnosticsReport).toHaveBeenCalledTimes(2);
    expect(button('Review report').disabled).toBe(false);
  });

  it('can proceed without a failed diagnostic and retry collection when it is enabled again', async () => {
    client.getDiagnosticsReport.mockResolvedValueOnce({ success: false, error: 'Not available' });
    await renderDialog();
    await click('Continue without diagnostics');
    await click('Review report');
    expect(client.previewFeedbackReport.mock.calls[0][0]).not.toHaveProperty('diagnostics');
    await click('Back to editing');
    await act(async () => document.querySelector<HTMLInputElement>('.feedback-report-diagnostics-toggle input')!.click());
    expect(client.getDiagnosticsReport).toHaveBeenCalledTimes(2);
    expect(button('Review report').disabled).toBe(false);
  });

  it('does not attach stale diagnostics when the report type changes during collection', async () => {
    const pending = deferred<unknown>();
    client.getDiagnosticsReport.mockReturnValueOnce(pending.promise);
    await renderDialog();
    await click('Idea');
    await pending.resolve({ success: true, data: { report: 'Old bug diagnostic' } });
    await click('Review report');
    expect(client.previewFeedbackReport.mock.calls[0][0]).not.toHaveProperty('diagnostics');
    await click('Back to editing');
    await click('Bug');
    expect(client.getDiagnosticsReport).toHaveBeenCalledTimes(2);
    expect(button('Review report').disabled).toBe(false);
  });
});
