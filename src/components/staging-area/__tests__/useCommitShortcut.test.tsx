// @vitest-environment jsdom
import { act, StrictMode, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommitShortcut } from '../useCommitShortcut';
import { clearCommitShortcutRequest, requestCommitShortcut, useCommitShortcutRequest } from '../commitShortcutState';
import { useGlobalKeyboardShortcuts } from '@/hooks/useGlobalKeyboardShortcuts';
import { beginShortcutCapture } from '@/hooks/keyboardShortcutRuntime';
import { resourceKey } from '@/data/clientCache';
import { updateResource } from '@/data/queryClient';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';

let host: HTMLDivElement, root: Root, disabled: boolean, hasMessage: boolean, global: boolean;
const repoPath = 'C:/repo';
const commit = vi.fn<() => Promise<void>>();
function Harness() {
  const panelRef = useRef<HTMLDivElement>(null);
  useCommitShortcut({ panelRef, repoPath, disabled, hasMessage, commit });
  useGlobalKeyboardShortcuts({
    setActiveTab: vi.fn(),
    onFetch: vi.fn(),
    onOpenCommandPalette: vi.fn(),
    onOpenQuickTodo: vi.fn(),
    onCreateCommit: global ? () => requestCommitShortcut(repoPath) : undefined,
  });
  return (
    <div ref={panelRef}>
      <textarea id="test-message" />
      <button>Commit</button>
    </div>
  );
}
const render = () =>
  act(async () =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
  );
const press = (key = 'Enter', extra: KeyboardEventInit = {}) =>
  act(async () => {
    const target = document.activeElement || window;
    target.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...extra }));
  });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearCommitShortcutRequest();
  commit.mockReset().mockResolvedValue(undefined);
  disabled = false;
  hasMessage = true;
  global = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  clearCommitShortcutRequest();
});
describe('commit shortcut scope and delivery', () => {
  it('submits from anywhere in the visible staging view and suppresses key repeats', async () => {
    await render();
    const graph = document.createElement('button');
    document.body.append(graph);
    graph.focus();
    await press();
    await press('Enter', { repeat: true });
    expect(commit).toHaveBeenCalledOnce();
  });
  it('handles an application request exactly once, including StrictMode effect replay', async () => {
    requestCommitShortcut(repoPath);
    await render();
    expect(commit).toHaveBeenCalledOnce();
    expect(useCommitShortcutRequest.getState().request).toBeNull();
  });
  it('delivers a keyboard request only once while both application and staging are mounted', async () => {
    global = true;
    await render();
    host.querySelector('textarea')!.focus();
    await press();
    expect(commit).toHaveBeenCalledOnce();
  });
  it('focuses an empty message, and respects busy and conflict guards', async () => {
    hasMessage = false;
    await render();
    await act(async () => requestCommitShortcut(repoPath));
    expect(document.activeElement).toBe(host.querySelector('textarea'));
    expect(commit).not.toHaveBeenCalled();
    disabled = true;
    hasMessage = true;
    await render();
    await press();
    await act(async () => requestCommitShortcut(repoPath));
    expect(commit).not.toHaveBeenCalled();
    expect(useCommitShortcutRequest.getState().request).toBeNull();
  });
  it('ignores hidden forms, other repositories and external editors until the application reveals staging', async () => {
    global = false;
    await render();
    host.style.display = 'none';
    await press();
    expect(commit).not.toHaveBeenCalled();
    host.style.display = '';
    await act(async () => requestCommitShortcut('C:/other-repo'));
    expect(commit).not.toHaveBeenCalled();
    const editor = document.createElement('textarea');
    document.body.append(editor);
    editor.focus();
    await press();
    expect(commit).not.toHaveBeenCalled();
    await act(async () => requestCommitShortcut(repoPath));
    expect(commit).toHaveBeenCalledOnce();
  });
  it('respects configured and disabled bindings, dialogs, IME and shortcut recording', async () => {
    await render();
    await act(async () =>
      updateResource(resourceKey('app', 'getSettings'), {
        ...DEFAULT_SETTINGS,
        keyboardShortcuts: { commit: { key: 'F8', primary: false, alt: false, shift: false } },
      }),
    );
    await press();
    expect(commit).not.toHaveBeenCalled();
    const release = beginShortcutCapture();
    try {
      await press('F8', { ctrlKey: false });
    } finally {
      release();
    }
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    await press('F8', { ctrlKey: false });
    dialog.remove();
    await press('F8', { ctrlKey: false, isComposing: true });
    expect(commit).not.toHaveBeenCalled();
    await press('F8', { ctrlKey: false });
    expect(commit).toHaveBeenCalledOnce();
    await act(async () => updateResource(resourceKey('app', 'getSettings'), { ...DEFAULT_SETTINGS, keyboardShortcuts: { commit: null } }));
    await press('F8', { ctrlKey: false });
    await press();
    expect(commit).toHaveBeenCalledOnce();
  });
});
