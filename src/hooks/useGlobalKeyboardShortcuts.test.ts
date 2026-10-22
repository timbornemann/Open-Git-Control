// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlobalKeyboardShortcuts } from './useGlobalKeyboardShortcuts';
import { queryClient, updateResource } from '@/data/queryClient';
import { resourceKey } from '@/data/clientCache';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { beginShortcutCapture } from './keyboardShortcutRuntime';
import { getShortcutBinding } from '@/shared/keyboardShortcuts';

beforeEach(() => queryClient.clear());

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useGlobalKeyboardShortcuts editor focus', () => {
  it.each([
    ['refresh', 'onRefresh'],
    ['openRepository', 'onOpenRepository'],
    ['cloneRepository', 'onCloneRepository'],
    ['createBranch', 'onCreateBranch'],
    ['pull', 'onPull'],
    ['push', 'onPush'],
  ] as const)('runs %s once in editors with Ctrl/Cmd, respects dialogs and updates live', async (id, handlerName) => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div><textarea id="editor"></textarea>';
    const handler = vi.fn();
    const Harness = () => {
      useGlobalKeyboardShortcuts({ setActiveTab: vi.fn(), onFetch: vi.fn(), onOpenCommandPalette: vi.fn(), onOpenQuickTodo: vi.fn(), [handlerName]: handler });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(createElement(Harness)));
    const editor = document.getElementById('editor')!;
    editor.focus();
    const editorCommand = vi.fn();
    editor.addEventListener('keydown', editorCommand);
    const press = (key: string, modifiers: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
      act(() => editor.dispatchEvent(event));
      return event;
    };
    const standard = getShortcutBinding(id)!;
    const defaultModifiers = { ctrlKey: standard.primary, shiftKey: standard.shift, altKey: standard.alt };
    expect(press(standard.key, defaultModifiers).defaultPrevented).toBe(true);
    press(standard.key, { ...defaultModifiers, ctrlKey: false, metaKey: standard.primary });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(editorCommand).not.toHaveBeenCalled();
    press(standard.key, { ...defaultModifiers, repeat: true });
    expect(handler).toHaveBeenCalledTimes(2);
    const release = beginShortcutCapture();
    try {
      press(standard.key, defaultModifiers);
    } finally {
      release();
    }
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    press(standard.key, defaultModifiers);
    dialog.remove();
    expect(handler).toHaveBeenCalledTimes(2);
    await act(async () =>
      updateResource(resourceKey('app', 'getSettings'), {
        ...DEFAULT_SETTINGS,
        keyboardShortcuts: { [id]: { key: 'F9', primary: false, alt: false, shift: false } },
      }),
    );
    expect(press(standard.key, defaultModifiers).defaultPrevented).toBe(false);
    press('F9');
    expect(handler).toHaveBeenCalledTimes(3);
    await act(async () => updateResource(resourceKey('app', 'getSettings'), { ...DEFAULT_SETTINGS, keyboardShortcuts: { [id]: null } }));
    press('F9');
    press(standard.key, defaultModifiers);
    expect(handler).toHaveBeenCalledTimes(3);
    act(() => root.unmount());
  });
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
    press('6', { ctrlKey: true });
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
  it('does not navigate while editing and otherwise follows sidebar order with Ctrl+1..6', () => {
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

    for (const key of ['1', '2', '3', '4', '5', '6']) {
      act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true })));
    }
    expect(setActiveTab).not.toHaveBeenCalled();

    editor.blur();
    for (const key of ['1', '2', '3', '4', '5', '6']) {
      act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true })));
    }
    expect(setActiveTab.mock.calls.map(([tab]) => tab)).toEqual(['repo', 'analytics', 'planner', 'localRepos', 'hosting', 'settings']);
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
