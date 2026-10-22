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
};

export const useGlobalKeyboardShortcuts = ({ setActiveTab, onFetch, onOpenCommandPalette, onOpenQuickTodo }: ShortcutHandlers) => {
  const shortcuts = useKeyboardShortcuts();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutSuppressed() || isShortcutEditableTarget(e.target) || isShortcutEditableTarget(document.activeElement)) return;
      const handlers: Partial<Record<(typeof SHORTCUT_ACTIONS)[number]['id'], () => void>> = {
        fetch: onFetch,
        commandPalette: onOpenCommandPalette,
        quickTodo: onOpenQuickTodo,
      };
      const tabs: AppTabId[] = ['localRepos', 'repo', 'hosting', 'settings', 'planner', 'analytics'];
      for (const entry of SHORTCUT_ACTIONS) {
        const handler = handlers[entry.id] ?? (tabs.includes(entry.id as AppTabId) ? () => setActiveTab(entry.id as AppTabId) : undefined);
        if (!handler || !matchesShortcut(e, getShortcutBinding(entry.id, shortcuts), true)) continue;
        e.preventDefault();
        if (e.repeat) return;
        handler();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, setActiveTab, onFetch, onOpenCommandPalette, onOpenQuickTodo]);
};
