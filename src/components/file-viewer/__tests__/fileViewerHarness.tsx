import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { I18nProvider } from '@/i18n';
import { FileViewer, type FileViewerProps } from '../FileViewer';
import type { FileViewerRequest } from '../fileViewerRequest';
import { resetWorkingDirectoryNavigationGuardForTests } from '@/components/working-directory/workingDirectoryNavigationGuard';

const dialogs = vi.hoisted(() => ({ confirm: vi.fn(), input: vi.fn(), toast: vi.fn() }));
const editor = vi.hoisted(() => ({ value: '', readOnly: false, change: null as ((value: string) => void) | null }));
export { dialogs, editor };
vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: dialogs.confirm, setInputDialog: dialogs.input }),
  useOptionalRepositoryContext: () => ({ onToast: dialogs.toast }),
}));
vi.mock('@/components/working-directory/WorkingDirectoryCodeEditor', () => ({
  WorkingDirectoryCodeEditor: (props: { value: string; readOnly: boolean; onChange: (value: string) => void }) => {
    editor.value = props.value;
    editor.readOnly = props.readOnly;
    editor.change = props.onChange;
    return createElement('pre', { 'data-testid': 'editor' }, props.value);
  },
}));

const diff = ['diff --git a/file.txt b/file.txt', '--- a/file.txt', '+++ b/file.txt', '@@ -1 +1 @@', '-before', '+after'].join('\n');
export function initializeViewerMocks() {
  document.body.innerHTML = '<div id="viewer-test"></div>';
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getRepositoryFilePreview').mockImplementation(async (request) => ({
    success: true,
    data: {
      kind: 'text',
      text: `${request.source} contents\n`,
      encoding: 'utf8',
      bytes: 10,
      isMarkdown: false,
      version: `${request.source}-version`,
      editable: request.source !== 'commit',
    },
  }));
  vi.spyOn(gitClient, 'saveRepositoryFile').mockResolvedValue({ success: true, data: { version: 'saved-version', bytes: 10 } });
  vi.spyOn(gitClient, 'getDiffPreview').mockResolvedValue({ success: true, data: { text: diff, bytes: diff.length, lines: 6, truncated: false } });
  vi.spyOn(gitClient, 'getFileHistory').mockResolvedValue({ success: true, data: [] });
  vi.spyOn(gitClient, 'getFileBlameRange').mockResolvedValue({ success: true, data: [] });
  vi.spyOn(gitClient, 'getFileBlame').mockResolvedValue({ success: true, data: [] });
  vi.spyOn(gitClient, 'applyPatch').mockResolvedValue({ success: true });
  vi.spyOn(gitClient, 'getRepoFileDataUrl').mockResolvedValue({ success: false, error: 'Missing in selected version' });
  vi.spyOn(gitClient, 'getMarkdownPreviewFile').mockResolvedValue({ success: false, error: 'Missing in selected version' });
}
export function resetViewerMocks() {
  resetWorkingDirectoryNavigationGuardForTests();
  vi.restoreAllMocks();
  dialogs.confirm.mockReset();
  dialogs.input.mockReset();
  dialogs.toast.mockReset();
  editor.value = '';
  editor.change = null;
}
export function viewerRequest(source: FileViewerRequest['source'] = 'unstaged', path = 'file.txt'): FileViewerRequest {
  return {
    repoPath: 'C:/viewer-repo',
    path,
    source,
    startView: source === 'unstaged' ? 'text' : 'diff',
    ...(source === 'commit' ? { commitHash: 'a'.repeat(40) } : {}),
  };
}
export function button(label: string) {
  const match = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) =>
      element.textContent === label ||
      element.getAttribute('aria-label') === label ||
      element.querySelector('strong')?.textContent === label ||
      element.querySelector('small')?.textContent === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}
export async function click(label: string) {
  await act(async () => {
    button(label).click();
    await Promise.resolve();
  });
}
export async function edit(value: string) {
  await vi.waitFor(() => {
    if (!editor.change) throw new Error('Editor not ready');
  });
  act(() => editor.change?.(value));
}
export async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function renderViewer(request = viewerRequest(), props: Partial<FileViewerProps> = {}) {
  const root: Root = createRoot(document.getElementById('viewer-test')!);
  const allProps = { onClose: vi.fn(), onRepoChanged: vi.fn(), onNavigationGuardChange: vi.fn(), onCloseRequestChange: vi.fn(), ...props };
  let current = request;
  let refreshTrigger = 0;
  const render = () =>
    root.render(createElement(I18nProvider, { language: 'en', children: createElement(FileViewer, { ...allProps, request: current, refreshTrigger }) }));
  await act(async () => {
    render();
    await Promise.resolve();
  });
  return {
    root,
    props: allProps,
    rerender: async (request: FileViewerRequest) => {
      current = request;
      await act(async () => {
        render();
        await Promise.resolve();
      });
    },
    refresh: async () => {
      refreshTrigger++;
      await act(async () => {
        render();
        await Promise.resolve();
      });
    },
    unmount: () => act(() => root.unmount()),
  };
}
