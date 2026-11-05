// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchContextMenu } from './BranchContextMenu';

vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, tr: (_de: string, en: string) => en }) }));
let root: Root;
let container: HTMLDivElement;
const onDelete = vi.fn();
const close = vi.fn();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function render(branch: string, isProtected = false) {
  act(() =>
    root.render(
      createElement(BranchContextMenu, {
        branchContextMenu: { branch, isHead: false, isProtected, x: 0, y: 0 },
        onDelete,
        onCheckout: vi.fn(),
        onMerge: vi.fn(),
        onRename: vi.fn(),
        setBranchContextMenu: close,
      }),
    ),
  );
  return container.querySelector<HTMLButtonElement>('.ctx-menu-item.danger')!;
}
describe('primary branch deletion menu', () => {
  it('focuses menu actions and navigates with arrow keys while skipping disabled deletion', () => {
    render('main');
    const items = [...container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    expect(document.activeElement).toBe(items[0]);
    const key = (value: string) =>
      act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));
    key('ArrowUp');
    expect(document.activeElement).toBe(items.at(-1));
    key('Home');
    expect(document.activeElement).toBe(items[0]);
    key('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key('End');
    expect(document.activeElement).toBe(items.at(-1));
    expect((document.activeElement as HTMLButtonElement).disabled).toBe(false);
  });
  it('closes with Escape and restores focus to the opener when unmounted', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    try {
      render('feature/done');
      act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      expect(close).toHaveBeenCalledWith(null);
      act(() => root.render(null));
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
    }
  });
  it.each(['main', 'master', 'MAIN'])('disables deletion of %s even before protection metadata is loaded', (name) => {
    const button = render(name);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Protected primary branch');
    act(() => button.click());
    expect(onDelete).not.toHaveBeenCalled();
  });
  it('disables a custom primary branch identified by the backend', () => {
    expect(render('stable/release', true).disabled).toBe(true);
  });
  it('keeps deletion available for ordinary feature branches', () => {
    const button = render('feature/done');
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(onDelete).toHaveBeenCalledWith('feature/done');
  });
});
