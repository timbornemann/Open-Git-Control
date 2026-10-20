// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { SidebarActionsMenu } from './SidebarActionsMenu';

describe('extensible sidebar actions menu', () => {
  let root: Root, host: HTMLDivElement;
  const cleanup = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    cleanup.mockReset();
    act(() =>
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(SidebarActionsMenu, {
            actions: [
              { id: 'cleanup', label: 'Clean up branches', icon: null, run: cleanup },
              { id: 'future', label: 'Another action', icon: null, run: vi.fn() },
            ],
          }),
        }),
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });
  const trigger = () => host.querySelector<HTMLButtonElement>('button')!;
  it('reveals actions on hover without executing them, survives the pointer gap, and closes after leaving', () => {
    act(() => trigger().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(cleanup).not.toHaveBeenCalled();
    act(() => trigger().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    act(() => document.querySelector('[role="menu"]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    act(() => vi.advanceTimersByTime(200));
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    act(() => document.querySelector('[role="menu"]')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    act(() => vi.advanceTimersByTime(200));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
  it('supports click activation and executes only the clicked action', () => {
    act(() => trigger().click());
    act(() => document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());
    expect(cleanup).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
  it('supports keyboard navigation, Escape and focus restoration', () => {
    trigger().focus();
    act(() => trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    const items = document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(document.activeElement).toBe(items[0]);
    act(() => items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(items[1]);
    act(() => items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
