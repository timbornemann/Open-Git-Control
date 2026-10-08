// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositorySecretScanAllowlistView } from './RepositorySecretScanAllowlistView';
import type { RepositorySecretScanAllowlistDto } from '@/types/repositorySecretScanAllowlist';

const mock = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), onChanged: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));
let activeRepo: string | null;
vi.mock('@/contexts/AppStateContext', () => ({ useRepositoryContext: () => ({ activeRepo, onToast: mock.toast, triggerRefresh: mock.refresh }) }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));
vi.mock('@/services/repositorySecretScanAllowlistClient', () => ({ repositorySecretScanAllowlistClient: { ...mock, isAvailable: () => true } }));
let root: Root;
let container: HTMLDivElement;
let sequence = 0;
const value = (repoPath = activeRepo!, text = '# Saved', version = 'initial'): RepositorySecretScanAllowlistDto => ({
  repoPath,
  text,
  version,
  exists: true,
  relativePath: '.Open-Git-Control/secret-scan-allowlist.txt',
});
const render = async () => {
  await act(async () => root.render(createElement(RepositorySecretScanAllowlistView)));
};
const editor = () => container.querySelector('textarea')!;
const type = (text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor(), text);
    editor().dispatchEvent(new Event('input', { bubbles: true }));
  });
const button = (label: string) => [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(label))!;
beforeEach(() => {
  vi.clearAllMocks();
  activeRepo = `/repo-${++sequence}`;
  mock.get.mockImplementation(async (repoPath: string) => ({ success: true, data: value(repoPath) }));
  mock.save.mockImplementation(async (request) => ({ success: true, data: value(request.repoPath, request.text, 'saved') }));
  mock.onChanged.mockReturnValue(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('repository allowlist subpage', () => {
  it('loads without saving, validates and explicitly saves through central notifications', async () => {
    await render();
    expect(editor().value).toBe('# Saved');
    expect(mock.save).not.toHaveBeenCalled();
    type('path:docs/example.env');
    await act(async () => button('Save').click());
    expect(mock.save).toHaveBeenCalledWith({ repoPath: activeRepo, text: 'path:docs/example.env', expectedVersion: 'initial' });
    expect(mock.toast).toHaveBeenCalledWith('Repository allowlist saved.', false);
    expect(mock.refresh).toHaveBeenCalled();
    expect(container.textContent).not.toContain('Repository allowlist saved.');
    type('regex:[');
    await act(async () => button('Save').click());
    expect(mock.save).toHaveBeenCalledTimes(1);
    expect(mock.toast).toHaveBeenLastCalledWith(expect.stringContaining('Invalid regex'), true);
  });
  it('preserves drafts across navigation and keeps repositories separate', async () => {
    const firstRepo = activeRepo;
    await render();
    type('path:mine.env');
    activeRepo = '/another-repo';
    await render();
    expect(editor().value).toBe('# Saved');
    type('path:other.env');
    activeRepo = firstRepo;
    await render();
    expect(editor().value).toBe('path:mine.env');
    act(() => root.unmount());
    root = createRoot(container);
    await render();
    expect(editor().value).toBe('path:mine.env');
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('retains the draft on a conflict and adopts a reloaded version only on explicit reload', async () => {
    await render();
    type('path:mine.env');
    mock.save.mockResolvedValueOnce({ success: false, error: 'Allowlist changed.' });
    await act(async () => button('Save').click());
    expect(editor().value).toBe('path:mine.env');
    mock.get.mockResolvedValue({ success: true, data: value(activeRepo!, 'path:external.env', 'external') });
    await act(async () => button('Reload').click());
    expect(editor().value).toBe('path:mine.env');
    await act(async () => button('Save').click());
    expect(mock.save).toHaveBeenLastCalledWith({ repoPath: activeRepo, text: 'path:mine.env', expectedVersion: 'external' });
  });
  it('ignores late reads from the previous repository', async () => {
    const previous = activeRepo!;
    let finish!: (result: unknown) => void;
    mock.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    activeRepo = '/new-repo';
    await render();
    expect(editor().value).toBe('# Saved');
    await act(async () => finish({ success: true, data: value(previous, 'path:old.env', 'old') }));
    expect(editor().value).toBe('# Saved');
  });
  it('keeps edits made while saving and allows an invalid external rule to be repaired', async () => {
    mock.get.mockResolvedValue({ success: true, data: { ...value(activeRepo!, 'regex:['), validationError: 'Invalid regex rule on allowlist line 1.' } });
    await render();
    expect(editor().value).toBe('regex:[');
    expect(mock.toast).toHaveBeenCalledWith(expect.stringContaining('Invalid regex'), true);
    type('path:fixed.env');
    let finish!: (result: unknown) => void;
    mock.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => button('Save').click());
    type('path:new-draft.env');
    await act(async () => finish({ success: true, data: value(activeRepo!, 'path:fixed.env', 'saved') }));
    expect(editor().value).toBe('path:new-draft.env');
    expect(container.textContent).toContain('Unsaved draft');
  });
  it('explains a missing repository without creating a policy', async () => {
    activeRepo = null;
    await render();
    expect(container.textContent).toContain('Open a local repository first.');
    expect(mock.get).not.toHaveBeenCalled();
  });
});
