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
};

export const useGlobalKeyboardShortcuts = ({ setActiveTab, onFetch, onOpenCommandPalette, onOpenQuickTodo, onCreateCommit }: ShortcutHandlers) => {
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
      };
      const tabs: AppTabId[] = ['localRepos', 'repo', 'hosting', 'settings', 'planner', 'analytics'];
      for (const entry of SHORTCUT_ACTIONS) {
        const handler = handlers[entry.id] ?? (!editing && tabs.includes(entry.id as AppTabId) ? () => setActiveTab(entry.id as AppTabId) : undefined);
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
  }, [shortcuts, setActiveTab, onFetch, onOpenCommandPalette, onOpenQuickTodo, onCreateCommit]);
};
