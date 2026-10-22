// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingTreeFileDetails } from '@/components/WorkingTreeFileDetails';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import * as clipboard from '@/utils/clipboard';
import type { GitFileBlameLineDto } from '@/types/git';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => toast }));
const repoPath = 'C:/repo';
const path = 'src/ leading name\twith\\slash.ts';
const selected = vi.fn();
let host: HTMLDivElement, root: Root;
const entry = (index: number) => ({
  hash: index.toString(16).padStart(40, '0'),
  abbrevHash: String(index),
  subject: `Change ${index}`,
  path: 'old/file.ts',
  author: 'Author',
  date: '2026-10-21T10:00:00Z',
});
const line = (index: number): GitFileBlameLineDto => ({
  lineNumber: index,
  commitHash: 'b'.repeat(40),
  abbrevHash: 'bbbbbbbb',
  author: 'Author',
  authorTime: '2026-10-21T10:00:00Z',
  summary: 'Change',
  content: 'text',
});
const render = (props: Partial<ComponentProps<typeof WorkingTreeFileDetails>> = {}) =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <WorkingTreeFileDetails repoPath={repoPath} path={path} source="unstaged" onSelectCommit={selected} {...props} />
      </I18nProvider>,
    ),
  );
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === label)!;
const click = (element: HTMLElement) => act(async () => element.click());
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getFileHistory').mockResolvedValue({ success: true, data: [entry(100)] });
  vi.spyOn(gitClient, 'getFileBlameRange').mockResolvedValue({ success: true, data: [line(1)] });
  vi.spyOn(gitClient, 'openRepositoryPath').mockResolvedValue({ success: true });
  vi.spyOn(clipboard, 'copyTextToClipboard').mockResolvedValue(true);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('shared working-file details', () => {
  it('uses the same file actions and detailed blame with original paths and errors', async () => {
    await render({ source: 'staged' });
    await click(host.querySelector<HTMLButtonElement>('[aria-label="Copy file path"]')!);
    expect(clipboard.copyTextToClipboard).toHaveBeenCalledExactlyOnceWith(path);
    expect(toast).toHaveBeenLastCalledWith('File path copied.', false);
    for (const [label, action] of [
      ['Show in folder', 'reveal'],
      ['Open', 'open'],
      ['Open with…', 'openWith'],
    ] as const) {
      await click(button(label));
      expect(gitClient.openRepositoryPath).toHaveBeenLastCalledWith({ path, repoPath, action });
    }
    vi.mocked(gitClient.openRepositoryPath).mockRejectedValueOnce(new Error('File missing'));
    await click(button('Open'));
    expect(toast).toHaveBeenLastCalledWith('File missing', true);
    await click(button('Blame'));
    expect(host.querySelector('.file-blame-panel--detailed')).not.toBeNull();
    expect(host.querySelector('.file-blame-line__author')?.textContent).toBe('Author');
    expect(gitClient.getFileBlameRange).toHaveBeenCalledWith(path, undefined, 1, 501, repoPath, 'staged');
    await click(host.querySelector<HTMLButtonElement>('.file-blame-line__commit')!);
    expect(selected).toHaveBeenLastCalledWith('b'.repeat(40), path);
    expect([...host.querySelectorAll('.commit-file-details__tab')].map((tab) => tab.textContent)).toEqual(['History', 'Blame']);
  });

  it('paginates full working-file history at a captured revision and opens historical renamed paths', async () => {
    vi.mocked(gitClient.getFileHistory).mockResolvedValueOnce({ success: true, data: Array.from({ length: 81 }, (_, index) => entry(1000 - index)) });
    await render({ oldPath: 'old/file.ts', status: 'R' });
    expect(host.querySelectorAll('.file-history-entry')).toHaveLength(80);
    expect(gitClient.getFileHistory).toHaveBeenCalledWith('old/file.ts', undefined, 81, repoPath);
    vi.mocked(gitClient.getFileHistory).mockResolvedValueOnce({ success: true, data: [entry(920)] });
    await click(button('Load more commits'));
    expect(gitClient.getFileHistory).toHaveBeenLastCalledWith('old/file.ts', entry(1000).hash, 81, repoPath, { offset: 80 });
    expect(host.querySelectorAll('.file-history-entry')).toHaveLength(81);
    await click(host.querySelector<HTMLButtonElement>('.file-history-entry')!);
    expect(selected).toHaveBeenLastCalledWith(entry(1000).hash, 'old/file.ts');
  });

  it('loads more blame lines and resets the tab and scroll when changing the working file', async () => {
    vi.mocked(gitClient.getFileBlameRange).mockResolvedValueOnce({ success: true, data: Array.from({ length: 501 }, (_, index) => line(index + 1)) });
    await render();
    await click(button('Blame'));
    expect(host.querySelectorAll('.file-blame-line')).toHaveLength(500);
    await click(host.querySelector<HTMLButtonElement>('.file-blame-panel__more')!);
    expect(gitClient.getFileBlameRange).toHaveBeenLastCalledWith(path, undefined, 501, 501, repoPath, 'unstaged');
    const content = host.querySelector<HTMLElement>('.commit-file-details__content')!;
    content.scrollTop = 200;
    await render({ path: 'other.ts' });
    expect(button('History').getAttribute('aria-pressed')).toBe('true');
    expect(content.scrollTop).toBe(0);
  });

  it('keeps deleted files inspectable and reports unavailable blame without reading missing content', async () => {
    await render({ status: 'D' });
    expect(host.querySelector('.commit-file-details__status')?.textContent).toBe('Deleted');
    expect(host.querySelectorAll('.file-history-entry')).toHaveLength(1);
    await click(button('Blame'));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Blame is not available for deleted files.');
    expect(gitClient.getFileBlameRange).not.toHaveBeenCalled();
  });
});
