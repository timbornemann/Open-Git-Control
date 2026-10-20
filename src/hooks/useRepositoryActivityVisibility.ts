import { useEffect, useRef, useState } from 'react';
import { repositoryActivityDemand } from '@/data/repositoryActivityDemand';

/** Observe the current rows without creating a status reader or a polling timer. */
export function useRepositoryActivityVisibility<T extends HTMLElement>(paths: readonly string[]) {
  const root = useRef<T>(null);
  const [owner] = useState(() => Symbol('repository activity visibility'));
  const membership = JSON.stringify([...paths].sort());

  useEffect(() => {
    const rows = root.current?.querySelectorAll<HTMLElement>('[data-repository-activity-path]');
    if (!rows) return;
    let active = true;
    const visible = new Set<Element>();
    const publish = () =>
      repositoryActivityDemand.setVisible(
        owner,
        [...visible].map((row) => (row as HTMLElement).dataset.repositoryActivityPath || ''),
      );
    if (typeof IntersectionObserver === 'undefined') {
      for (const row of rows) visible.add(row);
      publish();
      return () => repositoryActivityDemand.remove(owner);
    }
    const observed = new Set<Element>(rows);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active) return;
        for (const entry of entries) {
          if (!observed.has(entry.target)) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.01) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        publish();
      },
      { root: null, rootMargin: '0px', threshold: 0.01 },
    );
    for (const row of rows) observer.observe(row);
    return () => {
      active = false;
      observer.disconnect();
      repositoryActivityDemand.remove(owner);
    };
  }, [owner, membership]);

  return root;
}
