import { useEffect, useState } from 'react';

const sameBox = (first: DOMRect | null, second: DOMRect | null) =>
  first === second ||
  Boolean(first && second && first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height);
const visible = (element: HTMLElement) => element.getClientRects().length > 0;

export function useTutorialTarget(target: string) {
  const [bounds, setBounds] = useState<{ rect: DOMRect | null; workspace: DOMRect | null }>({ rect: null, workspace: null });
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let element: HTMLElement | null = null;
    let previousDescription: string | null = null;
    const workspace = document.querySelector<HTMLElement>('.tutorial-workspace');
    const restoreDescription = () => {
      if (element) previousDescription === null ? element.removeAttribute('aria-describedby') : element.setAttribute('aria-describedby', previousDescription);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    if (workspace) resize.observe(workspace);
    function update() {
      frame = 0;
      // Exercises can open a dialog or menu. Keep that active surface clear
      // while the original step and its completion condition stay in effect.
      const surfaces = [
        ...document.querySelectorAll<HTMLElement>(
          '.tutorial-workspace [role="dialog"], .tutorial-workspace [role="menu"], .tutorial-workspace .topbar-dropdown, .tutorial-workspace .commit-search-toolbar__more-menu',
        ),
      ].filter(visible);
      const next = surfaces.at(-1) || [...document.querySelectorAll<HTMLElement>(target)].find(visible) || null;
      if (next !== element) {
        restoreDescription();
        if (element) resize.unobserve(element);
        element = next;
        if (element) {
          previousDescription = element.getAttribute('aria-describedby');
          element.setAttribute('aria-describedby', 'tutorial-step-description');
          resize.observe(element);
          element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        }
      }
      const rect = element?.getBoundingClientRect() ?? null;
      const area = workspace?.getBoundingClientRect() ?? null;
      setBounds((current) => (sameBox(current.rect, rect) && sameBox(current.workspace, area) ? current : { rect, workspace: area }));
      if (rect && rect.width > 0 && rect.height > 0) {
        setMissing(false);
        clearTimeout(timer);
        timer = undefined;
      } else if (!timer) timer = setTimeout(() => setMissing(true), 5000);
    }
    setMissing(false);
    setBounds({ rect: null, workspace: null });
    const observer = new MutationObserver(schedule);
    if (workspace)
      observer.observe(workspace, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-hidden'] });
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      observer.disconnect();
      resize.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      restoreDescription();
    };
  }, [target]);
  return { ...bounds, missing };
}
