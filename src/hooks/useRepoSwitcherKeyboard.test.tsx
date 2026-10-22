// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resourceKey } from '@/data/clientCache';
import { updateResource } from '@/data/queryClient';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import type { ShortcutOverrides } from '@/shared/keyboardShortcuts';
import { beginShortcutCapture } from './keyboardShortcutRuntime';
import { useRepoSwitcherKeyboard } from './useRepoSwitcherKeyboard';

let host: HTMLDivElement, root: Root;
let state: ReturnType<typeof useRepoSwitcherKeyboard>;
let repos: string[];
const switchRepo = vi.fn(),
  committed = vi.fn();
function Harness() {
  state = useRepoSwitcherKeyboard({ openRepos: repos, activeRepo: 'one', onSwitchRepo: switchRepo, onRepositoryCommitted: committed });
  return state.repoSwitcherIndex === null ? null : (
    <div className="repo-switcher-modal" role="dialog">
      {state.repoSwitcherIndex}
    </div>
  );
}
const render = () => act(async () => root.render(<Harness />));
async function key(type: string, key: string, modifiers: KeyboardEventInit = {}) {
  await act(async () => window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...modifiers })));
}
const configure = (keyboardShortcuts: ShortcutOverrides) =>
  act(async () => updateResource(resourceKey('app', 'getSettings'), { ...DEFAULT_SETTINGS, keyboardShortcuts }));
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  switchRepo.mockReset().mockResolvedValue(true);
  committed.mockReset();
  repos = ['one', 'two', 'three'];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});
describe('configurable repository switcher', () => {
  it('cycles, repeats and wraps while its own dialog is open, then commits on modifier release', async () => {
    await render();
    await key('keydown', 'ArrowDown', { ctrlKey: true });
    expect(state.repoSwitcherIndex).toBe(1);
    await key('keydown', 'ArrowDown', { ctrlKey: true, repeat: true });
    expect(state.repoSwitcherIndex).toBe(2);
    await key('keydown', 'ArrowDown', { ctrlKey: true });
    expect(state.repoSwitcherIndex).toBe(0);
    await key('keydown', 'ArrowUp', { ctrlKey: true });
    expect(state.repoSwitcherIndex).toBe(2);
    await key('keyup', 'ArrowUp', { ctrlKey: true });
    expect(switchRepo).not.toHaveBeenCalled();
    await key('keyup', 'Control');
    expect(switchRepo).toHaveBeenCalledExactlyOnceWith('three');
    expect(committed).toHaveBeenCalledOnce();
    expect(state.repoSwitcherIndex).toBeNull();
  });
  it('supports Alt and Shift bindings, disables old keys and respects rejected navigation guards', async () => {
    await configure({ nextRepository: { key: 'k', primary: false, alt: true, shift: true }, previousRepository: null });
    await render();
    await key('keydown', 'ArrowDown', { ctrlKey: true });
    expect(state.repoSwitcherIndex).toBeNull();
    await key('keydown', 'K', { altKey: true, shiftKey: true });
    expect(state.repoSwitcherIndex).toBe(1);
    switchRepo.mockResolvedValue(false);
    await key('keyup', 'Shift', { altKey: true });
    expect(switchRepo).toHaveBeenCalledWith('two');
    expect(committed).not.toHaveBeenCalled();
  });
  it('cancels on Escape, window blur and settings changes', async () => {
    await render();
    await key('keydown', 'ArrowDown', { metaKey: true });
    await key('keydown', 'Escape');
    expect(state.repoSwitcherIndex).toBeNull();
    await key('keydown', 'ArrowDown', { ctrlKey: true });
    act(() => window.dispatchEvent(new Event('blur')));
    expect(state.repoSwitcherIndex).toBeNull();
    await key('keydown', 'ArrowDown', { ctrlKey: true });
    await configure({ nextRepository: null });
    expect(state.repoSwitcherIndex).toBeNull();
    expect(switchRepo).not.toHaveBeenCalled();
  });
  it('ignores editable fields, other dialogs, capture sessions, IME and an empty repository list', async () => {
    await render();
    const input = document.createElement('textarea');
    document.body.append(input);
    input.focus();
    await key('keydown', 'ArrowDown', { ctrlKey: true });
    expect(state.repoSwitcherIndex).toBeNull();
    input.remove();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    await key('keydown', 'ArrowDown', { ctrlKey: true });
    expect(state.repoSwitcherIndex).toBeNull();
    dialog.remove();
    const release = beginShortcutCapture();
    try {
      await key('keydown', 'ArrowDown', { ctrlKey: true });
      expect(state.repoSwitcherIndex).toBeNull();
    } finally {
      release();
    }
    await key('keydown', 'ArrowDown', { ctrlKey: true, isComposing: true });
    expect(state.repoSwitcherIndex).toBeNull();
    repos = [];
    await render();
    await key('keydown', 'ArrowDown', { ctrlKey: true });
    expect(state.repoSwitcherIndex).toBeNull();
  });
});
