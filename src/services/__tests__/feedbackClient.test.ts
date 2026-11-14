import { afterEach, expect, it, vi } from 'vitest';
import { appClient } from '../appClient';
afterEach(() => vi.unstubAllGlobals());
it('passes feedback preview inputs and the optional browser route to the native app API', async () => {
  const previewFeedbackReport = vi.fn().mockResolvedValue({ success: true, data: { title: '[Question]: How do I stage?' } });
  const input = { category: 'question' as const, submissionMode: 'manual' as const, source: 'settings' as const, question: 'How do I stage?' };
  vi.stubGlobal('window', { electronAPI: { app: { previewFeedbackReport } } });
  expect(await appClient.previewFeedbackReport(input)).toMatchObject({ success: true, data: { title: '[Question]: How do I stage?' } });
  await appClient.previewFeedbackReport(input, 'browser');
  expect(previewFeedbackReport.mock.calls).toEqual([[input], [input, 'browser']]);
});
