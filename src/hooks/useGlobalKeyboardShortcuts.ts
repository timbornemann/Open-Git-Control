import { useEffect } from 'react';

import type { AppTabId } from '@/app/state/contracts';

type ShortcutHandlers = {
  setActiveTab: (tab: AppTabId) => void;
  onFetch: () => void;
  onOpenCommandPalette: () => void;
};

const FOCUSABLE_TEXT_SELECTOR = 'input, textarea, [contenteditable="true"], select';

const isEditableFocused = (): boolean => {
  const el = document.activeElement;
  if (!el) return false;
  return el.matches(FOCUSABLE_TEXT_SELECTOR);
};

export const useGlobalKeyboardShortcuts = ({ setActiveTab, onFetch, onOpenCommandPalette }: ShortcutHandlers) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      // Keep the established Ctrl+1..4 mapping; the planner is available on Ctrl+5.
      if (!e.shiftKey && !e.altKey) {
        const tabs: AppTabId[] = ['localRepos', 'repo', 'github', 'settings', 'planner'];
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < tabs.length) {
          e.preventDefault();
          setActiveTab(tabs[idx]);
          return;
        }
      }

      // Shortcuts that should not fire when typing
      if (isEditableFocused()) return;

      // Ctrl+Shift+F → Fetch
      if (e.shiftKey && e.key === 'F') {
        e.preventDefault();
        onFetch();
        return;
      }

      // Ctrl+Shift+P → Command palette
      if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        onOpenCommandPalette();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, onFetch, onOpenCommandPalette]);
};
