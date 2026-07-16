// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGlobalKeyboardShortcuts } from './useGlobalKeyboardShortcuts';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useGlobalKeyboardShortcuts editor focus', () => {
  it('does not navigate with Ctrl+1..5 while a text editor is focused', () => {
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
    expect(setActiveTab).not.toHaveBeenCalled();

    editor.blur();
    act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '4', ctrlKey: true, bubbles: true })));
    expect(setActiveTab).toHaveBeenCalledWith('settings');
    act(() => root.unmount());
  });

  it('opens the quick todo modal with Ctrl+Shift+T outside editable fields', () => {
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
    expect(onOpenQuickTodo).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
