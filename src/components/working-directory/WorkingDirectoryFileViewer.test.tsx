// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { I18nProvider } from '@/i18n';
import {
  requestWorkingDirectoryNavigation,
  resetWorkingDirectoryNavigationGuardForTests,
  setActiveWorkingDirectoryNavigationGuard,
} from './workingDirectoryNavigationGuard';

const setConfirmDialog = vi.fn();
const onToast = vi.fn();
const editorState = vi.hoisted(() => ({ onChange: null as ((value: string) => void) | null, value: '' }));
vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog }),
  useOptionalRepositoryContext: () => ({ onToast }),
}));
vi.mock('./WorkingDirectoryCodeEditor', () => ({
  WorkingDirectoryCodeEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
    editorState.onChange = onChange;
    editorState.value = value;
    return null;
  },
}));

import { WorkingDirectoryFileViewer } from './WorkingDirectoryFileViewer';

const blameLine = (lineNumber: number) =>
  ({
    lineNumber,
    commitHash: `hash-${lineNumber}`,
    abbrevHash: `${lineNumber}`,
    author: 'Author',
    authorTime: '2026-01-01T00:00:00Z',
    summary: 'Change',
    content: `line ${lineNumber}`,
  }) as any;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'getWorkingDirectoryPreview').mockResolvedValue({ success: true, data: { kind: 'text', text: 'hello\n' } } as any);
});

afterEach(() => {
  resetWorkingDirectoryNavigationGuardForTests();
  vi.restoreAllMocks();
  setConfirmDialog.mockReset();
  onToast.mockReset();
  editorState.onChange = null;
  editorState.value = '';
  document.body.innerHTML = '';
});

