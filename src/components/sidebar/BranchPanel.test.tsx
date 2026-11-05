// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BranchPanel } from './BranchPanel';
import type { TutorialHostApi } from '@/shared/tutorial/types';
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, tr: (_de: string, en: string) => en }) }));
let host: HTMLDivElement, root: Root;
const checkout = vi.fn(),
  menu = vi.fn(),
  create = vi.fn(),
  creatingChanged = vi.fn();
const branches = [
  { name: 'main', isHead: true, scope: 'local' as const },
  { name: 'feature/practice', isHead: false, scope: 'local' as const },
  { name: 'remotes/origin/topic', isHead: false, scope: 'remote' as const },
];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete window.tutorialHost;
  vi.unstubAllGlobals();
});
const render = (creating = false) =>
  act(() =>
    root.render(
      createElement(BranchPanel, {
        branches,
        isCreatingBranch: creating,
        onSetCreatingBranch: creatingChanged,
        onCreateBranch: create,
        onCheckoutBranch: checkout,
        onSetBranchContextMenu: menu,
        collapsed: false,
        onToggleCollapsed: vi.fn(),
      }),
    ),
  );
const key = (node: Element, value: string, options: KeyboardEventInit = {}) =>
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options })));
it('offers keyboard checkout without switching the already active branch', () => {
  render();
  const main = host.querySelector('[data-branch-name=main]')!,
    feature = host.querySelector('[data-branch-name="feature/practice"]')!;
  expect(main.getAttribute('aria-current')).toBe('true');
  expect(feature.getAttribute('tabindex')).toBe('0');
  key(main, 'Enter');
  expect(checkout).not.toHaveBeenCalled();
  key(feature, 'Enter');
  expect(checkout).toHaveBeenLastCalledWith('feature/practice');
  key(feature, ' ');
  expect(checkout).toHaveBeenCalledTimes(2);
});
it('opens local and remote branch actions with the context-menu keys', () => {
  render();
  key(host.querySelector('[data-branch-name="feature/practice"]')!, 'F10', { shiftKey: true });
  expect(menu).toHaveBeenLastCalledWith(expect.objectContaining({ branch: 'feature/practice', isHead: false }));
  key(host.querySelector('[data-branch-name="remotes/origin/topic"]')!, 'Enter');
  expect(menu).toHaveBeenLastCalledWith(expect.objectContaining({ branch: 'remotes/origin/topic' }));
  expect(checkout).not.toHaveBeenCalled();
});
it.each([false, true])('handles explanation focus without losing an empty practice name field, practice: %s', (practice) => {
  if (practice) window.tutorialHost = {} as TutorialHostApi;
  render(true);
  const coach = document.createElement('section');
  coach.className = 'tutorial-coach';
  coach.innerHTML = '<button>Next explanation</button>';
  host.append(coach);
  act(() => {
    (host.querySelector('[data-tutorial=branch-name]') as HTMLInputElement).focus();
  });
  creatingChanged.mockClear();
  act(() => {
    coach.querySelector('button')!.focus();
  });
  expect(creatingChanged).toHaveBeenCalledTimes(practice ? 0 : 1);
});
it('does not submit a name during IME composition or a held Enter key', () => {
  render(true);
  const field = host.querySelector('[data-tutorial=branch-name]')!;
  expect(field.getAttribute('aria-label')).toBe('Branch name');
  key(field, 'Enter', { isComposing: true });
  key(field, 'Enter', { repeat: true });
  expect(create).not.toHaveBeenCalled();
  key(field, 'Enter');
  expect(create).toHaveBeenCalledOnce();
});
