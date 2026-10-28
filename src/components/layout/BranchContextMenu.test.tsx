// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchContextMenu } from './BranchContextMenu';

vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, tr: (_de: string, en: string) => en }) }));
let root: Root;
let container: HTMLDivElement;
const onDelete = vi.fn();
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
        setBranchContextMenu: vi.fn(),
      }),
    ),
  );
  return container.querySelector<HTMLButtonElement>('.ctx-menu-item.danger')!;
}
describe('primary branch deletion menu', () => {
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
