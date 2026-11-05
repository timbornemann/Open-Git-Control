// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginShortcutCapture } from '@/hooks/keyboardShortcutRuntime';
import { useTutorialKeyboardNavigation } from './useTutorialKeyboardNavigation';

describe('tutorial arrow keys', () => {
  let root: Root;
  let container: HTMLDivElement;
  let workspace: HTMLDivElement;
  const back = vi.fn();
  const next = vi.fn();
  function Harness({ enabled = true, canGoBack = true, canGoNext = true, onNext = next }) {
    useTutorialKeyboardNavigation({ enabled, canGoBack, canGoNext, onBack: back, onNext });
    return null;
  }
  function key(key: string, target: EventTarget = document.body, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  }
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    back.mockReset();
    next.mockReset();
    container = document.createElement('div');
    workspace = document.createElement('div');
    workspace.className = 'tutorial-workspace';
    document.body.append(container, workspace);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    workspace.remove();
    vi.unstubAllGlobals();
  });

  it('navigates left and right and consumes the handled keys', () => {
    expect(key('ArrowLeft').defaultPrevented).toBe(true);
    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(back).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it('respects the first-step boundary and incomplete exercises', () => {
    act(() => root.render(<Harness canGoBack={false} canGoNext={false} />));
    key('ArrowLeft');
    key('ArrowRight');
    expect(back).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    '<input>',
    '<textarea></textarea>',
    '<select></select>',
    '<div contenteditable="true"><span></span></div>',
    '<div class="cm-editor"><span></span></div>',
  ])('preserves editing arrow keys in %s', (markup) => {
    workspace.innerHTML = markup;
    const target = workspace.querySelector('span') || workspace.firstElementChild!;
    expect(key('ArrowLeft', target).defaultPrevented).toBe(false);
    expect(key('ArrowRight', target).defaultPrevented).toBe(false);
    expect(back).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['tablist', 'tree', 'treeitem', 'listbox', 'slider', 'spinbutton', 'grid', 'menu', 'menubar'])('preserves arrow keys within a %s widget', (role) => {
    workspace.innerHTML = `<div role="${role}"><button>Item</button></div>`;
    key('ArrowLeft', workspace.querySelector('button')!);
    key('ArrowRight', workspace.querySelector('button')!);
    expect(back).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('pauses for chapter selection or another dialog', () => {
    workspace.innerHTML = '<div role="dialog"></div>';
    key('ArrowLeft');
    key('ArrowRight');
    expect(back).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    workspace.firstElementChild!.setAttribute('hidden', '');
    key('ArrowRight');
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['topbar-dropdown', 'ctx-menu'])('preserves open %s navigation even when focus remains on the trigger', (className) => {
    workspace.innerHTML = `<div class="${className}"></div>`;
    key('ArrowRight');
    expect(next).not.toHaveBeenCalled();
    workspace.firstElementChild!.setAttribute('aria-hidden', 'true');
    key('ArrowRight');
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['dialog', 'menu'])('allows coach navigation while explaining a %s', (role) => {
    workspace.innerHTML = `<div role="${role}"><button>Action</button></div><section class="tutorial-coach"><h2 tabindex="-1">Explanation</h2></section>`;
    key('ArrowRight', workspace.querySelector('[role] button')!);
    expect(next).not.toHaveBeenCalled();
    key('ArrowLeft', workspace.querySelector('h2')!);
    key('ArrowRight', workspace.querySelector('h2')!);
    expect(back).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it('disables coach navigation while choosing another chapter', () => {
    workspace.innerHTML = '<section class="tutorial-coach"><button>Next</button></section>';
    act(() => root.render(<Harness enabled={false} />));
    key('ArrowRight', workspace.querySelector('button')!);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not navigate while a shortcut is being recorded', () => {
    const release = beginShortcutCapture();
    try {
      key('ArrowRight');
      expect(next).not.toHaveBeenCalled();
    } finally {
      release();
    }
    key('ArrowRight');
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['role', 'legacy'])('also pauses for a portaled %s menu outside the workspace', (kind) => {
    const menu = document.createElement('div');
    if (kind === 'role') menu.setAttribute('role', 'menu');
    else menu.className = 'ctx-menu';
    document.body.append(menu);
    try {
      expect(key('ArrowRight').defaultPrevented).toBe(false);
      expect(next).not.toHaveBeenCalled();
      menu.style.display = 'none';
      expect(key('ArrowRight').defaultPrevented).toBe(true);
      expect(next).toHaveBeenCalledOnce();
    } finally {
      menu.remove();
    }
  });

  it('ignores held keys, modifiers, composition and other directions', () => {
    for (const options of [{ repeat: true }, { isComposing: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }])
      key('ArrowRight', document.body, options);
    key('ArrowUp');
    key('ArrowDown');
    expect(back).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('respects a key already handled by the focused control', () => {
    workspace.addEventListener('keydown', (event) => event.preventDefault());
    key('ArrowRight', workspace);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses current callbacks and removes navigation on unmount', () => {
    const updated = vi.fn();
    act(() => root.render(<Harness onNext={updated} />));
    key('ArrowRight');
    expect(updated).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
    act(() => root.render(null));
    key('ArrowRight');
    expect(updated).toHaveBeenCalledOnce();
  });
});
