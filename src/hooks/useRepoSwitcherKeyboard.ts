import { useCallback, useEffect, useRef, useState } from 'react';
import { getShortcutBinding, matchesShortcut, type ShortcutBinding } from '@/shared/keyboardShortcuts';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { isShortcutEditableTarget, isShortcutSuppressed } from './keyboardShortcutRuntime';

type UseRepoSwitcherKeyboardParams = {
  openRepos: string[];
  activeRepo: string | null;
  onSwitchRepo: (repoPath: string) => Promise<boolean | void> | void;
  onRepositoryCommitted: () => void;
};

export const useRepoSwitcherKeyboard = ({ openRepos, activeRepo, onSwitchRepo, onRepositoryCommitted }: UseRepoSwitcherKeyboardParams) => {
  const shortcuts = useKeyboardShortcuts();
  const gestureBindingRef = useRef<ShortcutBinding | null>(null);
  const [repoSwitcherIndex, setRepoSwitcherIndex] = useState<number | null>(null);
  const repoSwitcherIndexRef = useRef<number | null>(null);
  const repoSwitcherListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    repoSwitcherIndexRef.current = repoSwitcherIndex;
  }, [repoSwitcherIndex]);

  useEffect(() => {
    if (repoSwitcherIndex === null) return;

    if (openRepos.length === 0) {
      repoSwitcherIndexRef.current = null;
      setRepoSwitcherIndex(null);
      return;
    }

    if (repoSwitcherIndex >= openRepos.length) {
      const nextIndex = openRepos.length - 1;
      repoSwitcherIndexRef.current = nextIndex;
      setRepoSwitcherIndex(nextIndex);
      return;
    }

    const listElement = repoSwitcherListRef.current;
    const selectedElement = listElement?.querySelector<HTMLElement>(`#repo-switcher-item-${repoSwitcherIndex}`);
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [openRepos.length, repoSwitcherIndex]);

  const closeRepoSwitcher = useCallback(() => {
    gestureBindingRef.current = null;
    repoSwitcherIndexRef.current = null;
    setRepoSwitcherIndex(null);
  }, []);

  const moveRepoSwitcherSelection = useCallback(
    (delta: number) => {
      if (openRepos.length === 0) return;

      setRepoSwitcherIndex((previous) => {
        const activeIndex = activeRepo ? openRepos.indexOf(activeRepo) : -1;
        const fallbackIndex = activeIndex >= 0 ? activeIndex : delta > 0 ? -1 : 0;
        const baseIndex = previous ?? fallbackIndex;
        const nextIndex = openRepos.length <= 1 ? 0 : (baseIndex + delta + openRepos.length) % openRepos.length;

        repoSwitcherIndexRef.current = nextIndex;
        return nextIndex;
      });
    },
    [activeRepo, openRepos],
  );

  const commitRepoSwitcherSelection = useCallback(() => {
    const selectedIndex = repoSwitcherIndexRef.current;
    if (selectedIndex === null) return;

    const targetRepo = openRepos[selectedIndex];
    closeRepoSwitcher();

    if (!targetRepo) return;
    void Promise.resolve(onSwitchRepo(targetRepo)).then((activated) => {
      if (activated !== false) onRepositoryCommitted();
    });
  }, [closeRepoSwitcher, onRepositoryCommitted, onSwitchRepo, openRepos]);

  useEffect(() => {
    closeRepoSwitcher();
  }, [shortcuts, closeRepoSwitcher]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isShortcutSuppressed(true)) {
        closeRepoSwitcher();
        return;
      }
      if (event.key === 'Escape' && repoSwitcherIndexRef.current !== null) {
        event.preventDefault();
        closeRepoSwitcher();
        return;
      }

      if (isShortcutEditableTarget(event.target) || isShortcutEditableTarget(document.activeElement)) return;
      const previous = getShortcutBinding('previousRepository', shortcuts);
      const next = getShortcutBinding('nextRepository', shortcuts);
      const delta = matchesShortcut(event, previous, true) ? -1 : matchesShortcut(event, next, true) ? 1 : 0;
      if (!delta || openRepos.length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      gestureBindingRef.current = delta < 0 ? previous : next;
      moveRepoSwitcherSelection(delta);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (repoSwitcherIndexRef.current === null) return;
      if (isShortcutSuppressed(true)) {
        closeRepoSwitcher();
        return;
      }
      const b = gestureBindingRef.current;
      if (!b || ((!b.primary || event.ctrlKey || event.metaKey) && (!b.alt || event.altKey) && (!b.shift || event.shiftKey))) return;

      event.preventDefault();
      event.stopPropagation();
      commitRepoSwitcherSelection();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', closeRepoSwitcher);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', closeRepoSwitcher);
    };
  }, [shortcuts, openRepos.length, closeRepoSwitcher, commitRepoSwitcherSelection, moveRepoSwitcherSelection]);

  return {
    repoSwitcherIndex,
    repoSwitcherListRef,
  };
};
