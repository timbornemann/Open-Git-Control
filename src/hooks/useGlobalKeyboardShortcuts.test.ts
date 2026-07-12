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
    const Harness = () => {
      useGlobalKeyboardShortcuts({ setActiveTab, onFetch: vi.fn(), onOpenCommandPalette: vi.fn() });
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
});
