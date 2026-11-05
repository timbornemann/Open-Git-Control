import { useLayoutEffect, useState, type RefObject } from 'react';
const margin = 8;
/** Clamp menus to the owning viewport, including embedded workspaces. */
export function useWorkingDirectoryMenuPlacement(context: { x: number; y: number } | null, ref: RefObject<HTMLDivElement | null>) {
  const [placement, setPlacement] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!context) return;
    const menu = ref.current;
    const boundary = menu?.closest<HTMLElement>('[data-overlay-boundary]');
    const update = () => {
      const bounds = boundary?.getBoundingClientRect() || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const width = menu?.offsetWidth || 210,
        height = menu?.offsetHeight || 280;
      const next = {
        left: Math.max(bounds.left + margin, Math.min(context.x, bounds.right - width - margin)),
        top: Math.max(bounds.top + margin, Math.min(context.y, bounds.bottom - height - margin)),
      };
      setPlacement((current) => (current.left === next.left && current.top === next.top ? current : next));
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (menu) observer?.observe(menu);
    if (boundary) observer?.observe(boundary);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [context, ref]);
  return placement;
}
