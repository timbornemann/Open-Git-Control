// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGlobalKeyboardShortcuts } from './useGlobalKeyboardShortcuts';
import { updateResource } from '@/data/queryClient';
import { resourceKey } from '@/data/clientCache';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { beginShortcutCapture } from './keyboardShortcutRuntime';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useGlobalKeyboardShortcuts editor focus', () => {
  it.each(['input', 'textarea', 'select', 'contenteditable', 'code-editor'])(
    'runs app actions from %s before editor handlers, while protecting view navigation',
    (type) => {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      document.body.innerHTML = '<div id="root"></div>';
      const setActiveTab = vi.fn(),
        onFetch = vi.fn(),
        onOpenCommandPalette = vi.fn(),
        onOpenQuickTodo = vi.fn(),
        onCreateCommit = vi.fn();
      const Harness = () => {
        useGlobalKeyboardShortcuts({ setActiveTab, onFetch, onOpenCommandPalette, onOpenQuickTodo, onCreateCommit });
        return null;
      };
      const root = createRoot(document.getElementById('root')!);
      act(() => root.render(createElement(Harness)));
      const editor = document.createElement(['contenteditable', 'code-editor'].includes(type) ? 'div' : type);
      editor.tabIndex = 0;
      if (type === 'contenteditable') editor.setAttribute('contenteditable', 'true');
      if (type === 'code-editor') editor.className = 'cm-editor';
      document.body.append(editor);
      editor.focus();
      const editCommand = vi.fn((event: Event) => event.preventDefault());
      editor.addEventListener('keydown', editCommand);
      const press = (key: string, shiftKey = true) =>
        act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey, bubbles: true, cancelable: true })));
      press('t');
      press('f');
      press('p');
      press('Enter', false);
      expect(onOpenQuickTodo).toHaveBeenCalledOnce();
      expect(onFetch).toHaveBeenCalledOnce();
      expect(onOpenCommandPalette).toHaveBeenCalledOnce();
      expect(onCreateCommit).toHaveBeenCalledOnce();
      expect(editCommand).not.toHaveBeenCalled();
      press('4', false);
      expect(setActiveTab).not.toHaveBeenCalled();
      expect(editCommand).toHaveBeenCalledOnce();
      act(() => root.unmount());
    },
  );
  it('updates live, disables old keys and ignores repeats, dialogs, IME and recording', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
    const fetch = vi.fn(),
      setActiveTab = vi.fn();
    const Harness = () => {
      useGlobalKeyboardShortcuts({ setActiveTab, onFetch: fetch, onOpenCommandPalette: vi.fn(), onOpenQuickTodo: vi.fn() });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(createElement(Harness)));
    await act(async () =>
      updateResource(resourceKey('app', 'getSettings'), {
        ...DEFAULT_SETTINGS,
        keyboardShortcuts: { fetch: { key: 'F8', primary: false, alt: false, shift: false }, settings: null },
      }),
    );
    const press = (key: string, extras = {}) =>
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extras })));
    press('F', { ctrlKey: true, shiftKey: true });
    press('4', { ctrlKey: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
    press('F8');
    expect(fetch).toHaveBeenCalledOnce();
    fetch.mockClear();
    press('F8', { repeat: true });
    press('F8', { isComposing: true });
    const release = beginShortcutCapture();
    try {
      press('F8');
    } finally {
      release();
    }
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    press('F8');
    dialog.remove();
    expect(fetch).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
  it('does not navigate with Ctrl+1..6 while a text editor is focused and preserves existing tab mappings', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div><textarea id="editor"></textarea>';
    const setActiveTab = vi.fn();
    const onOpenQuickTodo = vi.fn();
    const Harness = () => {
      useGlobalKeyboardShortcuts({ setActiveTab, onFetch: vi.fn(), onOpenCommandPalette: vi.fn(), onOpenQuickTodo });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    act(() => root.render(createElement(Harness)));
    const editor = document.getElementById('editor') as HTMLTextAreaElement;
    editor.focus();

    act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '4', ctrlKey: true, bubbles: true })));
    act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '6', ctrlKey: true, bubbles: true })));
    expect(setActiveTab).not.toHaveBeenCalled();

    editor.blur();
    act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '4', ctrlKey: true, bubbles: true })));
    expect(setActiveTab).toHaveBeenCalledWith('settings');
    act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '6', ctrlKey: true, bubbles: true })));
    expect(setActiveTab).toHaveBeenCalledWith('analytics');
    act(() => root.unmount());
  });

  it('opens the quick todo modal with Ctrl+Shift+T including editable fields', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div><input id="editor" />';
    const onOpenQuickTodo = vi.fn();
    const Harness = () => {
      useGlobalKeyboardShortcuts({ setActiveTab: vi.fn(), onFetch: vi.fn(), onOpenCommandPalette: vi.fn(), onOpenQuickTodo });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    act(() => root.render(createElement(Harness)));

    act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 't', ctrlKey: true, shiftKey: true, bubbles: true })));
    expect(onOpenQuickTodo).toHaveBeenCalledOnce();

    const editor = document.getElementById('editor') as HTMLInputElement;
    editor.focus();
    act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 't', ctrlKey: true, shiftKey: true, bubbles: true })));
    expect(onOpenQuickTodo).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });
});
