import { useEffect, useLayoutEffect, useRef } from 'react';
import { isShortcutEditableTarget, isShortcutSuppressed } from '@/hooks/keyboardShortcutRuntime';

type Navigation = { canGoBack: boolean; canGoNext: boolean; onBack: () => void; onNext: () => void };
const arrowWidgets =
  '[role="tablist"], [role="tree"], [role="treeitem"], [role="listbox"], [role="slider"], [role="spinbutton"], [role="grid"], [role="menu"], [role="menubar"]';

function hasOpenMenu() {
  return [
    ...document.querySelectorAll(
      '.tutorial-workspace [role="menu"], .tutorial-workspace .topbar-dropdown, .tutorial-workspace .commit-search-toolbar__more-menu',
    ),
  ].some(
    (menu) => !menu.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(menu).display !== 'none' && getComputedStyle(menu).visibility !== 'hidden',
  );
}

export function useTutorialKeyboardNavigation(navigation: Navigation) {
  const current = useRef(navigation);
  useLayoutEffect(() => {
    current.current = navigation;
  }, [navigation]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : document.activeElement;
      if (isShortcutEditableTarget(event.target) || target?.closest(arrowWidgets) || isShortcutSuppressed() || hasOpenMenu()) return;
      const { canGoBack, canGoNext, onBack, onNext } = current.current;
      const action = event.key === 'ArrowLeft' ? (canGoBack ? onBack : null) : canGoNext ? onNext : null;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);
}
