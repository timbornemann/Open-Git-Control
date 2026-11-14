import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { FeedbackReportInputDto, FeedbackReportPreviewDto } from '@/types/feedbackDtos';
import { FeedbackReportDialog, type FeedbackDialogRequest } from './FeedbackReportDialog';

const { client } = vi.hoisted(() => ({
  client: {
    isAvailable: vi.fn(() => true),
    getDiagnosticsReport: vi.fn(),
    previewFeedbackReport: vi.fn(),
    submitFeedbackReport: vi.fn(),
    openExternalUrl: vi.fn(),
  },
}));
export { client };
vi.mock('@/services/appClient', () => ({ appClient: client }));

let root: Root | null = null;
export const reported = vi.fn();
export const closed = vi.fn();
export function messageOf(input: FeedbackReportInputDto) {
  return input.category === 'bug' ? input.actual : input.category === 'feature' ? input.problem : input.question;
}
export function previewOf(input: FeedbackReportInputDto, delivery: 'direct' | 'browser' = 'direct'): FeedbackReportPreviewDto {
  const message = messageOf(input);
  const prefix = input.category === 'bug' ? 'Bug' : input.category === 'feature' ? 'Feature' : 'Question';
  const diagnostics = delivery === 'direct' && input.category === 'bug' ? input.diagnostics : '';
  return {
    title: `[${prefix}]: ${input.title || message.trim().split('\n')[0]}`,
    body: `## Description\n${message}\n\n## Environment\nVersion: 3.2.3${diagnostics ? `\n\n## Diagnostics\n\`\`\`text\n${diagnostics}\n\`\`\`` : ''}`,
    repositoryUrl: 'https://github.com/timbornemann/Open-Git-Control',
    delivery,
    diagnosticsIncluded: Boolean(diagnostics),
    truncated: false,
    ...(delivery === 'browser' ? { fallbackUrl: 'https://github.com/timbornemann/Open-Git-Control/issues/new?template=bug_report.yml&actual=Example' } : {}),
  };
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '<div id="root"></div>';
  reported.mockReset();
  closed.mockReset();
  client.getDiagnosticsReport.mockReset().mockResolvedValue({ success: true, data: { report: 'safe diagnostics\nrepo=C:/private/repo' } });
  client.previewFeedbackReport.mockReset().mockImplementation(async (input, delivery) => ({ success: true, data: previewOf(input, delivery) }));
  client.submitFeedbackReport.mockReset().mockResolvedValue({
    success: true,
    data: { issueNumber: 17, htmlUrl: 'https://github.com/timbornemann/Open-Git-Control/issues/17', deduplicated: false },
  });
  client.openExternalUrl.mockReset().mockResolvedValue({ success: true });
});
export function unmount() {
  act(() => root?.unmount());
  root = null;
}
afterEach(() => {
  unmount();
  document.body.innerHTML = '';
});
export async function renderDialog(
  request: FeedbackDialogRequest = { category: 'bug', source: 'error-toast', area: 'Settings', errorMessage: 'Settings failed badly', toastId: 4 },
  language: 'de' | 'en' = 'en',
) {
  root = createRoot(document.getElementById('root')!);
  await act(async () => {
    root!.render(createElement(I18nProvider, { language, children: createElement(FeedbackReportDialog, { request, onClose: closed, onReported: reported }) }));
  });
}
export function field(label: string) {
  const element = Array.from(document.querySelectorAll('label'))
    .find((candidate) => candidate.querySelector('span')?.textContent === label)
    ?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  expect(element, label).toBeTruthy();
  return element!;
}
export async function fill(label: string, value: string) {
  await act(async () => {
    const input = field(label);
    const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
export function button(text: string) {
  const node = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  expect(node, text).toBeTruthy();
  return node!;
}
export async function click(text: string) {
  await act(async () => button(text).click());
}
export async function expand(text: string) {
  await act(async () => {
    const summary = [...document.querySelectorAll('summary')].find((item) => item.textContent === text);
    expect(summary).toBeTruthy();
    summary!.click();
  });
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve: (value: T) => act(async () => resolve(value)),
  };
}
