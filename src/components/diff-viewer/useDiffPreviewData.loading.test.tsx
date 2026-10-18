// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateResources, resourceKey } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';
import type { ElectronAPI, ElectronGitAPI } from '@/shared/ipc/contracts/electronApi';
import type { DiffRequest } from '@/types/diff';
import { useDiffPreviewData } from './useDiffPreviewData';
import { MAX_RENDER_CHARS, MAX_RENDER_LINES } from './diffViewerConstants';

const repoPath = 'C:/diff-preview';
const limits = { maxBytes: MAX_RENDER_CHARS, maxLines: MAX_RENDER_LINES };
const result = (text: string) => ({ success: true as const, data: { text, truncated: false, bytes: text.length, lines: 1 } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

describe('diff preview request lifetime and reuse', () => {
  let host: HTMLDivElement;
  let root: Root;
  const read = vi.fn<ElectronGitAPI['getDiffPreview']>();
  const cancel = vi.fn().mockResolvedValue(undefined);
  const snapshots = new Map<string, ReturnType<typeof useDiffPreviewData>>();
  type Props = { id?: string; request: DiffRequest; refreshTrigger?: number; repo?: string; language?: string };
  function Viewer({ id = 'main', request, refreshTrigger, repo = repoPath, language = 'en' }: Props) {
    snapshots.set(id, useDiffPreviewData({ repoPath: repo, request, refreshTrigger, t: (key) => `${language}:${key}` }));
    return null;
  }
  const render = async (props: Props | Props[]) => {
    const viewers = Array.isArray(props) ? props : [props];
    await act(async () => root.render(viewers.map((item) => createElement(Viewer, { ...item, key: item.id || 'main' }))));
  };
  const current = (id = 'main') => snapshots.get(id)!;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    snapshots.clear();
    read.mockReset().mockImplementation(async (args) => result(args.at(-1)!));
    cancel.mockClear();
    window.electronAPI = { git: { getDiffPreview: read }, app: { cancelReadRequest: cancel } } as unknown as ElectronAPI;
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as { electronAPI?: ElectronAPI }).electronAPI;
    vi.restoreAllMocks();
  });

  it('loads once when filling an empty cache and ignores equivalent requests, titles and translation changes', async () => {
    const request: DiffRequest = { source: 'unstaged', path: 'src/a.ts' };
    await render({ request });
    expect(current().diffText).toBe(request.path);
    expect(current().confirmedPreview?.text).toBe(request.path);
    expect(read).toHaveBeenCalledOnce();
    await render({ request: { ...request, title: 'Another title', commitHash: 'a'.repeat(40) }, language: 'de' });
    expect(read).toHaveBeenCalledOnce();
    expect(current().confirmedPreview?.text).toBe(request.path);
  });

  it.each([40, 64])('reuses a full %i-character commit hash across navigation, age and repository invalidation', async (length) => {
    const request: DiffRequest = { source: 'commit', path: 'src/a.ts', commitHash: 'a'.repeat(length) };
    await render({ request });
    await render({ request: { ...request, path: 'src/b.ts' } });
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 120_000);
    await act(async () => invalidateResources('git', repoPath.toLowerCase()));
    await render({ request, refreshTrigger: 9 });
    expect(current().diffText).toBe(request.path);
    expect(current().confirmedPreview?.text).toBe(request.path);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each(['staged', 'unstaged'] as const)('refreshes %s data without reconfirming an old preview while the new read is pending', async (source) => {
    const request: DiffRequest = { source, path: 'src/a.ts' };
    await render({ request });
    await render({ request: { source, path: 'src/b.ts' } });
    await render({ request });
    expect(read).toHaveBeenCalledTimes(3);
    const pending = deferred<ReturnType<typeof result>>();
    read.mockReturnValueOnce(pending.promise);
    await render({ request, refreshTrigger: 1 });
    expect(read).toHaveBeenCalledTimes(4);
    expect(current().diffText).toBe(request.path);
    expect(current().confirmedPreview).toBeNull();
    await act(async () => pending.resolve(result('fresh changes')));
    expect(current().confirmedPreview?.text).toBe('fresh changes');
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('keeps different commit versions and repositories separate for the same path', async () => {
    read.mockImplementation(async (args, _limits, repo) => result(`${repo}:${args[3]}`));
    const request: DiffRequest = { source: 'commit', path: 'src/a.ts', commitHash: 'a'.repeat(40) };
    await render({ request });
    const first = current().diffText;
    await render({ request: { ...request, commitHash: 'b'.repeat(40) } });
    expect(current().diffText).not.toBe(first);
    await render({ request, repo: 'C:/other' });
    expect(current().diffText).not.toBe(first);
    await render({ request });
    expect(current().diffText).toBe(first);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it.each([7, 41, 63])('does not treat abbreviated %i-character commit hashes as immutable', async (length) => {
    const request: DiffRequest = { source: 'commit', path: 'src/a.ts', commitHash: 'a'.repeat(length) };
    await render({ request });
    await render({ request, refreshTrigger: 1 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('finishes the current read after the Strict Mode subscription replay', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    read.mockReturnValue(pending.promise);
    const request: DiffRequest = { source: 'unstaged', path: 'src/a.ts' };
    await act(async () => root.render(createElement(StrictMode, null, createElement(Viewer, { request }))));
    await act(async () => pending.resolve(result('current changes')));
    expect(current().confirmedPreview?.text).toBe('current changes');
    expect(current().isLoading).toBe(false);
    expect(current().error).toBeNull();
  });

  it('does not re-read an unchanged visible diff when unrelated resources are invalidated', async () => {
    await render({ request: { source: 'unstaged', path: 'src/a.ts' } });
    await act(async () => invalidateResources('git', repoPath.toLowerCase(), ['getStashes']));
    expect(read).toHaveBeenCalledOnce();
    expect(current().confirmedPreview?.text).toBe('src/a.ts');
  });

  it.each(['file', 'repository'] as const)('cancels the old native read on a %s switch and discards a late reply', async (change) => {
    const old = deferred<ReturnType<typeof result>>();
    read.mockReturnValueOnce(old.promise);
    const request: DiffRequest = { source: 'unstaged', path: 'src/a.ts' };
    await render({ request });
    const token = read.mock.calls[0][3]!;
    expect(token).toEqual({ requestId: expect.any(String), priority: 'visible' });
    await render({ request: { ...request, path: change === 'file' ? 'src/b.ts' : request.path }, repo: change === 'repository' ? 'C:/other' : repoPath });
    expect(cancel).toHaveBeenCalledExactlyOnceWith(token.requestId);
    await act(async () => old.resolve(result('obsolete')));
    expect(current().diffText).toBe(change === 'file' ? 'src/b.ts' : request.path);
    expect(current().error).toBeNull();
    const key = resourceKey('git', 'getDiffPreview', [['diff', '--', request.path], limits, repoPath]);
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it('keeps a shared read alive until its last viewer leaves', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    read.mockReturnValueOnce(pending.promise);
    const request: DiffRequest = { source: 'staged', path: 'src/shared.ts' };
    await render([
      { id: 'a', request },
      { id: 'b', request },
    ]);
    expect(read).toHaveBeenCalledOnce();
    await render({ id: 'b', request });
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => pending.resolve(result('shared changes')));
    expect(current('b').confirmedPreview?.text).toBe('shared changes');
    expect(read).toHaveBeenCalledOnce();
    read.mockReturnValueOnce(new Promise(() => {}));
    await render({ id: 'b', request, refreshTrigger: 1 });
    const token = read.mock.calls[1][3]!;
    await render([]);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(token.requestId);
  });

  it('keeps empty successful previews cached and confirmed', async () => {
    read.mockResolvedValue(result(''));
    const request: DiffRequest = { source: 'commit', path: 'empty.ts', commitHash: 'a'.repeat(40) };
    await render({ request });
    expect(current().confirmedPreview?.text).toBe('');
    expect(current().isLoading).toBe(false);
    await render({ request: { ...request, path: 'other.ts' } });
    await render({ request });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('lets cache invalidation replace an in-flight read without an obsolete error or confirmation', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    read.mockReturnValueOnce(pending.promise);
    const request: DiffRequest = { source: 'unstaged', path: 'src/a.ts' };
    await render({ request });
    await act(async () => invalidateResources('git', repoPath.toLowerCase(), ['getDiffPreview']));
    expect(read).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(read.mock.calls[0][3]!.requestId);
    expect(current().confirmedPreview?.text).toBe(request.path);
    await act(async () => pending.resolve(result('obsolete')));
    expect(current().diffText).toBe(request.path);
    expect(current().error).toBeNull();
  });

  it('clears a failed read after a successful background refresh', async () => {
    read.mockResolvedValueOnce({ success: false, error: 'Read failed' });
    const request: DiffRequest = { source: 'staged', path: 'src/a.ts' };
    await render({ request });
    expect(current().error).toBe('Read failed');
    expect(current().confirmedPreview).toBeNull();
    await act(async () => invalidateResources('git', repoPath.toLowerCase(), ['getDiffPreview']));
    expect(read).toHaveBeenCalledTimes(2);
    expect(current().confirmedPreview?.text).toBe(request.path);
    expect(current().error).toBeNull();
  });
});
