import { useEffect } from 'react';

import type { AppTabId } from '@/app/state/contracts';
import { getShortcutBinding, matchesShortcut, SHORTCUT_ACTIONS } from '@/shared/keyboardShortcuts';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { isShortcutEditableTarget, isShortcutSuppressed } from './keyboardShortcutRuntime';

type ShortcutHandlers = {
  setActiveTab: (tab: AppTabId) => void;
  onFetch: () => void;
  onOpenCommandPalette: () => void;
  onOpenQuickTodo: () => void;
  onCreateCommit?: () => void;
  onRefresh?: () => void;
  onOpenRepository?: () => void;
  onCloneRepository?: () => void;
  onCreateBranch?: () => void;
  onPull?: () => void;
  onPush?: () => void;
};

export const useGlobalKeyboardShortcuts = ({
  setActiveTab,
  onFetch,
  onOpenCommandPalette,
  onOpenQuickTodo,
  onCreateCommit,
  onRefresh,
  onOpenRepository,
  onCloneRepository,
  onCreateBranch,
  onPull,
  onPush,
}: ShortcutHandlers) => {
  const shortcuts = useKeyboardShortcuts();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutSuppressed()) return;
      const editing = isShortcutEditableTarget(e.target) || isShortcutEditableTarget(document.activeElement);
      const handlers: Partial<Record<(typeof SHORTCUT_ACTIONS)[number]['id'], () => void>> = {
        fetch: onFetch,
        commandPalette: onOpenCommandPalette,
        quickTodo: onOpenQuickTodo,
        commit: onCreateCommit,
        refresh: onRefresh,
        openRepository: onOpenRepository,
        cloneRepository: onCloneRepository,
        createBranch: onCreateBranch,
        pull: onPull,
        push: onPush,
      };
      for (const entry of SHORTCUT_ACTIONS) {
        const handler =
          handlers[entry.id] ?? (!editing && entry.group === 'navigation' && entry.id !== 'commandPalette' ? () => setActiveTab(entry.id) : undefined);
        if (!handler || !matchesShortcut(e, getShortcutBinding(entry.id, shortcuts), true)) continue;
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        handler();
        return;
      }
    };

    // App actions must reach their handlers before an editor consumes the key.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    shortcuts,
    setActiveTab,
    onFetch,
    onOpenCommandPalette,
    onOpenQuickTodo,
    onCreateCommit,
    onRefresh,
    onOpenRepository,
    onCloneRepository,
    onCreateBranch,
    onPull,
    onPush,
  ]);
};
