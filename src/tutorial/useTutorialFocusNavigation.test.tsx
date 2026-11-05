// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTutorialFocusNavigation } from './useTutorialFocusNavigation';

describe('practice dialog focus with the coach', () => {
  let root: Root;
  let container: HTMLDivElement;
  let workspace: HTMLDivElement;
  function Harness({ enabled = true }) {
    useTutorialFocusNavigation(enabled);
    return null;
  }
  function tab(shiftKey = false) {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, shiftKey });
    act(() => document.activeElement!.dispatchEvent(event));
    return event;
  }
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    container = document.createElement('div');
    workspace = document.createElement('div');
    workspace.innerHTML = `<div role="dialog" aria-modal="true"><input id="field"><button id="confirm">Confirm</button><button disabled>Disabled</button></div>
      <header class="tutorial-banner"><button id="exit">Exit</button></header>
      <section class="tutorial-coach"><h2 tabindex="-1">Explanation</h2><button id="back">Back</button><button id="next">Next</button><button hidden>Hidden</button></section>`;
    document.body.append(container, workspace);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    workspace.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('cycles between dialog, exit and coach in both directions', () => {
    workspace.querySelector<HTMLElement>('#field')!.focus();
    expect(document.activeElement?.id).toBe('field');
    for (const id of ['confirm', 'exit', 'back', 'next', 'field']) {
      expect(tab().defaultPrevented).toBe(true);
      expect(document.activeElement?.id).toBe(id);
    }
    tab(true);
    expect(document.activeElement?.id).toBe('next');
    expect(workspace.querySelector('[role=dialog]')?.getAttribute('aria-modal')).toBe('false');
  });

  it('includes a portaled confirmation appearing later and excludes underlying controls', async () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '<button id="top">Delete</button>';
    document.body.append(modal);
    await act(async () => {});
    try {
      expect(modal.getAttribute('aria-modal')).toBe('false');
      modal.querySelector<HTMLElement>('button')!.focus();
      tab();
      expect(document.activeElement?.id).toBe('exit');
      tab(true);
      expect(document.activeElement?.id).toBe('top');
    } finally {
      modal.remove();
    }
  });
  it('includes native disclosure summaries in both directions and their contents only when visible', () => {
    const dialog = workspace.querySelector('[role=dialog]')!;
    dialog.innerHTML =
      '<button id="first">First</button><details><summary id="safeguards">Safeguards</summary><input id="patterns"></details><button id="last">Last</button>';
    const field = dialog.querySelector<HTMLInputElement>('input')!;
    const rectangles = vi.fn(() => [] as unknown as DOMRectList);
    Object.defineProperty(field, 'getClientRects', { configurable: true, value: rectangles });
    dialog.querySelector<HTMLElement>('#first')!.focus();
    tab();
    expect(document.activeElement?.id).toBe('safeguards');
    tab();
    expect(document.activeElement?.id).toBe('last');
    tab(true);
    expect(document.activeElement?.id).toBe('safeguards');
    dialog.querySelector('details')!.open = true;
    rectangles.mockReturnValue([{}] as unknown as DOMRectList);
    tab();
    expect(document.activeElement?.id).toBe('patterns');
  });

  it('leaves chapter selection and its own focus trap in charge', () => {
    act(() => root.render(<Harness enabled={false} />));
    expect(workspace.querySelector('[role=dialog]')?.getAttribute('aria-modal')).toBe('true');
    workspace.querySelector<HTMLElement>('#confirm')!.focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(document.activeElement?.id).toBe('confirm');
  });

  it('uses opening order when a newer picker precedes its underlying dialog in the DOM', async () => {
    const picker = document.createElement('div');
    picker.setAttribute('role', 'dialog');
    picker.innerHTML = '<button id="folder">Example folder</button>';
    workspace.prepend(picker);
    await act(async () => {});
    picker.querySelector<HTMLElement>('button')!.focus();
    tab();
    expect(document.activeElement?.id).toBe('exit');
    picker.remove();
    tab(true);
    expect(document.activeElement?.id).toBe('confirm');
  });

  it('does not replace normal workspace Tab navigation without an overlay', () => {
    workspace.querySelector('[role=dialog]')!.remove();
    expect(tab().defaultPrevented).toBe(false);
  });
});
