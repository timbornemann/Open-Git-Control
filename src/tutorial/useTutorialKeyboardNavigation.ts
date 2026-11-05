import { useEffect, useLayoutEffect, useRef } from 'react';
import { isShortcutCaptureActive, isShortcutDialogOpen, isShortcutEditableTarget } from '@/hooks/keyboardShortcutRuntime';

type Navigation = { enabled?: boolean; canGoBack: boolean; canGoNext: boolean; onBack: () => void; onNext: () => void };
const arrowWidgets =
  '[role="tablist"], [role="tree"], [role="treeitem"], [role="listbox"], [role="slider"], [role="spinbutton"], [role="grid"], [role="menu"], [role="menubar"]';

function hasOpenMenu() {
  return [
    ...document.querySelectorAll('[role="menu"], .ctx-menu, .tutorial-workspace .topbar-dropdown, .tutorial-workspace .commit-search-toolbar__more-menu'),
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
      if (current.current.enabled === false || isShortcutEditableTarget(event.target) || target?.closest(arrowWidgets) || isShortcutCaptureActive()) return;
      // The explanation remains operable while it describes a dialog. Controls
      // inside that dialog or its menus still retain their own arrow keys.
      if (!target?.closest('.tutorial-coach') && (isShortcutDialogOpen() || hasOpenMenu())) return;
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