describe('WorkingDirectoryFileViewer history and blame', () => {
  it('saves an encoding-only conversion through the byte-aware writer', async () => {
    vi.spyOn(gitClient, 'getWorkingDirectoryPreview').mockResolvedValue({
      success: true,
      data: { kind: 'text', text: 'hello\n', bytes: 6, encoding: 'utf8', modifiedAt: '2026-07-27T08:00:00.000Z' },
    } as any);
    const writeRepoFile = vi.spyOn(gitClient, 'writeRepoFile').mockResolvedValue({ success: true });
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(WorkingDirectoryFileViewer, {
            repoPath: 'C:/repo',
            path: 'notes.txt',
            onClose: vi.fn(),
            onRepoChanged: vi.fn(),
            onCloseRequestChange: vi.fn(),
            onNavigationGuardChange: vi.fn(),
          }),
        }),
      );
      await Promise.resolve();
    });
    const clickButton = (label: string) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent?.includes(label));
      if (!button) throw new Error(`Missing "${label}" button.`);
      act(() => button.click());
    };

    clickButton('Tools');
    clickButton('Encoding and line endings');
    clickButton('UTF-8 BOM');
    const saveButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent?.includes('Save'));
    expect(saveButton?.disabled).toBe(false);
    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
    });

    expect(writeRepoFile).toHaveBeenCalledWith('notes.txt', 'hello\n', 'C:/repo', 'utf8-bom');
    act(() => root.unmount());
  });

  it('edits and saves CSV content through the table view', async () => {
    vi.spyOn(gitClient, 'getWorkingDirectoryPreview').mockResolvedValue({
      success: true,
      data: { kind: 'text', text: 'name,age\r\nAda,36\r\n' },
    } as any);
    const writeRepoFile = vi.spyOn(gitClient, 'writeRepoFile').mockResolvedValue({ success: true });
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(WorkingDirectoryFileViewer, {
            repoPath: 'C:/repo',
            path: 'data/people.csv',
            onClose: vi.fn(),
            onRepoChanged: vi.fn(),
            onCloseRequestChange: vi.fn(),
            onNavigationGuardChange: vi.fn(),
          }),
        }),
      );
      await Promise.resolve();
    });
    const tableButton = await vi.waitFor(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === 'Table');
      expect(button).toBeTruthy();
      return button!;
    });
    act(() => tableButton.click());
    const ageCell = document.querySelector<HTMLInputElement>('input[aria-label="Row 2, column B"]');
    if (!ageCell) throw new Error('Missing CSV age cell.');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(ageCell, '37');
      ageCell.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    const saveButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent?.includes('Save'));
    if (!saveButton) throw new Error('Missing save button.');
    await act(async () => {
      saveButton.click();
      await Promise.resolve();
    });

    expect(writeRepoFile).toHaveBeenCalledWith('data/people.csv', 'name,age\r\nAda,37\r\n', 'C:/repo', 'utf8');
    act(() => root.unmount());
  });

  it('loads an oversized image when explicitly requested', async () => {
    const getPreview = vi
      .spyOn(gitClient, 'getWorkingDirectoryPreview')
      .mockResolvedValueOnce({
        success: true,
        data: { kind: 'binary', bytes: 3 * 1024 * 1024, mimeType: 'image/png', reason: 'tooLarge', canLoadImage: true },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        data: { kind: 'image', dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png', bytes: 3 * 1024 * 1024 },
      } as any);
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(WorkingDirectoryFileViewer, {
            repoPath: 'C:/repo',
            path: 'assets/large.png',
            onClose: vi.fn(),
            onRepoChanged: vi.fn(),
            onCloseRequestChange: vi.fn(),
            onNavigationGuardChange: vi.fn(),
          }),
        }),
      );
      await Promise.resolve();
    });
    const loadButton = await vi.waitFor(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === 'Show image anyway');
      expect(button).toBeTruthy();
      return button!;
    });

    await act(async () => {
      loadButton.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(getPreview).toHaveBeenLastCalledWith('assets/large.png', 'C:/repo', true));
    await vi.waitFor(() => expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA=='));
    act(() => root.unmount());
  });

  it('shows history errors and loads blame beyond the first 500 lines', async () => {
    vi.spyOn(gitClient, 'getFileHistory').mockResolvedValue({ success: false, error: 'History failed.' });
    const getBlameRange = vi
      .spyOn(gitClient, 'getFileBlameRange')
      .mockResolvedValueOnce({ success: true, data: Array.from({ length: 501 }, (_, index) => blameLine(index + 1)) })
      .mockResolvedValueOnce({ success: true, data: [blameLine(501), blameLine(502)] });
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(WorkingDirectoryFileViewer, {
            repoPath: 'C:/repo',
            path: 'src/large.ts',
            onClose: vi.fn(),
            onRepoChanged: vi.fn(),
            onCloseRequestChange: vi.fn(),
            onNavigationGuardChange: vi.fn(),
          }),
        }),
      );
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('History'));
    const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')];

    await act(async () => {
      buttons()
        .find((button) => button.textContent === 'History')
        ?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('History failed.'));

    await act(async () => {
      buttons()
        .find((button) => button.textContent === 'Blame')
        ?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(getBlameRange).toHaveBeenCalledWith('src/large.ts', undefined, 1, 501, 'C:/repo', 'unstaged'));
    const loadMore = await vi.waitFor(() => {
      const button = buttons().find((candidate) => candidate.classList.contains('staging-tool-btn') && candidate.textContent?.includes('500'));
      expect(button).toBeTruthy();
      return button!;
    });
    expect(loadMore.disabled).toBe(false);
    expect(getBlameRange).toHaveBeenCalledTimes(1);
    await act(async () => {
      loadMore.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      loadMore.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(getBlameRange).toHaveBeenLastCalledWith('src/large.ts', undefined, 501, 501, 'C:/repo', 'unstaged'));
    expect(getBlameRange).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('line 502');
    act(() => root.unmount());
  });

  it('cancels guarded navigation when save-and-open fails', async () => {
    vi.spyOn(gitClient, 'writeRepoFile').mockRejectedValue(new Error('File is locked.'));
    const onNavigationGuardChange = vi.fn();
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(WorkingDirectoryFileViewer, {
            repoPath: 'C:/repo',
            path: 'src/app.ts',
            onClose: vi.fn(),
            onRepoChanged: vi.fn(),
            onCloseRequestChange: vi.fn(),
            onNavigationGuardChange,
          }),
        }),
      );
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(editorState.onChange).toBeTypeOf('function'));
    act(() => editorState.onChange?.('changed\n'));
    const guard = onNavigationGuardChange.mock.calls.at(-1)?.[0];
    const proceed = vi.fn();
    const cancel = vi.fn();
    act(() => guard({ kind: 'view', label: 'settings' }, proceed, cancel));
    const dialog = setConfirmDialog.mock.calls.at(-1)?.[0];

    await act(async () => dialog.onSecondaryAction());

    expect(proceed).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('File is locked.', true);
    act(() => root.unmount());
  });

  it('keeps the pending guard alive while save-and-open marks the editor clean', async () => {
    vi.spyOn(gitClient, 'writeRepoFile').mockResolvedValue({ success: true });
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(WorkingDirectoryFileViewer, {
            repoPath: 'C:/repo',
            path: 'src/app.ts',
            onClose: vi.fn(),
            onRepoChanged: vi.fn(),
            onCloseRequestChange: vi.fn(),
            onNavigationGuardChange: setActiveWorkingDirectoryNavigationGuard,
          }),
        }),
      );
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(editorState.onChange).toBeTypeOf('function'));
    act(() => editorState.onChange?.('changed\n'));
    const navigate = vi.fn();
    act(() => requestWorkingDirectoryNavigation({ kind: 'view', label: 'settings' }, navigate));
    const dialog = setConfirmDialog.mock.calls.at(-1)?.[0];

    await act(async () => dialog.onSecondaryAction());

    expect(navigate).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
