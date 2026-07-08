import { useCallback, useEffect, useRef, useState } from 'react';

const REPO_SWITCH_EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"], select';

type UseRepoSwitcherKeyboardParams = {
  openRepos: string[];
  activeRepo: string | null;
  onSwitchRepo: (repoPath: string) => Promise<void> | void;
  onRepositoryCommitted: () => void;
};

const isRepoSwitchEditableTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : document.activeElement;
  return Boolean(element?.closest(REPO_SWITCH_EDITABLE_SELECTOR));
};

export const useRepoSwitcherKeyboard = ({ openRepos, activeRepo, onSwitchRepo, onRepositoryCommitted }: UseRepoSwitcherKeyboardParams) => {
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
    void onSwitchRepo(targetRepo);
    onRepositoryCommitted();
  }, [closeRepoSwitcher, onRepositoryCommitted, onSwitchRepo, openRepos]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && repoSwitcherIndexRef.current !== null) {
        event.preventDefault();
        closeRepoSwitcher();
        return;
      }

      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey || event.shiftKey) return;
      if (isRepoSwitchEditableTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      moveRepoSwitcherSelection(event.key === 'ArrowDown' ? 1 : -1);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (repoSwitcherIndexRef.current === null) return;

      const isModifierRelease = event.key === 'Control' || event.key === 'Meta';
      const isArrowReleaseWithoutModifier = (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.ctrlKey && !event.metaKey;
      if (!isModifierRelease && !isArrowReleaseWithoutModifier) return;

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
  }, [closeRepoSwitcher, commitRepoSwitcherSelection, moveRepoSwitcherSelection]);

  return {
    repoSwitcherIndex,
    repoSwitcherListRef,
  };
};
