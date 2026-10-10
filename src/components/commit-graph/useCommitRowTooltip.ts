import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { GraphNode } from '@/utils/graphLayout';

type Target = { hash: string; anchor: HTMLDivElement };

function hasHiddenInformation(row: HTMLElement) {
  return [...row.querySelectorAll<HTMLElement>('.commit-hash, .commit-subject, .commit-author, .commit-refs, .commit-stats, .commit-stats-value')].some(
    (element) => getComputedStyle(element).display === 'none' || element.scrollWidth > element.clientWidth,
  );
}

export function useCommitRowTooltip(nodes: GraphNode[]) {
  const id = useId();
  const [active, setActive] = useState<Target | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cancelTimer = useCallback(() => clearTimeout(timer.current), []);
  const dismiss = useCallback(() => {
    cancelTimer();
    setActive(null);
  }, [cancelTimer]);
  const show = (anchor: HTMLDivElement, hash: string, immediate = false) => {
    cancelTimer();
    if (!hasHiddenInformation(anchor)) {
      setActive(null);
      return;
    }
    const open = () => {
      if (anchor.isConnected && hasHiddenInformation(anchor)) setActive({ hash, anchor });
    };
    if (immediate) open();
    else {
      setActive((previous) => (previous?.hash === hash ? previous : null));
      timer.current = setTimeout(open, 250);
    }
  };
  const leave = (anchor?: HTMLDivElement) => {
    cancelTimer();
    if (anchor?.contains(document.activeElement)) return;
    timer.current = setTimeout(() => setActive(null), 150);
  };

  useEffect(() => {
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && document.getElementById(id)?.contains(event.target)) return;
      dismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelTimer();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [cancelTimer, dismiss, id]);

  const node = active?.anchor.isConnected ? nodes.find((item) => item.commit.hash === active.hash) : undefined;
  return { id, target: node && active ? { ...active, node } : null, show, leave, dismiss, keepOpen: cancelTimer };
}
