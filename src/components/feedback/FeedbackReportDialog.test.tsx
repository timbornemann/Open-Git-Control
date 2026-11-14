// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import type { FeedbackReportCategoryDto } from '@/types/feedbackDtos';
import { button, click, client, expand, field, fill, renderDialog, reported } from './feedbackDialogFixture';

describe('simple feedback forms', () => {
  it.each<[FeedbackReportCategoryDto, string, string]>([
    ['bug', 'What happened?', 'actual'],
    ['feature', 'Your idea', 'problem'],
    ['question', 'Your question', 'question'],
  ])('reviews and submits a %s report with just one text, without publishing from the first step', async (category, label, inputKey) => {
    await renderDialog({ category, source: 'settings' });
    expect(button('Review report').disabled).toBe(true);
    expect(document.querySelectorAll('[required]')).toHaveLength(1);
    expect(document.querySelector('details')?.open).toBe(false);
    await fill(label, 'One clear description.\nMore information.');
    await click('Review report');
    const input = client.previewFeedbackReport.mock.calls[0][0];
    expect(input).toMatchObject({ category, submissionMode: 'manual', [inputKey]: 'One clear description.\nMore information.' });
    expect(client.submitFeedbackReport).not.toHaveBeenCalled();
    expect(client.openExternalUrl).not.toHaveBeenCalled();
    expect(document.querySelector('.feedback-report-review-title')?.textContent).toContain('One clear description.');
    expect(document.querySelector('.feedback-report-preview')?.textContent).toContain('More information.');
    await click('Submit to GitHub');
    expect(client.submitFeedbackReport).toHaveBeenCalledExactlyOnceWith(input);
    expect(reported).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('The GitHub issue was created successfully.');
  });

  it('keeps the message and category-specific extra details when changing the report type', async () => {
    await renderDialog();
    await expand('More details (optional)');
    await fill('Steps to reproduce', 'Open settings');
    await click('Idea');
    expect(field('Your idea').value).toBe('Settings failed badly');
    await fill('Your idea', 'Make settings easier');
    await fill('User value', 'Saves time');
    await click('Question');
    expect(field('Your question').value).toBe('Make settings easier');
    await click('Bug');
    expect(field('What happened?').value).toBe('Make settings easier');
    expect(field('Steps to reproduce').value).toBe('Open settings');
    await click('Idea');
    expect(field('User value').value).toBe('Saves time');
  });

  it('preserves all edits when returning from the overview and rebuilds the reviewed snapshot after editing', async () => {
    await renderDialog();
    await expand('More details (optional)');
    await fill('Custom title', 'Settings dialog is broken');
    await fill('Expected behavior', 'Settings are saved');
    await expand('View and edit diagnostics');
    await fill('Diagnostics report', 'Only the reviewed diagnostic');
    await click('Review report');
    expect(document.querySelector('.feedback-report-preview')?.textContent).toContain('Only the reviewed diagnostic');
    await click('Back to editing');
    expect(field('Custom title').value).toBe('Settings dialog is broken');
    expect(field('Expected behavior').value).toBe('Settings are saved');
    expect(field('Diagnostics report').value).toBe('Only the reviewed diagnostic');
    await fill('What happened?', 'Updated description');
    await click('Review report');
    await click('Submit to GitHub');
    expect(client.submitFeedbackReport).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Settings dialog is broken',
        actual: 'Updated description',
        expected: 'Settings are saved',
        diagnostics: 'Only the reviewed diagnostic',
      }),
    );
  });

  it('rejects whitespace even if optional fields are populated, and keeps inputs after a preview failure', async () => {
    await renderDialog({ category: 'feature', source: 'settings' });
    await fill('Your idea', ' \n ');
    await expand('More details (optional)');
    await fill('Custom title', 'An idea');
    expect(button('Review report').disabled).toBe(true);
    await fill('Your idea', 'One idea');
    client.previewFeedbackReport.mockResolvedValueOnce({ success: false, error: 'Preview unavailable' });
    await click('Review report');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Preview unavailable');
    expect(field('Your idea').value).toBe('One idea');
    await click('Review report');
    expect(document.querySelector('.feedback-report-review')).toBeTruthy();
  });

  it('uses German labels and treats Enter in the message as a line break instead of submission', async () => {
    await renderDialog({ category: 'question', source: 'settings' }, 'de');
    await fill('Deine Frage', 'Wie funktioniert Staging?');
    await act(async () => {
      field('Deine Frage').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(client.previewFeedbackReport).not.toHaveBeenCalled();
    await click('Meldung überprüfen');
    expect(button('An GitHub senden')).toBeTruthy();
    await click('Zurück bearbeiten');
    expect(field('Deine Frage').value).toBe('Wie funktioniert Staging?');
  });
});
