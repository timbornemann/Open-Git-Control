// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { IpcResult } from '@/types/ipc';
import type { CommitMessageEditInspection, CommitMessageEditResult } from '@/shared/ipc/commitMessageEdit';
import { CommitMessageEditDialog } from './CommitMessageEditDialog';

const hash = 'a'.repeat(40);
const inspection: CommitMessageEditInspection = {
  commitHash: hash,
  title: 'Original title',
  description: 'Full body\n\n# Heading',
  expectedHead: 'b'.repeat(40),
  expectedBranch: 'refs/heads/main',
  commitCount: 3,
  signedCommitCount: 1,
  blockReason: null,
  blockDetail: '',
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('commit message editing dialog', () => {
  let root: Root;
  let host: HTMLDivElement;
  const saved = vi.fn();
  const close = vi.fn();
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    saved.mockReset();
    close.mockReset();
    vi.spyOn(gitClient, 'inspectCommitMessageEdit').mockResolvedValue({ success: true, data: inspection });
    vi.spyOn(gitClient, 'onCommitMessageEditProgress').mockReturnValue(() => {});
    vi.spyOn(gitClient, 'cancelCommitMessageEdit').mockResolvedValue(true);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  const render = async () => {
    await act(async () => {
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(CommitMessageEditDialog, { repoPath: 'C:/repo', commitHash: hash, onClose: close, onSaved: saved }),
        }),
      );
    });
  };
  const enter = (field: 'input' | 'textarea', value: string) =>
    act(() => {
      const input = host.querySelector(field)!;
      Object.getOwnPropertyDescriptor(field === 'input' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        value,
      );
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  const confirm = () => host.querySelector<HTMLButtonElement>('.dialog-btn-primary')!;

  it('loads full message, branch, descendant count and signature warning; unchanged/empty titles cannot submit', async () => {
    const reword = vi.spyOn(gitClient, 'rewordCommitMessage');
    await render();
    expect(host.querySelector('input')?.value).toBe(inspection.title);
    expect(host.querySelector('textarea')?.value).toBe(inspection.description);
    expect(host.textContent).toContain('Following commits2');
    expect(host.textContent).toContain('main');
    expect(host.textContent).toContain('1 signature cannot be preserved');
    expect(confirm().disabled).toBe(true);
    enter('input', '   ');
    expect(confirm().disabled).toBe(true);
    act(() => confirm().click());
    expect(reword).not.toHaveBeenCalled();
  });

  it('allows clearing the body, blocks duplicate submits, preserves input after failure and closes only on success', async () => {
    const first = deferred<IpcResult<CommitMessageEditResult>>();
    const reword = vi
      .spyOn(gitClient, 'rewordCommitMessage')
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({
        success: true,
        data: { changed: true, oldHead: inspection.expectedHead, newHead: 'c'.repeat(40), hashMapping: {}, backupRef: 'refs/ogc/commit-reword/backup' },
      });
    await render();
    enter('textarea', '');
    act(() => {
      confirm().click();
      confirm().click();
    });
    expect(reword).toHaveBeenCalledTimes(1);
    expect(reword.mock.calls[0][0]).toMatchObject({
      title: inspection.title,
      description: '',
      expectedHead: inspection.expectedHead,
      expectedBranch: inspection.expectedBranch,
    });
    expect(host.querySelector('input')?.disabled).toBe(true);
    await act(async () => {
      first.resolve({ success: false, error: 'Remote verification timed out.' });
    });
    expect(host.querySelector('textarea')?.value).toBe('');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('timed out');
    expect(saved).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    await act(async () => confirm().click());
    expect(saved).toHaveBeenCalledOnce();
  });

  it('cancels an in-flight operation and keeps its draft available', async () => {
    const pending = deferred<IpcResult<CommitMessageEditResult>>();
    const reword = vi.spyOn(gitClient, 'rewordCommitMessage').mockReturnValue(pending.promise);
    await render();
    enter('input', 'Draft');
    act(() => confirm().click());
    act(() => host.querySelector<HTMLButtonElement>('.dialog-btn-secondary')!.click());
    expect(gitClient.cancelCommitMessageEdit).toHaveBeenCalledWith(reword.mock.calls[0][0].operationId);
    expect(close).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ success: false, error: 'Git operation was aborted.' });
    });
    expect(host.querySelector('input')?.value).toBe('Draft');
    expect(confirm().disabled).toBe(false);
  });

  it('explains a safety block and ignores a late inspection after leaving the view', async () => {
    vi.mocked(gitClient.inspectCommitMessageEdit).mockResolvedValueOnce({
      success: true,
      data: { ...inspection, blockReason: 'published', blockDetail: 'refs/remotes/origin/main' },
    });
    await render();
    expect(confirm().disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/published|remote/i);
    const late = deferred<IpcResult<CommitMessageEditInspection>>();
    vi.mocked(gitClient.inspectCommitMessageEdit).mockReturnValueOnce(late.promise);
    act(() => root.render(null));
    await render();
    act(() => root.render(null));
    await act(async () => {
      late.resolve({ success: true, data: inspection });
    });
    expect(host.textContent).toBe('');
  });
});
